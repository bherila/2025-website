<?php

namespace App\Services\Finance\CapitalGains;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinLotReconciliationLink;
use App\Models\FinanceTool\TaxDocumentAccount;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * Read-only diagnostics that compare parsed 1099-B entries with imported lots.
 *
 * Diagnostic severities:
 * - error: account_link_missing, parsed_entry_unlinked, lot_count_mismatch,
 *   wash_total_mismatch, proceeds_mismatch, basis_mismatch, gain_mismatch,
 *   missing_summary_adjustment.
 * - warning: box_unset, treatment_unknown. Unknown wash-sale treatment stays a
 *   warning because the totals can still reconcile after importer normalization,
 *   but the broker semantics should be reviewed by a human.
 * - info: reserved for future non-drift observations.
 */
class LotReconciliationService
{
    private const MONEY_TOLERANCE = 0.02;

    /**
     * @var array<string, string>
     */
    private const SEVERITY_BY_REASON = [
        'account_link_missing' => 'error',
        'parsed_entry_unlinked' => 'error',
        'lot_count_mismatch' => 'error',
        'wash_total_mismatch' => 'error',
        'proceeds_mismatch' => 'error',
        'basis_mismatch' => 'error',
        'gain_mismatch' => 'error',
        'missing_summary_adjustment' => 'error',
        'box_unset' => 'warning',
        'treatment_unknown' => 'warning',
    ];

    public function __construct(
        private readonly BrokerWashSaleTreatmentNormalizer $washSaleTreatmentNormalizer,
        private readonly WashSaleAdjustmentSynthesizer $washSaleAdjustmentSynthesizer,
    ) {}

    public function reconcileTaxDocument(int $taxDocumentId): TaxDocumentReconciliationReport
    {
        /** @var FileForTaxDocument $taxDocument */
        $taxDocument = FileForTaxDocument::query()
            ->with(['accountLinks.account'])
            ->findOrFail($taxDocumentId);

        return $this->reportForDocument(
            $taxDocument,
            $this->linkStateCountsForDocument((int) $taxDocument->id),
        );
    }

    public function reconcileYear(int $userId, int $year): YearReconciliationReport
    {
        $documents = FileForTaxDocument::query()
            ->where('user_id', $userId)
            ->where('tax_year', $year)
            ->where(function (Builder $query): void {
                $query->whereIn('form_type', ['1099_b', 'broker_1099'])
                    ->orWhereHas('accountLinks', function (Builder $linkQuery): void {
                        $linkQuery->where('form_type', '1099_b');
                    });
            })
            ->with(['accountLinks.account'])
            ->orderBy('id')
            ->get();

        $linkStateCounts = $this->linkStateCountsByDocumentIds(
            $documents
                ->pluck('id')
                ->map(static fn (int|string $documentId): int => (int) $documentId)
                ->all(),
        );

        $reports = $documents
            ->map(fn (FileForTaxDocument $document): array => $this->reportForDocument(
                $document,
                $linkStateCounts[(int) $document->id] ?? $this->emptyLinkStateCounts(),
            )->toArray())
            ->values()
            ->all();

        return new YearReconciliationReport([
            'user_id' => $userId,
            'tax_year' => $year,
            'summary' => $this->yearSummary($reports),
            'documents' => $reports,
        ]);
    }

    /**
     * @param  array<string, int>  $linkStateCounts
     */
    private function reportForDocument(FileForTaxDocument $taxDocument, array $linkStateCounts): TaxDocumentReconciliationReport
    {
        $entries = $this->parsed1099BEntries($taxDocument);
        $lots = $this->lotsForDocument((int) $taxDocument->id);
        $usedLinkIds = [];
        $entryReports = [];
        $diagnostics = [];

        foreach ($entries as $entry) {
            $entryReport = $this->entryReport($taxDocument, $entry, $lots, $usedLinkIds);
            $entryReports[] = $entryReport;

            foreach ($entryReport['diagnostics'] as $diagnostic) {
                if (is_array($diagnostic)) {
                    $diagnostics[] = $diagnostic;
                }
            }
        }

        // TODO: Add an account_only diagnostic for lots linked to this document
        // when there is no corresponding parsed 1099-B entry.
        $summary = $this->documentSummary($entryReports, $diagnostics, $lots->count());
        $dashboardStatus = $this->dashboardStatus((string) $summary['status'], $linkStateCounts);

        return new TaxDocumentReconciliationReport([
            'tax_document_id' => (int) $taxDocument->id,
            'broker' => $this->brokerName($taxDocument, $entries),
            'tax_year' => (int) $taxDocument->tax_year,
            'form_type' => (string) $taxDocument->form_type,
            'status' => $summary['status'],
            'dashboard_status' => $dashboardStatus,
            'link_state_counts' => $linkStateCounts,
            'summary' => $summary,
            'diagnostics' => $diagnostics,
            'entries' => $entryReports,
        ]);
    }

