<?php

namespace App\Services\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;
use Illuminate\Support\Collection;

class TaxLotReconciliationService
{
    public function __construct(
        private LotMatcher $lotMatcher,
    ) {}

    /**
     * @return array{
     *     tax_year: int,
     *     summary: array{matched: int, variance: int, missing_account: int, missing_1099b: int, duplicates: int, unresolved_account_links: int},
     *     accounts: array<int, array<string, mixed>>,
     *     unresolved_account_links: array<int, array<string, mixed>>
     * }
     */
    public function reconcile(int $userId, int $taxYear, ?int $accountId = null): array
    {
        $accounts = $this->accounts($userId, $accountId);
        $accountIds = $accounts->pluck('acct_id')->map(static fn (int|string $id): int => (int) $id)->values()->all();

        if ($accountIds === []) {
            $unresolvedLinks = $accountId === null ? $this->unresolvedAccountLinks($userId, $taxYear) : [];
            $summary = $this->emptySummary();
            $summary['unresolved_account_links'] = count($unresolvedLinks);

            return [
                'tax_year' => $taxYear,
                'summary' => $summary,
                'accounts' => [],
                'unresolved_account_links' => $unresolvedLinks,
            ];
        }

        $reportedLots = $this->reportedLots($accountIds, $taxYear)->groupBy('acct_id');
        $accountLots = $this->accountLots($accountIds, $taxYear)->groupBy('acct_id');
        $summary = $this->emptySummary();
        $accountPayloads = [];

        foreach ($accounts as $account) {
            $accountReportedLots = $reportedLots->get($account->acct_id, collect());
            $accountStatementLots = $accountLots->get($account->acct_id, collect());
            $payload = $this->reconcileAccount($account, $accountReportedLots, $accountStatementLots);

            if ($accountId !== null || $payload['rows'] !== []) {
                $accountPayloads[] = $payload;
                $this->mergeSummary($summary, $payload['summary']);
            }
        }

        $unresolvedLinks = $accountId === null ? $this->unresolvedAccountLinks($userId, $taxYear) : [];
        $summary['unresolved_account_links'] = count($unresolvedLinks);

        return [
            'tax_year' => $taxYear,
            'summary' => $summary,
            'accounts' => $accountPayloads,
            'unresolved_account_links' => $unresolvedLinks,
        ];
    }

    /**
     * @param  Collection<int, FinAccountLot>  $reportedLots
     * @param  Collection<int, FinAccountLot>  $accountLots
     * @return array{account_id: int, account_name: string, summary: array<string, int>, rows: array<int, array<string, mixed>>}
     */
    private function reconcileAccount(FinAccounts $account, Collection $reportedLots, Collection $accountLots): array
    {
        $summary = $this->emptySummary();
        $usedAccountLotIds = [];
        $rows = [];

        foreach ($reportedLots as $reportedLot) {
            $candidates = $accountLots
                ->filter(fn (FinAccountLot $accountLot): bool => $this->lotMatcher->sameDisposition($reportedLot, $accountLot))
                ->values();

            if ($candidates->isEmpty()) {
                $rows[] = $this->rowPayload('missing_account', $reportedLot, null, collect());
                $summary['missing_account']++;

                continue;
            }

            foreach ($candidates as $candidate) {
                $usedAccountLotIds[(int) $candidate->lot_id] = true;
            }

            if ($candidates->count() > 1) {
                $rows[] = $this->rowPayload('duplicate', $reportedLot, $candidates->first(), $candidates);
                $summary['duplicates']++;

                continue;
            }

            /** @var FinAccountLot $candidate */
            $candidate = $candidates->first();
            $status = $this->lotMatcher->taxValuesMatch($reportedLot, $candidate) ? 'matched' : 'variance';

            $rows[] = $this->rowPayload($status, $reportedLot, $candidate, $candidates);
            $summary[$status]++;
        }

        foreach ($accountLots as $accountLot) {
            if (isset($usedAccountLotIds[(int) $accountLot->lot_id])) {
                continue;
            }

            if ($accountLot->superseded_by_lot_id !== null) {
                continue;
            }

            $rows[] = $this->rowPayload('missing_1099b', null, $accountLot, collect([$accountLot]));
            $summary['missing_1099b']++;
        }

        return [
            'account_id' => (int) $account->acct_id,
            'account_name' => (string) $account->acct_name,
            'summary' => $summary,
            'rows' => $rows,
        ];
    }

