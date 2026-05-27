<?php

namespace App\Services\Finance\CapitalGains;

use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinLotReconciliationLink;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;

/**
 * Central lot query service powering the unified lot-workspace API.
 *
 * Supports scopes: single account, multi-account, year, date range,
 * source document, tax document, and account group.
 *
 * Reads reconciliation state from fin_lot_reconciliation_links directly
 * (not the stale per-document denormalization on fin_account_lots).
 */
final class LotWorkspaceService
{
    /**
     * @param  array{
     *   user_id: int,
     *   account_ids?: int[],
     *   year?: int,
     *   date_from?: string,
     *   date_to?: string,
     *   source?: string|string[],
     *   reconciliation_state?: string|string[],
     *   status?: 'open'|'closed'|'all',
     *   include_superseded?: bool,
     *   symbol?: string,
     *   cusip?: string,
     *   document_id?: int,
     *   per_page?: int,
     *   page?: int,
     * }  $params
     * @return LengthAwarePaginator<FinAccountLot>
     */
    public function query(array $params): LengthAwarePaginator
    {
        $userId = $params['user_id'];
        $accountIds = $params['account_ids'] ?? null;
        $year = $params['year'] ?? null;
        $dateFrom = $params['date_from'] ?? null;
        $dateTo = $params['date_to'] ?? null;
        $source = $params['source'] ?? null;
        $reconciliationState = $params['reconciliation_state'] ?? null;
        $status = $params['status'] ?? 'all';
        $includeSuperseded = $params['include_superseded'] ?? false;
        $symbol = $params['symbol'] ?? null;
        $cusip = $params['cusip'] ?? null;
        $documentId = $params['document_id'] ?? null;
        $perPage = min($params['per_page'] ?? 50, 200);
        $page = $params['page'] ?? 1;

        // Resolve account scope
        if ($accountIds === null || $accountIds === []) {
            $accountIds = FinAccounts::forOwner($userId)
                ->pluck('acct_id')
                ->map(static fn (int|string $id): int => (int) $id)
                ->all();
        } else {
            // Verify ownership
            $accountIds = FinAccounts::forOwner($userId)
                ->whereIn('acct_id', $accountIds)
                ->pluck('acct_id')
                ->map(static fn (int|string $id): int => (int) $id)
                ->all();
        }

        $query = FinAccountLot::query()
            ->whereIn('acct_id', $accountIds)
            ->with('account:acct_id,acct_name,acct_number');

        // Date scope
        if ($year !== null) {
            $query->whereBetween('sale_date', ["{$year}-01-01", "{$year}-12-31"]);
        }
        if ($dateFrom !== null) {
            $query->where('sale_date', '>=', $dateFrom);
        }
        if ($dateTo !== null) {
            $query->where('sale_date', '<=', $dateTo);
        }

        // Status filter (open = no sale_date, closed = has sale_date)
        if ($status === 'open') {
            $query->whereNull('sale_date');
        } elseif ($status === 'closed') {
            $query->whereNotNull('sale_date');
        }

        // Source filter
        if ($source !== null) {
            $sources = is_array($source) ? $source : [$source];
            $query->whereIn('source', $sources);
        }

        // Reconciliation state filter — reads from links table directly
        if ($reconciliationState !== null) {
            $states = is_array($reconciliationState) ? $reconciliationState : [$reconciliationState];
            $query->where(function (Builder $q) use ($states): void {
                $q->whereIn('reconciliation_status', $states)
                    ->orWhereExists(function ($sub) use ($states): void {
                        $sub->selectRaw('1')
                            ->from('fin_lot_reconciliation_links')
                            ->where(function ($linkQ): void {
                                $linkQ->whereColumn('fin_lot_reconciliation_links.broker_lot_id', 'fin_account_lots.lot_id')
                                    ->orWhereColumn('fin_lot_reconciliation_links.account_lot_id', 'fin_account_lots.lot_id');
                            })
                            ->whereIn('fin_lot_reconciliation_links.state', $states);
                    });
            });
        }

        // Superseded filter
        if (! $includeSuperseded) {
            $query->whereNull('superseded_by_lot_id');
        }

        // Symbol / CUSIP filter
        if ($symbol !== null) {
            $query->where('symbol', 'LIKE', $symbol);
        }
        if ($cusip !== null) {
            $query->where('cusip', $cusip);
        }

        // Document filter
        if ($documentId !== null) {
            $query->where('document_id', $documentId);
        }

        $query->orderBy('sale_date', 'desc')
            ->orderBy('lot_id', 'desc');

        return $query->paginate(perPage: $perPage, page: $page);
    }