    /**
     * @param  array<string, mixed>  $entry
     * @param  Collection<int, FinAccountLot>  $documentLots
     * @param  array<int, true>  $usedLinkIds
     * @return array<string, mixed>
     */
    private function entryReport(
        FileForTaxDocument $taxDocument,
        array $entry,
        Collection $documentLots,
        array &$usedLinkIds,
    ): array {
        $link = $this->matchAccountLink($taxDocument, $entry, $usedLinkIds);
        if ($link instanceof TaxDocumentAccount) {
            $usedLinkIds[(int) $link->id] = true;
        }

        $accountId = $this->resolvedAccountId($taxDocument, $link);
        $entryLots = $accountId !== null
            ? $documentLots->filter(fn (FinAccountLot $lot): bool => (int) $lot->acct_id === $accountId)->values()
            : collect();

        $parsedData = $this->arrayValue($entry['parsed_data'] ?? null);
        $parsedTransactions = $this->parsedTransactions($parsedData);
        $defaultWashSaleTreatment = $this->washSaleAdjustmentSynthesizer->washSaleTreatmentFromParsedData($parsedData);
        $syntheticTransactions = $this->washSaleAdjustmentSynthesizer->summaryWashSaleAdjustmentTransactions(
            $parsedTransactions,
            $parsedData,
            $defaultWashSaleTreatment,
        );
        $expectedTransactions = array_merge($parsedTransactions, $syntheticTransactions);

        $parsedTotals = $this->parsedTotals($parsedData, $expectedTransactions, $defaultWashSaleTreatment);
        $lotTotals = $this->lotTotals($entryLots);
        $deltas = $this->deltas($parsedTotals, $lotTotals);
        $parsedBoxes = $this->parsedForm8949Boxes($parsedData, $parsedTransactions);
        $lotBoxes = $this->lotForm8949Boxes($entryLots);
        $washSaleTreatments = $this->washSaleTreatments($parsedData, $parsedTransactions);
        $syntheticLotCount = $this->syntheticWashSaleLotCount($entryLots);

        $diagnostics = $this->entryDiagnostics(
            entry: $entry,
            link: $link,
            accountId: $accountId,
            entryLots: $entryLots,
            parsedTransactions: $parsedTransactions,
            expectedTransactions: $expectedTransactions,
            syntheticTransactions: $syntheticTransactions,
            syntheticLotCount: $syntheticLotCount,
            parsedData: $parsedData,
            parsedTotals: $parsedTotals,
            lotTotals: $lotTotals,
            deltas: $deltas,
            parsedBoxes: $parsedBoxes,
            washSaleTreatments: $washSaleTreatments,
        );

        return [
            'entry_index' => (int) $entry['entry_index'],
            'tax_document_account_id' => $link instanceof TaxDocumentAccount ? (int) $link->id : null,
            'account_id' => $accountId,
            'account_name' => $this->accountName($taxDocument, $link, $entry),
            'account_identifier' => $this->stringValue($entry['account_identifier'] ?? null),
            'form_type' => '1099_b',
            'tax_year' => (int) ($entry['tax_year'] ?? $taxDocument->tax_year),
            'status' => $this->statusForDiagnostics($diagnostics),
            'summary' => [
                'parsed_transaction_count' => count($parsedTransactions),
                'synthetic_adjustment_expected_count' => count($syntheticTransactions),
                'expected_lot_count' => count($expectedTransactions),
                'broker_lot_count' => $entryLots->count(),
                'synthetic_adjustment_lot_count' => $syntheticLotCount,
                'parsed_totals' => $parsedTotals,
                'lot_totals' => $lotTotals,
                'deltas' => $deltas,
                'max_delta' => $this->maxDelta($deltas),
                'form_8949_boxes' => [
                    'parsed_data' => $parsedBoxes,
                    'fin_account_lots' => $lotBoxes,
                ],
                'wash_sale_treatments' => $washSaleTreatments,
            ],
            'diagnostics' => $diagnostics,
        ];
    }

