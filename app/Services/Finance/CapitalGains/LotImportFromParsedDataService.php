<?php

namespace App\Services\Finance\CapitalGains;

use App\Enums\Finance\LotMatcherAutoTrigger;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\LotMatcher;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

class LotImportFromParsedDataService
{
    private const float MONEY_TOLERANCE = 0.02;

    public function __construct(
        private readonly BrokerWashSaleTreatmentNormalizer $washSaleNormalizer,
        private readonly WashSaleAdjustmentSynthesizer $washSaleAdjustmentSynthesizer,
        private readonly LotMatcher $lotMatcher,
        private readonly LotMatcherAutoDispatchService $lotMatcherAutoDispatchService,
    ) {}

    public function rebuildForDocument(
        int $documentId,
        LotMatcherAutoTrigger $trigger = LotMatcherAutoTrigger::ParsedDataRebuild,
    ): LotImportRebuildResult {
        $result = $this->rebuild($documentId, dryRun: false);

        $this->lotMatcherAutoDispatchService->dispatchForDocument($documentId, $trigger);

        return $result;
    }

    public function previewForDocument(int $documentId): LotImportRebuildResult
    {
        return $this->rebuild($documentId, dryRun: true);
    }

    public function hasUsableParsedData(FileForTaxDocument $taxDocument): bool
    {
        return $this->parsed1099BEntries($taxDocument) !== [];
    }

    /**
     * @param  array<int, mixed>  $transactions
     */
    public function importTransactions(
        int $accountId,
        array $transactions,
        int $documentId,
        mixed $defaultWashSaleTreatment = null,
    ): LotImportRebuildResult {
        $lotIds = $this->importTransactionsToLots(
            accountId: $accountId,
            transactions: $transactions,
            documentId: $documentId,
            defaultWashSaleTreatment: $defaultWashSaleTreatment,
            dryRun: false,
        );

        return new LotImportRebuildResult(
            insertedCount: count($lotIds),
            deletedCount: 0,
            warnings: [],
            lotIds: $lotIds,
        );
    }

    private function rebuild(int $documentId, bool $dryRun): LotImportRebuildResult
    {
        /** @var FileForTaxDocument $taxDocument */
        $taxDocument = FileForTaxDocument::query()
            ->with(['accountLinks.account'])
            ->where('document_id', $documentId)
            ->firstOrFail();

        $entries = $this->parsed1099BEntries($taxDocument);

        return DB::transaction(function () use ($taxDocument, $entries, $dryRun): LotImportRebuildResult {
            $legacyTaggedLotCount = $this->legacyTaggedBrokerLotsCount((int) $taxDocument->document_id);
            $deletedCount = $this->deleteExistingBrokerLots((int) $taxDocument->document_id, $dryRun);
            $insertedCount = 0;
            $warnings = $this->replacementWarnings($entries, $deletedCount, $legacyTaggedLotCount, $dryRun);
            $lotIds = [];
            $usedLinkIds = [];

            foreach ($entries as $entry) {
                $link = $this->matchAccountLink($taxDocument, $entry, $usedLinkIds);
                if ($link instanceof TaxDocumentAccount) {
                    $usedLinkIds[(int) $link->id] = true;
                }

                $accountId = $this->resolvedAccountId($taxDocument, $link);
                if ($accountId === null) {
                    $warnings[] = $this->warning($entry, 'did not resolve to a finance account; lots were not rebuilt for this entry.');

                    continue;
                }

                $parsedData = $entry['parsed_data'];
                $transactions = $this->parsedTransactions($parsedData);
                if ($transactions === []) {
                    if ($this->hasSummaryTotals($parsedData)) {
                        $warnings[] = $this->warning($entry, 'has 1099-B summary totals but no parsed transaction rows.');
                    }

                    $warnings[] = $this->warning($entry, 'has no parsed transactions; no lots were inserted for this entry.');

                    continue;
                }

                $warnings = array_merge($warnings, $this->washSaleTotalWarnings($entry, $parsedData, $transactions));
                $defaultWashSaleTreatment = $this->washSaleAdjustmentSynthesizer->washSaleTreatmentFromParsedData($parsedData);
                $transactions = $this->washSaleAdjustmentSynthesizer->appendSummaryWashSaleAdjustmentTransactions(
                    $transactions,
                    $parsedData,
                    $defaultWashSaleTreatment,
                );

                $importedLotIds = $this->importTransactionsToLots(
                    accountId: $accountId,
                    transactions: $transactions,
                    documentId: (int) $taxDocument->document_id,
                    defaultWashSaleTreatment: $defaultWashSaleTreatment,
                    dryRun: $dryRun,
                );
                $insertedCount += $dryRun ? $this->importableTransactionCount($transactions) : count($importedLotIds);
                $lotIds = array_merge($lotIds, $importedLotIds);
            }

            return new LotImportRebuildResult(
                insertedCount: $insertedCount,
                deletedCount: $deletedCount,
                warnings: array_values(array_unique($warnings)),
                lotIds: $lotIds,
                dryRun: $dryRun,
            );
        });
    }