    /**
     * @param  Collection<int, FinAccountLot>  $candidates
     * @return array<string, mixed>
     */
    private function rowPayload(string $status, ?FinAccountLot $reportedLot, ?FinAccountLot $accountLot, Collection $candidates): array
    {
        return [
            'status' => $status,
            'reported_lot' => $reportedLot ? $this->lotPayload($reportedLot) : null,
            'account_lot' => $accountLot ? $this->lotPayload($accountLot) : null,
            'candidate_lots' => $candidates->map(fn (FinAccountLot $lot): array => $this->lotPayload($lot))->values()->all(),
            'deltas' => $reportedLot && $accountLot ? $this->lotMatcher->deltas($reportedLot, $accountLot) : [
                'quantity' => null,
                'proceeds' => null,
                'cost_basis' => null,
                'realized_gain_loss' => null,
                'sale_date_days' => null,
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function lotPayload(FinAccountLot $lot): array
    {
        return [
            'lot_id' => (int) $lot->lot_id,
            'acct_id' => (int) $lot->acct_id,
            'symbol' => $lot->symbol,
            'description' => $lot->description,
            'quantity' => $this->lotMatcher->numericValue($lot->quantity),
            'purchase_date' => $this->lotMatcher->dateValue($lot->purchase_date),
            'sale_date' => $this->lotMatcher->dateValue($lot->sale_date),
            'proceeds' => $lot->proceeds !== null ? $this->lotMatcher->numericValue($lot->proceeds) : null,
            'cost_basis' => $this->lotMatcher->numericValue($lot->cost_basis),
            'realized_gain_loss' => $lot->realized_gain_loss !== null ? $this->lotMatcher->numericValue($lot->realized_gain_loss) : null,
            'is_short_term' => $lot->is_short_term,
            'lot_source' => $lot->lot_source,
            'statement_id' => $lot->statement_id !== null ? (int) $lot->statement_id : null,
            'close_t_id' => $lot->close_t_id !== null ? (int) $lot->close_t_id : null,
            'tax_document_id' => $lot->tax_document_id !== null ? (int) $lot->tax_document_id : null,
            'superseded_by_lot_id' => $lot->superseded_by_lot_id !== null ? (int) $lot->superseded_by_lot_id : null,
            'reconciliation_status' => $lot->reconciliation_status,
            'reconciliation_notes' => $lot->reconciliation_notes,
            'tax_document_filename' => $this->taxDocumentFilename($lot),
        ];
    }

    /**
     * @return Collection<int, FinAccounts>
     */
    private function accounts(int $userId, ?int $accountId): Collection
    {
        return FinAccounts::forOwner($userId)
            ->when($accountId !== null, fn ($query) => $query->where('acct_id', $accountId))
            ->orderBy('acct_name')
            ->get();
    }

    /**
     * @param  int[]  $accountIds
     * @return Collection<int, FinAccountLot>
     */
    private function reportedLots(array $accountIds, int $taxYear): Collection
    {
        return FinAccountLot::query()
            ->whereIn('acct_id', $accountIds)
            ->whereBetween('sale_date', ["{$taxYear}-01-01", "{$taxYear}-12-31"])
            ->where(function ($query): void {
                $query->where('lot_source', '1099b')
                    ->orWhereNotNull('tax_document_id');
            })
            ->with(['taxDocument:id,original_filename,form_type,tax_year'])
            ->orderBy('acct_id')
            ->orderBy('symbol')
            ->orderBy('sale_date')
            ->orderBy('lot_id')
            ->get();
    }

    /**
     * @param  int[]  $accountIds
     * @return Collection<int, FinAccountLot>
     */
    private function accountLots(array $accountIds, int $taxYear): Collection
    {
        return FinAccountLot::query()
            ->whereIn('acct_id', $accountIds)
            ->whereBetween('sale_date', ["{$taxYear}-01-01", "{$taxYear}-12-31"])
            ->where(function ($query): void {
                $query->whereNull('tax_document_id')
                    ->where(function ($sourceQuery): void {
                        $sourceQuery->whereNull('lot_source')
                            ->orWhereNotIn('lot_source', ['1099b', '1099_b']);
                    });
            })
            ->orderBy('acct_id')
            ->orderBy('symbol')
            ->orderBy('sale_date')
            ->orderBy('lot_id')
            ->get();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function unresolvedAccountLinks(int $userId, int $taxYear): array
    {
        $links = TaxDocumentAccount::query()
            ->whereNull('account_id')
            ->where('tax_year', $taxYear)
            ->whereIn('form_type', ['1099_b', 'broker_1099'])
            ->whereHas('document', fn ($query) => $query->where('user_id', $userId))
            ->with('document:id,original_filename,form_type,tax_year')
            ->orderBy('tax_document_id')
            ->orderBy('id')
            ->get();

        $payload = [];
        foreach ($links as $link) {
            $payload[] = [
                'id' => (int) $link->id,
                'tax_document_id' => (int) $link->tax_document_id,
                'filename' => $this->taxDocumentAccountFilename($link),
                'form_type' => $link->form_type,
                'tax_year' => (int) $link->tax_year,
                'ai_identifier' => $link->ai_identifier,
                'ai_account_name' => $link->ai_account_name,
            ];
        }

        return $payload;
    }

    /**
     * @return array{matched: int, variance: int, missing_account: int, missing_1099b: int, duplicates: int, unresolved_account_links: int}
     */
    private function emptySummary(): array
    {
        return [
            'matched' => 0,
            'variance' => 0,
            'missing_account' => 0,
            'missing_1099b' => 0,
            'duplicates' => 0,
            'unresolved_account_links' => 0,
        ];
    }

    private function taxDocumentFilename(FinAccountLot $lot): ?string
    {
        $document = $lot->taxDocument;
        if (! $document instanceof FileForTaxDocument) {
            return null;
        }

        return $document->original_filename;
    }

    private function taxDocumentAccountFilename(TaxDocumentAccount $link): ?string
    {
        $document = $link->document;
        if (! $document instanceof FileForTaxDocument) {
            return null;
        }

        return $document->original_filename;
    }

    /**
     * @param  array<string, int>  $summary
     * @param  array<string, int>  $accountSummary
     */
    private function mergeSummary(array &$summary, array $accountSummary): void
    {
        foreach (array_keys($summary) as $key) {
            $summary[$key] += $accountSummary[$key] ?? 0;
        }
    }
}