    /**
     * @param  array<string, mixed>  $entry
     * @param  Collection<int, FinAccountLot>  $entryLots
     * @param  array<int, array<string, mixed>>  $parsedTransactions
     * @param  array<int, array<string, mixed>>  $expectedTransactions
     * @param  array<int, array<string, mixed>>  $syntheticTransactions
     * @param  array<string, mixed>  $parsedData
     * @param  array<string, float>  $parsedTotals
     * @param  array<string, float>  $lotTotals
     * @param  array<string, float>  $deltas
     * @param  list<string>  $parsedBoxes
     * @param  list<string>  $washSaleTreatments
     * @return array<int, array<string, mixed>>
     */
    private function entryDiagnostics(
        array $entry,
        ?TaxDocumentAccount $link,
        ?int $accountId,
        Collection $entryLots,
        array $parsedTransactions,
        array $expectedTransactions,
        array $syntheticTransactions,
        int $syntheticLotCount,
        array $parsedData,
        array $parsedTotals,
        array $lotTotals,
        array $deltas,
        array $parsedBoxes,
        array $washSaleTreatments,
    ): array {
        $diagnostics = [];
        $entryIndex = (int) $entry['entry_index'];
        $linkId = $link instanceof TaxDocumentAccount ? (int) $link->id : null;

        if ($accountId === null) {
            $diagnostics[] = $this->diagnostic('account_link_missing', $entryIndex, $linkId, [
                'account_identifier' => $this->stringValue($entry['account_identifier'] ?? null),
                'account_name' => $this->stringValue($entry['account_name'] ?? null),
            ]);
        } elseif ($entryLots->isEmpty()) {
            $diagnostics[] = $this->diagnostic('parsed_entry_unlinked', $entryIndex, $linkId, [
                'account_id' => $accountId,
            ]);
        }

        if ($entryLots->count() !== count($expectedTransactions)) {
            $diagnostics[] = $this->diagnostic('lot_count_mismatch', $entryIndex, $linkId, [
                'expected' => count($expectedTransactions),
                'actual' => $entryLots->count(),
            ]);
        }

        if ($this->summaryWashSaleTotal($parsedData) !== null && abs($deltas['wash_sale_disallowed']) > self::MONEY_TOLERANCE) {
            $diagnostics[] = $this->diagnostic('wash_total_mismatch', $entryIndex, $linkId, [
                'expected' => $parsedTotals['wash_sale_disallowed'],
                'actual' => $lotTotals['wash_sale_disallowed'],
                'delta' => $deltas['wash_sale_disallowed'],
            ]);
        }

        foreach ([
            'proceeds' => 'proceeds_mismatch',
            'cost_basis' => 'basis_mismatch',
            'realized_gain_loss' => 'gain_mismatch',
        ] as $field => $code) {
            if (abs($deltas[$field]) > self::MONEY_TOLERANCE) {
                $diagnostics[] = $this->diagnostic($code, $entryIndex, $linkId, [
                    'expected' => $parsedTotals[$field],
                    'actual' => $lotTotals[$field],
                    'delta' => $deltas[$field],
                ]);
            }
        }

        if ($syntheticTransactions !== [] && $syntheticLotCount < count($syntheticTransactions)) {
            $diagnostics[] = $this->diagnostic('missing_summary_adjustment', $entryIndex, $linkId, [
                'expected' => count($syntheticTransactions),
                'actual' => $syntheticLotCount,
            ]);
        }

        if ($parsedBoxes !== [] && $this->hasBlankForm8949Box($entryLots)) {
            $diagnostics[] = $this->diagnostic('box_unset', $entryIndex, $linkId, [
                'parsed_boxes' => $parsedBoxes,
            ]);
        }

        if ($this->parsedWashSalePresent($parsedData, $parsedTransactions) && in_array(BrokerWashSaleTreatmentNormalizer::TREATMENT_UNKNOWN, $washSaleTreatments, true)) {
            $diagnostics[] = $this->diagnostic('treatment_unknown', $entryIndex, $linkId, [
                'wash_sale_treatments' => $washSaleTreatments,
            ]);
        }

        return $diagnostics;
    }