    /**
     * Compute summary aggregates for the current filter set.
     *
     * @param  array<string, mixed>  $params  Same params as query()
     * @return array{total_proceeds: float, total_basis: float, total_wash_sale: float, total_realized_gain: float, count: int, counts_by_source: array<string, int>, counts_by_state: array<string, int>}
     */
    public function summary(array $params): array
    {
        $userId = $params['user_id'];
        $accountIds = $params['account_ids'] ?? null;

        if ($accountIds === null || $accountIds === []) {
            $accountIds = FinAccounts::forOwner($userId)
                ->pluck('acct_id')
                ->map(static fn (int|string $id): int => (int) $id)
                ->all();
        } else {
            $accountIds = FinAccounts::forOwner($userId)
                ->whereIn('acct_id', $accountIds)
                ->pluck('acct_id')
                ->map(static fn (int|string $id): int => (int) $id)
                ->all();
        }

        $query = FinAccountLot::query()->whereIn('acct_id', $accountIds);

        $year = $params['year'] ?? null;
        $status = $params['status'] ?? 'all';
        $includeSuperseded = $params['include_superseded'] ?? false;
        $source = $params['source'] ?? null;
        $symbol = $params['symbol'] ?? null;
        $cusip = $params['cusip'] ?? null;
        $documentId = $params['document_id'] ?? null;

        if ($year !== null) {
            $query->whereBetween('sale_date', ["{$year}-01-01", "{$year}-12-31"]);
        }
        if ($status === 'open') {
            $query->whereNull('sale_date');
        } elseif ($status === 'closed') {
            $query->whereNotNull('sale_date');
        }
        if ($source !== null) {
            $sources = is_array($source) ? $source : [$source];
            $query->whereIn('source', $sources);
        }
        if (! $includeSuperseded) {
            $query->whereNull('superseded_by_lot_id');
        }
        if ($symbol !== null) {
            $query->where('symbol', 'LIKE', $symbol);
        }
        if ($cusip !== null) {
            $query->where('cusip', $cusip);
        }
        if ($documentId !== null) {
            $query->where('document_id', $documentId);
        }

        $aggregates = $query->selectRaw(
            'COALESCE(SUM(proceeds), 0) as total_proceeds, '.
            'COALESCE(SUM(cost_basis), 0) as total_basis, '.
            'COALESCE(SUM(wash_sale_disallowed), 0) as total_wash_sale, '.
            'COALESCE(SUM(realized_gain_loss), 0) as total_realized_gain, '.
            'COUNT(*) as count'
        )->first();

        $countsBySource = $query->clone()
            ->selectRaw('source, COUNT(*) as cnt')
            ->groupBy('source')
            ->pluck('cnt', 'source')
            ->all();

        $countsByState = $query->clone()
            ->selectRaw('COALESCE(reconciliation_status, \'none\') as state, COUNT(*) as cnt')
            ->groupBy('reconciliation_status')
            ->pluck('cnt', 'state')
            ->all();

        return [
            'total_proceeds' => (float) ($aggregates->total_proceeds ?? 0),
            'total_basis' => (float) ($aggregates->total_basis ?? 0),
            'total_wash_sale' => (float) ($aggregates->total_wash_sale ?? 0),
            'total_realized_gain' => (float) ($aggregates->total_realized_gain ?? 0),
            'count' => (int) ($aggregates->count ?? 0),
            'counts_by_source' => $countsBySource,
            'counts_by_state' => $countsByState,
        ];
    }
}