    /**
     * @return array<int, array{entry_index: int, account_identifier: string|null, account_name: string|null, form_type: string, tax_year: int, parsed_data: array<string, mixed>}>
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
                    'parsed_data' => is_array($entry['parsed_data'] ?? null) ? $entry['parsed_data'] : [],
                ];
            }

            return $entries;
        }

        if ((string) $taxDocument->getAttribute('form_type') !== '1099_b') {
            return [];
        }

        return [[
            'entry_index' => 0,
            'account_identifier' => null,
            'account_name' => null,
            'form_type' => '1099_b',
            'tax_year' => (int) $taxDocument->tax_year,
            'parsed_data' => $data,
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

    private function deleteExistingBrokerLots(int $documentId, bool $dryRun): int
    {
        $query = $this->existingBrokerLotsQuery($documentId);
        $deletedCount = (clone $query)->count();

        if (! $dryRun) {
            $query->delete();
        }

        return $deletedCount;
    }

    private function legacyTaggedBrokerLotsCount(int $documentId): int
    {
        return (clone $this->existingBrokerLotsQuery($documentId))
            ->where(function (Builder $query): void {
                $query->whereNull('source')
                    ->orWhereNotIn('source', [
                        FinAccountLot::SOURCE_BROKER_1099B,
                        FinAccountLot::SOURCE_SYNTHETIC_ADJUSTMENT,
                    ]);
            })
            ->count();
    }

    /**
     * @return Builder<FinAccountLot>
     */
    private function existingBrokerLotsQuery(int $documentId): Builder
    {
        return FinAccountLot::query()
            ->where('document_id', $documentId)
            ->where(function (Builder $query): void {
                $query->whereNull('lot_origin')
                    ->orWhere('lot_origin', '!=', FinAccountLot::ORIGIN_STATEMENT_POSITION);
            })
            ->where(function (Builder $query): void {
                $query->whereIn('source', [
                    FinAccountLot::SOURCE_BROKER_1099B,
                    FinAccountLot::SOURCE_SYNTHETIC_ADJUSTMENT,
                ])->orWhereIn('lot_source', [
                    FinAccountLot::SOURCE_1099B,
                    FinAccountLot::SOURCE_1099B_UNDERSCORE,
                    'import_1099b',
                ]);
            });
    }