    /**
     * @return Collection<int, FinAccountLot>
     */
    private function lotsForDocument(int $taxDocumentId): Collection
    {
        return FinAccountLot::query()
            ->where('tax_document_id', $taxDocumentId)
            ->with('account')
            ->orderBy('acct_id')
            ->orderBy('sale_date')
            ->orderBy('lot_id')
            ->get();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function parsed1099BEntries(FileForTaxDocument $taxDocument): array
    {
        $data = $taxDocument->parsed_data;
        if (! is_array($data) || $data === []) {
            return [];
        }

        if (array_is_list($data)) {
            $entries = [];
            foreach ($data as $index => $entry) {
                if (! is_array($entry) || (string) ($entry['form_type'] ?? '') !== '1099_b') {
                    continue;
                }

                $entries[] = [
                    'entry_index' => $index,
                    'account_identifier' => $this->stringValue($entry['account_identifier'] ?? null),
                    'account_name' => $this->stringValue($entry['account_name'] ?? null),
                    'form_type' => '1099_b',
                    'tax_year' => (int) ($entry['tax_year'] ?? $taxDocument->tax_year),
                    'parsed_data' => $this->arrayValue($entry['parsed_data'] ?? null),
                ];
            }

            return $entries;
        }

        if ($this->stringValue($taxDocument->getAttribute('form_type')) !== '1099_b') {
            return [];
        }

        $parsedData = $this->arrayValue($data);

        return [[
            'entry_index' => 0,
            'account_identifier' => null,
            'account_name' => null,
            'form_type' => '1099_b',
            'tax_year' => (int) $taxDocument->tax_year,
            'parsed_data' => $parsedData,
        ]];
    }

    /**
     * @param  array<string, mixed>  $entry
     * @param  array<int, true>  $usedLinkIds
     */
    private function matchAccountLink(FileForTaxDocument $taxDocument, array $entry, array $usedLinkIds): ?TaxDocumentAccount
    {
        $links = [];
        foreach ($taxDocument->accountLinks as $link) {
            if ($link instanceof TaxDocumentAccount && $link->form_type === '1099_b' && ! isset($usedLinkIds[(int) $link->id])) {
                $links[] = $link;
            }
        }

        if ($links === []) {
            return null;
        }

        $entryIdentifier = $this->normalizedString($entry['account_identifier'] ?? null);
        if ($entryIdentifier !== null) {
            foreach ($links as $link) {
                if ($this->normalizedString($link->ai_identifier) === $entryIdentifier) {
                    return $link;
                }
            }
        }

        $entryName = $this->normalizedString($entry['account_name'] ?? null);
        if ($entryName !== null) {
            foreach ($links as $link) {
                if ($this->normalizedString($link->ai_account_name) === $entryName) {
                    return $link;
                }
            }
        }

        $taxYear = (int) ($entry['tax_year'] ?? $taxDocument->tax_year);
        foreach ($links as $link) {
            if ((int) $link->tax_year === $taxYear) {
                return $link;
            }
        }

        return $links[0];
    }

    private function resolvedAccountId(FileForTaxDocument $taxDocument, ?TaxDocumentAccount $link): ?int
    {
        if ($link instanceof TaxDocumentAccount && $link->account_id !== null) {
            return (int) $link->account_id;
        }

        $documentAccountId = $taxDocument->getAttribute('account_id');

        return is_numeric($documentAccountId) ? (int) $documentAccountId : null;
    }

    /**
     * @param  array<string, mixed>  $parsedData
     * @return array<int, array<string, mixed>>
     */
    private function parsedTransactions(array $parsedData): array
    {
        $transactions = $parsedData['transactions'] ?? [];
        if (! is_array($transactions)) {
            return [];
        }

        return array_values(array_filter(
            $transactions,
            static fn (mixed $transaction): bool => is_array($transaction),
        ));
    }

    /**
     * @param  array<string, mixed>  $parsedData
     * @param  array<int, array<string, mixed>>  $transactions
     * @return array<string, float>
     */
    private function parsedTotals(array $parsedData, array $transactions, ?string $defaultWashSaleTreatment): array
    {
        $transactionTotals = $this->transactionTotals($transactions, $defaultWashSaleTreatment);
        $summaryTotals = $this->summaryTotals($parsedData);

        return [
            'proceeds' => $summaryTotals['proceeds'] ?? $transactionTotals['proceeds'],
            'cost_basis' => $summaryTotals['cost_basis'] ?? $transactionTotals['cost_basis'],
            'wash_sale_disallowed' => $summaryTotals['wash_sale_disallowed'] ?? $transactionTotals['wash_sale_disallowed'],
            'realized_gain_loss' => $summaryTotals['realized_gain_loss'] ?? $transactionTotals['realized_gain_loss'],
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $transactions
     * @return array<string, float>
     */
    private function transactionTotals(array $transactions, ?string $defaultWashSaleTreatment): array
    {
        $totals = $this->emptyMoneyTotals();

        foreach ($transactions as $transaction) {
            $proceeds = $this->numericValue($transaction['proceeds'] ?? null) ?? 0.0;
            $costBasis = $this->numericValue($transaction['cost_basis'] ?? null) ?? 0.0;
            $washSaleDisallowed = $this->numericValue($transaction['wash_sale_disallowed'] ?? null) ?? 0.0;
            $reportedGainLoss = $this->numericValue($transaction['realized_gain_loss'] ?? null);
            $amounts = $this->washSaleTreatmentNormalizer->normalizeAmounts(
                proceeds: $proceeds,
                costBasis: $costBasis,
                reportedGainLoss: $reportedGainLoss,
                washSaleDisallowed: $washSaleDisallowed,
                treatment: $transaction['wash_sale_treatment'] ?? $defaultWashSaleTreatment,
            );

            $totals['proceeds'] += $proceeds;
            $totals['cost_basis'] += $costBasis;
            $totals['wash_sale_disallowed'] += $amounts['wash_sale_disallowed'];
            $totals['realized_gain_loss'] += $amounts['realized_gain_loss'];
        }

        return $this->roundTotals($totals);
    }

    /**
     * @param  Collection<int, FinAccountLot>  $lots
     * @return array<string, float>
     */
    private function lotTotals(Collection $lots): array
    {
        $totals = $this->emptyMoneyTotals();

        foreach ($lots as $lot) {
            $totals['proceeds'] += (float) ($lot->proceeds ?? 0);
            $totals['cost_basis'] += (float) ($lot->cost_basis ?? 0);
            $totals['wash_sale_disallowed'] += (float) ($lot->wash_sale_disallowed ?? 0);
            $totals['realized_gain_loss'] += (float) ($lot->realized_gain_loss ?? 0);
        }

        return $this->roundTotals($totals);
    }

    /**
     * @param  array<string, float>  $parsedTotals
     * @param  array<string, float>  $lotTotals
     * @return array<string, float>
     */
    private function deltas(array $parsedTotals, array $lotTotals): array
    {
        return [
            'proceeds' => round($lotTotals['proceeds'] - $parsedTotals['proceeds'], 4),
            'cost_basis' => round($lotTotals['cost_basis'] - $parsedTotals['cost_basis'], 4),
            'wash_sale_disallowed' => round($lotTotals['wash_sale_disallowed'] - $parsedTotals['wash_sale_disallowed'], 4),
            'realized_gain_loss' => round($lotTotals['realized_gain_loss'] - $parsedTotals['realized_gain_loss'], 4),
        ];
    }

    /**
     * @param  array<string, mixed>  $parsedData
     * @return array<string, float|null>
     */
    private function summaryTotals(array $parsedData): array
    {
        return [
            'proceeds' => $this->numericFromFirstKey($parsedData, ['total_proceeds'])
                ?? $this->sumSummarySections($parsedData, ['total_proceeds', 'proceeds']),
            'cost_basis' => $this->numericFromFirstKey($parsedData, ['total_cost_basis'])
                ?? $this->sumSummarySections($parsedData, ['total_cost_basis', 'cost_basis']),
            'wash_sale_disallowed' => $this->summaryWashSaleTotal($parsedData),
            'realized_gain_loss' => $this->numericFromFirstKey($parsedData, ['total_realized_gain_loss'])
                ?? $this->sumSummarySections($parsedData, ['total_realized_gain_loss', 'realized_gain_loss']),
        ];
    }

    /**
     * @return array<string, float>
     */
    private function emptyMoneyTotals(): array
    {
        return [
            'proceeds' => 0.0,
            'cost_basis' => 0.0,
            'wash_sale_disallowed' => 0.0,
            'realized_gain_loss' => 0.0,
        ];
    }

    /**
     * @param  array<string, float>  $totals
     * @return array<string, float>
     */
    private function roundTotals(array $totals): array
    {
        foreach ($totals as $key => $value) {
            $totals[$key] = round($value, 4);
        }

        return $totals;
    }

    /**
     * @param  array<string, mixed>  $parsedData
     */
    private function summaryWashSaleTotal(array $parsedData): ?float
    {
        return $this->numericFromFirstKey($parsedData, ['total_wash_sale_disallowed', 'total_wash_sales'])
            ?? $this->sumSummarySections($parsedData, ['total_wash_sales', 'total_wash_sale_disallowed']);
    }

    /**
     * @param  array<string, mixed>  $parsedData
     * @param  list<string>  $keys
     */
    private function sumSummarySections(array $parsedData, array $keys): ?float
    {
        $sections = $parsedData['summary']['sections'] ?? null;
        if (! is_array($sections)) {
            return null;
        }

        $sum = 0.0;
        $found = false;

        foreach ($sections as $section) {
            if (! is_array($section)) {
                continue;
            }

            $value = $this->numericFromFirstKey($section, $keys);
            if ($value !== null) {
                $sum += $value;
                $found = true;
            }
        }

        return $found ? round($sum, 4) : null;
    }

    /**
     * @param  array<string, mixed>  $parsedData
     * @param  array<int, array<string, mixed>>  $transactions
     * @return list<string>
     */
    private function parsedForm8949Boxes(array $parsedData, array $transactions): array
    {
        $boxes = [];

        foreach ($transactions as $transaction) {
            $box = $this->washSaleAdjustmentSynthesizer->form8949Box($transaction['form_8949_box'] ?? null);
            if ($box !== null) {
                $boxes[$box] = true;
            }
        }

        foreach ($this->washSaleAdjustmentSynthesizer->summarySectionsByForm8949Box($parsedData) as $box => $_section) {
            $boxes[$box] = true;
        }

        return array_keys($boxes);
    }

    /**
     * @param  Collection<int, FinAccountLot>  $lots
     * @return list<string>
     */
    private function lotForm8949Boxes(Collection $lots): array
    {
        $boxes = [];

        foreach ($lots as $lot) {
            $box = $this->washSaleAdjustmentSynthesizer->form8949Box($lot->form_8949_box);
            if ($box !== null) {
                $boxes[$box] = true;
            }
        }

        return array_keys($boxes);
    }

    /**
     * @param  array<string, mixed>  $parsedData
     * @param  array<int, array<string, mixed>>  $transactions
     * @return list<string>
     */
    private function washSaleTreatments(array $parsedData, array $transactions): array
    {
        $treatments = [];
        foreach ([
            $parsedData['wash_sale_treatment'] ?? null,
            $parsedData['wash_sale_basis_treatment'] ?? null,
            $parsedData['extraction_notes']['wash_sale_treatment'] ?? null,
        ] as $candidate) {
            if ($candidate !== null) {
                $treatments[$this->washSaleTreatmentNormalizer->normalizeTreatment($candidate)] = true;
            }
        }

        foreach ($transactions as $transaction) {
            if (array_key_exists('wash_sale_treatment', $transaction)) {
                $treatments[$this->washSaleTreatmentNormalizer->normalizeTreatment($transaction['wash_sale_treatment'])] = true;
            }
        }

        if ($treatments === [] && $this->parsedWashSalePresent($parsedData, $transactions)) {
            $treatments[BrokerWashSaleTreatmentNormalizer::TREATMENT_UNKNOWN] = true;
        }

        return array_keys($treatments);
    }

    /**
     * @param  array<string, mixed>  $parsedData
     * @param  array<int, array<string, mixed>>  $transactions
     */
    private function parsedWashSalePresent(array $parsedData, array $transactions): bool
    {
        $summaryWashSale = $this->summaryWashSaleTotal($parsedData);
        if ($summaryWashSale !== null && abs($summaryWashSale) > self::MONEY_TOLERANCE) {
            return true;
        }

        foreach ($transactions as $transaction) {
            if (abs($this->numericValue($transaction['wash_sale_disallowed'] ?? null) ?? 0.0) > self::MONEY_TOLERANCE) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  Collection<int, FinAccountLot>  $lots
     */
    private function syntheticWashSaleLotCount(Collection $lots): int
    {
        return $lots
            ->filter(fn (FinAccountLot $lot): bool => strtoupper((string) $lot->symbol) === 'WASHSALEADJ')
            ->count();
    }

    /**
     * @param  Collection<int, FinAccountLot>  $lots
     */
    private function hasBlankForm8949Box(Collection $lots): bool
    {
        return $lots->contains(fn (FinAccountLot $lot): bool => trim((string) $lot->form_8949_box) === '');
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  list<string>  $keys
     */
    private function numericFromFirstKey(array $data, array $keys): ?float
    {
        foreach ($keys as $key) {
            if (is_numeric($data[$key] ?? null)) {
                return (float) $data[$key];
            }
        }

        return null;
    }

    private function numericValue(mixed $value): ?float
    {
        return is_numeric($value) ? (float) $value : null;
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    private function diagnostic(string $code, int $entryIndex, ?int $linkId, array $context = []): array
    {
        return array_merge([
            'code' => $code,
            'severity' => self::SEVERITY_BY_REASON[$code] ?? 'info',
            'entry_index' => $entryIndex,
            'tax_document_account_id' => $linkId,
            'message' => $this->diagnosticMessage($code),
        ], $context);
    }

    private function diagnosticMessage(string $code): string
    {
        return match ($code) {
            'account_link_missing' => 'Parsed 1099-B entry did not resolve to a finance account.',
            'parsed_entry_unlinked' => 'Parsed 1099-B entry has an account but no imported lots for this tax document.',
            'lot_count_mismatch' => 'Imported lot count does not match parsed transaction count after synthetic adjustment synthesis.',
            'wash_total_mismatch' => 'Imported wash-sale total does not match parsed summary total.',
            'proceeds_mismatch' => 'Imported proceeds total does not match parsed 1099-B total.',
            'basis_mismatch' => 'Imported cost basis total does not match parsed 1099-B total.',
            'gain_mismatch' => 'Imported gain/loss total does not match parsed 1099-B total.',
            'missing_summary_adjustment' => 'Parsed summary requires a synthetic wash-sale adjustment lot that is missing from imported lots.',
            'box_unset' => 'Parsed data specifies Form 8949 boxes, but at least one imported lot has no box.',
            'treatment_unknown' => 'Wash sale is present, but parsed wash-sale treatment is unknown.',
            default => 'Lot reconciliation diagnostic.',
        };
    }

    /**
     * @param  array<int, array<string, mixed>>  $entryReports
     * @param  array<int, array<string, mixed>>  $diagnostics
     * @return array<string, mixed>
     */
    private function documentSummary(array $entryReports, array $diagnostics, int $brokerLotCount): array
    {
        $severityCounts = $this->severityCounts($diagnostics);
        $reasonCounts = $this->reasonCounts($diagnostics);
        $maxDelta = 0.0;
        $expectedLotCount = 0;

        foreach ($entryReports as $entryReport) {
            $summary = $entryReport['summary'] ?? [];
            if (is_array($summary)) {
                $maxDelta = max($maxDelta, (float) ($summary['max_delta'] ?? 0.0));
                $expectedLotCount += (int) ($summary['expected_lot_count'] ?? 0);
            }
        }

        return [
            'status' => $this->statusFromSeverityCounts($severityCounts),
            'entry_count' => count($entryReports),
            'expected_lot_count' => $expectedLotCount,
            'broker_lot_count' => $brokerLotCount,
            'diagnostics_count' => count($diagnostics),
            'by_severity' => $severityCounts,
            'by_reason' => $reasonCounts,
            'max_delta' => round($maxDelta, 4),
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $documents
     * @return array<string, mixed>
     */
    private function yearSummary(array $documents): array
    {
        $diagnostics = [];
        $entryCount = 0;
        $brokerLotCount = 0;
        $expectedLotCount = 0;
        $maxDelta = 0.0;
        $documentsByStatus = [
            'in_sync' => 0,
            'needs_review' => 0,
            'drift' => 0,
        ];

        foreach ($documents as $document) {
            foreach (($document['diagnostics'] ?? []) as $diagnostic) {
                if (is_array($diagnostic)) {
                    $diagnostics[] = $diagnostic;
                }
            }

            $summary = $document['summary'] ?? [];
            if (is_array($summary)) {
                $entryCount += (int) ($summary['entry_count'] ?? 0);
                $brokerLotCount += (int) ($summary['broker_lot_count'] ?? 0);
                $expectedLotCount += (int) ($summary['expected_lot_count'] ?? 0);
                $maxDelta = max($maxDelta, (float) ($summary['max_delta'] ?? 0.0));
            }

            $dashboardStatus = (string) ($document['dashboard_status'] ?? 'in_sync');
            if (array_key_exists($dashboardStatus, $documentsByStatus)) {
                $documentsByStatus[$dashboardStatus]++;
            }
        }

        $severityCounts = $this->severityCounts($diagnostics);

        return [
            'status' => $this->statusFromSeverityCounts($severityCounts),
            'dashboard_status' => $this->statusFromDocumentsByStatus($documentsByStatus),
            'document_count' => count($documents),
            'documents_by_status' => $documentsByStatus,
            'entry_count' => $entryCount,
            'expected_lot_count' => $expectedLotCount,
            'broker_lot_count' => $brokerLotCount,
            'diagnostics_count' => count($diagnostics),
            'by_severity' => $severityCounts,
            'by_reason' => $this->reasonCounts($diagnostics),
            'max_delta' => round($maxDelta, 4),
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $diagnostics
     * @return array{info: int, warning: int, error: int}
     */
    private function severityCounts(array $diagnostics): array
    {
        $counts = ['info' => 0, 'warning' => 0, 'error' => 0];

        foreach ($diagnostics as $diagnostic) {
            $severity = $diagnostic['severity'] ?? 'info';
            if (isset($counts[$severity])) {
                $counts[$severity]++;
            }
        }

        return $counts;
    }

    /**
     * @param  array<int, array<string, mixed>>  $diagnostics
     * @return array<string, int>
     */
    private function reasonCounts(array $diagnostics): array
    {
        $counts = [];

        foreach ($diagnostics as $diagnostic) {
            $code = (string) ($diagnostic['code'] ?? 'unknown');
            $counts[$code] = ($counts[$code] ?? 0) + 1;
        }

        ksort($counts);

        return $counts;
    }

    /**
     * @param  array<int, array<string, mixed>>  $diagnostics
     */
    private function statusForDiagnostics(array $diagnostics): string
    {
        return $this->statusFromSeverityCounts($this->severityCounts($diagnostics));
    }

    /**
     * @param  array{info: int, warning: int, error: int}  $severityCounts
     */
    private function statusFromSeverityCounts(array $severityCounts): string
    {
        if ($severityCounts['error'] > 0) {
            return 'error';
        }

        if ($severityCounts['warning'] > 0) {
            return 'warning';
        }

        if ($severityCounts['info'] > 0) {
            return 'info';
        }

        return 'ok';
    }

    /**
     * @param  array<string, int>  $linkStateCounts
     */
    private function dashboardStatus(string $diagnosticStatus, array $linkStateCounts): string
    {
        if ($diagnosticStatus === 'error') {
            return 'drift';
        }

        if ($diagnosticStatus === 'warning' || $this->linkStateNeedsReview($linkStateCounts)) {
            return 'needs_review';
        }

        return 'in_sync';
    }

    /**
     * @param  array{in_sync: int, needs_review: int, drift: int}  $documentsByStatus
     */
    private function statusFromDocumentsByStatus(array $documentsByStatus): string
    {
        if ($documentsByStatus['drift'] > 0) {
            return 'drift';
        }

        if ($documentsByStatus['needs_review'] > 0) {
            return 'needs_review';
        }

        return 'in_sync';
    }

    /**
     * @param  array<string, int>  $linkStateCounts
     */
    private function linkStateNeedsReview(array $linkStateCounts): bool
    {
        foreach ([
            FinLotReconciliationLink::STATE_NEEDS_REVIEW,
            FinLotReconciliationLink::STATE_BROKER_ONLY,
            FinLotReconciliationLink::STATE_ACCOUNT_ONLY,
            FinLotReconciliationLink::STATE_UNLINKED,
        ] as $state) {
            if (($linkStateCounts[$state] ?? 0) > 0) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return array<string, int>
     */
    private function emptyLinkStateCounts(): array
    {
        return array_fill_keys(FinLotReconciliationLink::STATES, 0);
    }

    /**
     * @return array<string, int>
     */
    private function linkStateCountsForDocument(int $taxDocumentId): array
    {
        return $this->linkStateCountsByDocumentIds([$taxDocumentId])[$taxDocumentId]
            ?? $this->emptyLinkStateCounts();
    }

    /**
     * @param  int[]  $taxDocumentIds
     * @return array<int, array<string, int>>
     */
    private function linkStateCountsByDocumentIds(array $taxDocumentIds): array
    {
        $taxDocumentIds = array_values(array_unique($taxDocumentIds));
        if ($taxDocumentIds === []) {
            return [];
        }

        $counts = [];
        foreach ($taxDocumentIds as $taxDocumentId) {
            $counts[$taxDocumentId] = $this->emptyLinkStateCounts();
        }

        $rows = FinLotReconciliationLink::query()
            ->whereIn('tax_document_id', $taxDocumentIds)
            ->selectRaw('tax_document_id, state, COUNT(*) as aggregate')
            ->groupBy('tax_document_id', 'state')
            ->get();

        foreach ($rows as $row) {
            $taxDocumentId = (int) $row->getAttribute('tax_document_id');
            $state = (string) $row->getAttribute('state');
            $counts[$taxDocumentId][$state] = (int) $row->getAttribute('aggregate');
        }

        return $counts;
    }

    /**
     * @param  array<string, float>  $deltas
     */
    private function maxDelta(array $deltas): float
    {
        return round(max(array_map('abs', $deltas)), 4);
    }

    /**
     * @param  array<int, array<string, mixed>>  $entries
     */
    private function brokerName(FileForTaxDocument $taxDocument, array $entries): string
    {
        foreach ($entries as $entry) {
            $parsedData = $this->arrayValue($entry['parsed_data'] ?? null);
            $payerName = $this->stringValue($parsedData['payer_name'] ?? null);
            if ($payerName !== null) {
                return $payerName;
            }

            $entryAccountName = $this->stringValue($entry['account_name'] ?? null);
            if ($entryAccountName !== null) {
                return $entryAccountName;
            }
        }

        return $taxDocument->original_filename;
    }

    /**
     * @param  array<string, mixed>  $entry
     */
    private function accountName(FileForTaxDocument $taxDocument, ?TaxDocumentAccount $link, array $entry): ?string
    {
        if ($link instanceof TaxDocumentAccount) {
            $account = $link->relationLoaded('account') ? $link->getRelation('account') : null;
            if ($account instanceof FinAccounts) {
                return $account->acct_name;
            }

            if ($link->ai_account_name !== null) {
                return $link->ai_account_name;
            }
        }

        $entryAccountName = $this->stringValue($entry['account_name'] ?? null);
        if ($entryAccountName !== null) {
            return $entryAccountName;
        }

        $documentAccount = $taxDocument->relationLoaded('account') ? $taxDocument->getRelation('account') : null;

        return $documentAccount instanceof FinAccounts ? $documentAccount->acct_name : null;
    }

    /**
     * @return array<string, mixed>
     */
    private function arrayValue(mixed $value): array
    {
        return is_array($value) && ! array_is_list($value) ? $value : [];
    }

    private function stringValue(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }

    private function normalizedString(mixed $value): ?string
    {
        $string = $this->stringValue($value);
        if ($string === null) {
            return null;
        }

        return strtolower((string) preg_replace('/[^a-z0-9]+/i', '', $string));
    }
}