    /**
     * @param  array<int, array{entry_index: int, account_identifier: string|null, account_name: string|null, form_type: string, tax_year: int, parsed_data: array<string, mixed>}>  $entries
     * @return list<string>
     */
    private function replacementWarnings(array $entries, int $deletedCount, int $legacyTaggedLotCount, bool $dryRun): array
    {
        if ($deletedCount === 0) {
            return [];
        }

        $warnings = [];
        if ($entries === []) {
            $warnings[] = sprintf(
                'Rebuild %s %d broker lot(s), but parsed data contains no 1099-B entries; verify document classification before relying on the rebuild.',
                $dryRun ? 'would remove' : 'removed',
                $deletedCount,
            );
        }

        if ($legacyTaggedLotCount > 0) {
            $warnings[] = sprintf(
                '%d legacy/manually tagged 1099-B lot(s) are in rebuild scope for this document; parsed data is canonical and scoped lots are replaced before inserting rebuilt rows.',
                $legacyTaggedLotCount,
            );
        }

        return $warnings;
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
     * @param  array<int, mixed>  $transactions
     * @return list<int>
     */
    private function importTransactionsToLots(
        int $accountId,
        array $transactions,
        int $documentId,
        mixed $defaultWashSaleTreatment,
        bool $dryRun,
    ): array {
        if ($dryRun) {
            return [];
        }

        $now = now()->toDateTimeString();
        $lotIds = [];
        $usedTransactionIds = [];

        foreach ($transactions as $tx) {
            if (! is_array($tx)) {
                continue;
            }

            $symbol = is_string($tx['symbol'] ?? null) && trim($tx['symbol']) !== '' ? trim($tx['symbol']) : null;
            $description = is_string($tx['description'] ?? null) ? trim($tx['description']) : ($symbol ?? 'Unknown');
            $quantity = is_numeric($tx['quantity'] ?? null) ? (float) $tx['quantity'] : null;
            $saleDate = $this->normalizeDateOrNull($tx['sale_date'] ?? $tx['disposed_date'] ?? null);
            $proceeds = is_numeric($tx['proceeds'] ?? null) ? (float) $tx['proceeds'] : null;
            $costBasis = is_numeric($tx['cost_basis'] ?? null) ? (float) $tx['cost_basis'] : null;
            $realizedGainLoss = is_numeric($tx['realized_gain_loss'] ?? null) ? (float) $tx['realized_gain_loss'] : null;
            $washSaleDisallowed = $this->parseWashSaleDisallowed($tx);
            $accruedMarketDiscount = is_numeric($tx['accrued_market_discount'] ?? null) ? (float) $tx['accrued_market_discount'] : null;
            $cusip = is_string($tx['cusip'] ?? null) && trim($tx['cusip']) !== '' ? trim($tx['cusip']) : null;
            $form8949Box = null;
            if (is_string($tx['form_8949_box'] ?? null)) {
                $candidateBox = strtoupper(trim((string) $tx['form_8949_box']));
                $form8949Box = in_array($candidateBox, WashSaleAdjustmentSynthesizer::FORM_8949_BOXES, true) ? $candidateBox : null;
            }

            $isCovered = $this->resolveIsCovered($tx, $form8949Box);
            $purchaseDateRaw = $tx['purchase_date'] ?? $tx['acquired_date'] ?? null;
            $purchaseDateNormalized = $this->normalizeDateOrNull($purchaseDateRaw);
            $isShortTerm = $this->isShortTerm($tx, $form8949Box);

            if ($quantity === null || $saleDate === null || $proceeds === null || $costBasis === null) {
                continue;
            }

            $washSaleAmounts = $this->washSaleNormalizer->normalizeAmounts(
                proceeds: $proceeds,
                costBasis: $costBasis,
                reportedGainLoss: $realizedGainLoss,
                washSaleDisallowed: $washSaleDisallowed,
                treatment: $tx['wash_sale_treatment'] ?? $defaultWashSaleTreatment,
            );
            $reconciliationNotes = BrokerWashSaleTreatmentNormalizer::appendReconciliationNotes(
                $purchaseDateNormalized === null ? 'Date acquired reported as Various; purchase_date stores sale_date as a database placeholder.' : null,
                is_string($tx['reconciliation_notes'] ?? null) ? $tx['reconciliation_notes'] : null,
                $washSaleAmounts['note'],
            );

            $lot = FinAccountLot::create([
                'acct_id' => $accountId,
                'symbol' => $symbol ?? $description,
                'description' => $description,
                'cusip' => $cusip,
                'quantity' => $quantity,
                'purchase_date' => $purchaseDateNormalized ?? $saleDate,
                'cost_basis' => $costBasis,
                'cost_per_unit' => $quantity > 0 ? round($costBasis / $quantity, 8) : null,
                'sale_date' => $saleDate,
                'proceeds' => $proceeds,
                'realized_gain_loss' => $washSaleAmounts['realized_gain_loss'],
                'is_short_term' => $isShortTerm,
                'lot_source' => FinAccountLot::SOURCE_1099B,
                'source' => $this->sourceForTransaction($tx),
                'document_id' => $documentId,
                'lot_origin' => FinAccountLot::ORIGIN_1099B_DISPOSITION,
                'form_8949_box' => $form8949Box,
                'is_covered' => $isCovered,
                'accrued_market_discount' => $accruedMarketDiscount,
                'wash_sale_disallowed' => $washSaleAmounts['wash_sale_disallowed'],
                'reconciliation_notes' => $reconciliationNotes,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            if (! (bool) ($tx['skip_transaction_matching'] ?? false)) {
                $buyItem = $purchaseDateNormalized !== null ? $this->lotMatcher->matchingBuyTransaction($lot, $usedTransactionIds) : null;
                if ($buyItem instanceof FinAccountLineItems) {
                    $usedTransactionIds[] = (int) $buyItem->t_id;
                }

                $sellItem = $this->lotMatcher->matchingSellTransaction($lot, $usedTransactionIds);
                if ($sellItem instanceof FinAccountLineItems) {
                    $usedTransactionIds[] = (int) $sellItem->t_id;
                }

                if ($buyItem instanceof FinAccountLineItems || $sellItem instanceof FinAccountLineItems) {
                    $lot->update([
                        'open_t_id' => $buyItem?->t_id,
                        'close_t_id' => $sellItem?->t_id,
                    ]);
                }
            }

            $lotIds[] = (int) $lot->lot_id;
        }

        return $lotIds;
    }

    /**
     * @param  array<int, mixed>  $transactions
     */
    private function importableTransactionCount(array $transactions): int
    {
        $count = 0;
        foreach ($transactions as $tx) {
            if (
                is_array($tx)
                && is_numeric($tx['quantity'] ?? null)
                && $this->normalizeDateOrNull($tx['sale_date'] ?? $tx['disposed_date'] ?? null) !== null
                && is_numeric($tx['proceeds'] ?? null)
                && is_numeric($tx['cost_basis'] ?? null)
            ) {
                $count++;
            }
        }

        return $count;
    }

    /**
     * @param  array<string, mixed>  $tx
     */
    private function isShortTerm(array $tx, ?string $form8949Box): ?bool
    {
        if (array_key_exists('is_short_term', $tx)) {
            return $this->normalizeBooleanOrNull($tx['is_short_term']);
        }

        if (is_string($tx['term'] ?? null)) {
            $normalizedTerm = strtolower(trim((string) $tx['term']));
            if (in_array($normalizedTerm, ['short', 'short_term', 'short-term'], true)) {
                return true;
            }

            if (in_array($normalizedTerm, ['long', 'long_term', 'long-term'], true)) {
                return false;
            }
        }

        if (isset($tx['form_8949_box'])) {
            $box = $form8949Box ?? strtoupper(trim((string) $tx['form_8949_box']));
            if (in_array($box, WashSaleAdjustmentSynthesizer::SHORT_TERM_FORM_8949_BOXES, true)) {
                return true;
            }

            if (in_array($box, WashSaleAdjustmentSynthesizer::LONG_TERM_FORM_8949_BOXES, true)) {
                return false;
            }
        }

        return null;
    }

    /**
     * Resolve the per-row wash-sale disallowed amount.
     *
     * Accepts the legacy `wash_sale_disallowed` key and the new
     * `wash_sale_loss_disallowed` key that newer parsers emit. The stored value
     * is always the absolute value because §1091 disallowed losses are
     * non-negative amounts reported in Form 8949 column (g).
     *
     * @param  array<string, mixed>  $tx
     */
    private function parseWashSaleDisallowed(array $tx): float
    {
        foreach (['wash_sale_disallowed', 'wash_sale_loss_disallowed'] as $key) {
            if (is_numeric($tx[$key] ?? null)) {
                return abs((float) $tx[$key]);
            }
        }

        return 0.0;
    }

    /**
     * Resolve the is_covered flag from per-row fields, falling back to the
     * Form 8949 box (A/D = covered, B/E = noncovered, C/F = unknown).
     *
     * @param  array<string, mixed>  $tx
     */
    private function resolveIsCovered(array $tx, ?string $form8949Box): ?bool
    {
        if (array_key_exists('is_covered', $tx)) {
            return $this->normalizeBooleanOrNull($tx['is_covered']);
        }

        foreach (['basisReportedToIrs', 'basis_reported_to_irs'] as $key) {
            if (array_key_exists($key, $tx)) {
                $value = $this->normalizeBooleanOrNull($tx[$key]);
                if ($value !== null) {
                    return $value;
                }
            }
        }

        if ($form8949Box !== null) {
            if (in_array($form8949Box, WashSaleAdjustmentSynthesizer::COVERED_FORM_8949_BOXES, true)) {
                return true;
            }

            if (in_array($form8949Box, WashSaleAdjustmentSynthesizer::NONCOVERED_FORM_8949_BOXES, true)) {
                return false;
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $tx
     */
    private function sourceForTransaction(array $tx): string
    {
        $symbol = is_string($tx['symbol'] ?? null) ? strtoupper(trim($tx['symbol'])) : '';
        if ((bool) ($tx['skip_transaction_matching'] ?? false) || $symbol === 'WASHSALEADJ') {
            return FinAccountLot::SOURCE_SYNTHETIC_ADJUSTMENT;
        }

        return FinAccountLot::SOURCE_BROKER_1099B;
    }

    /**
     * @param  array<string, mixed>  $entry
     * @param  array<string, mixed>  $parsedData
     * @param  array<int, array<string, mixed>>  $transactions
     * @return list<string>
     */
    private function washSaleTotalWarnings(array $entry, array $parsedData, array $transactions): array
    {
        $summaryWashSale = $this->summaryWashSaleTotal($parsedData);
        if ($summaryWashSale === null) {
            return [];
        }

        $rowWashSale = 0.0;
        foreach ($transactions as $transaction) {
            $rowWashSale += $this->parseWashSaleDisallowed($transaction);
        }

        if (abs($summaryWashSale - $rowWashSale) <= self::MONEY_TOLERANCE) {
            return [];
        }

        return [
            $this->warning(
                $entry,
                sprintf(
                    'wash-sale summary total %.2f does not match parsed row total %.2f; synthetic adjustment rows were considered.',
                    $summaryWashSale,
                    $rowWashSale,
                ),
            ),
        ];
    }

    /**
     * @param  array<string, mixed>  $parsedData
     */
    private function hasSummaryTotals(array $parsedData): bool
    {
        foreach ($this->summaryTotals($parsedData) as $value) {
            if ($value !== null) {
                return true;
            }
        }

        return false;
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

    private function normalizeDateOrNull(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);
        if ($trimmed === '' || strtolower($trimmed) === 'various') {
            return null;
        }

        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $trimmed)) {
            return $trimmed;
        }

        try {
            $date = new \DateTime($trimmed);

            return $date->format('Y-m-d');
        } catch (\Throwable) {
            return null;
        }
    }

    private function normalizeBooleanOrNull(mixed $value): ?bool
    {
        if (is_bool($value)) {
            return $value;
        }

        if (is_int($value)) {
            return match ($value) {
                1 => true,
                0 => false,
                default => null,
            };
        }

        if (is_string($value)) {
            $normalized = strtolower(trim($value));

            return match ($normalized) {
                '1', 'true', 'yes', 'y' => true,
                '0', 'false', 'no', 'n' => false,
                default => null,
            };
        }

        return null;
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

        return $string === null ? null : strtolower($string);
    }

    /**
     * @param  array<string, mixed>  $entry
     */
    private function warning(array $entry, string $message): string
    {
        return sprintf('Entry %d: %s', (int) ($entry['entry_index'] ?? 0), $message);
    }
}
