<?php

namespace App\Services\Finance\CapitalGains;

use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinLotReconciliationLink;
use Closure;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;

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
     * @return LengthAwarePaginator<int, FinAccountLot>
     */
    public function query(array $params): LengthAwarePaginator
    {
        $perPage = min($params['per_page'] ?? 50, 200);
        $page = $params['page'] ?? 1;

        $query = $this->baseQuery($params)
            ->with('account:acct_id,acct_name,acct_number')
            ->with('taxDocument:id,document_id');

        $this->addReconciliationColumns($query);

        $query->orderBy('sale_date', 'desc')
            ->orderBy('lot_id', 'desc');

        return $query->paginate(perPage: $perPage, page: $page);
    }

    /**
     * Compute summary aggregates for the current filter set.
     *
     * @param  array<string, mixed>  $params  Same params as query()
     * @return array{total_proceeds: float, total_basis: float, total_wash_sale: float, total_realized_gain: float, count: int, counts_by_source: array<string, int>, counts_by_state: array<string, int>, term_breakdown: array{short: array{proceeds: float, basis: float, realized_gain: float, count: int}, long: array{proceeds: float, basis: float, realized_gain: float, count: int}}}
     */
    public function summary(array $params): array
    {
        $aggregates = $this->baseQuery($params)->selectRaw(
            'COALESCE(SUM(proceeds), 0) as total_proceeds, '.
            'COALESCE(SUM(cost_basis), 0) as total_basis, '.
            'COALESCE(SUM(wash_sale_disallowed), 0) as total_wash_sale, '.
            'COALESCE(SUM(realized_gain_loss), 0) as total_realized_gain, '.
            'COUNT(*) as count'
        )->first();

        $lotIds = $this->baseQuery($params)
            ->pluck('lot_id')
            ->map(static fn (int|string $lotId): int => (int) $lotId)
            ->values()
            ->all();

        return [
            'total_proceeds' => (float) ($aggregates?->getAttribute('total_proceeds') ?? 0),
            'total_basis' => (float) ($aggregates?->getAttribute('total_basis') ?? 0),
            'total_wash_sale' => (float) ($aggregates?->getAttribute('total_wash_sale') ?? 0),
            'total_realized_gain' => (float) ($aggregates?->getAttribute('total_realized_gain') ?? 0),
            'count' => (int) ($aggregates?->getAttribute('count') ?? 0),
            'counts_by_source' => $this->countsBySource($this->baseQuery($params)),
            'counts_by_state' => $this->countsByLatestLinkState($lotIds),
            'term_breakdown' => $this->termBreakdown($params),
        ];
    }

    /**
     * Aggregate proceeds, basis, realized gain, and count split by short-term vs long-term.
     * Open lots (is_short_term IS NULL) are excluded from both buckets.
     *
     * @param  array<string, mixed>  $params
     * @return array{short: array{proceeds: float, basis: float, realized_gain: float, count: int}, long: array{proceeds: float, basis: float, realized_gain: float, count: int}}
     */
    private function termBreakdown(array $params): array
    {
        $rows = $this->baseQuery($params)
            ->whereNotNull('is_short_term')
            ->selectRaw(
                'is_short_term, '.
                'COALESCE(SUM(proceeds), 0) as total_proceeds, '.
                'COALESCE(SUM(cost_basis), 0) as total_basis, '.
                'COALESCE(SUM(realized_gain_loss), 0) as total_realized_gain, '.
                'COUNT(*) as cnt'
            )
            ->groupBy('is_short_term')
            ->get();

        $empty = ['proceeds' => 0.0, 'basis' => 0.0, 'realized_gain' => 0.0, 'count' => 0];
        $short = $empty;
        $long = $empty;

        foreach ($rows as $row) {
            $bucket = [
                'proceeds' => (float) $row->getAttribute('total_proceeds'),
                'basis' => (float) $row->getAttribute('total_basis'),
                'realized_gain' => (float) $row->getAttribute('total_realized_gain'),
                'count' => (int) $row->getAttribute('cnt'),
            ];
            if ((int) $row->getAttribute('is_short_term') === 1) {
                $short = $bucket;
            } else {
                $long = $bucket;
            }
        }

        return ['short' => $short, 'long' => $long];
    }

    /**
     * @param  array<string, mixed>  $params
     * @return list<int>
     */
    public function closedYears(array $params): array
    {
        $accountIds = $this->ownedAccountIds(
            (int) $params['user_id'],
            is_array($params['account_ids'] ?? null) ? $params['account_ids'] : null,
        );

        $query = FinAccountLot::query()
            ->whereNotNull('sale_date')
            ->whereNull('superseded_by_lot_id');

        if ($accountIds === []) {
            $query->whereRaw('1 = 0');
        } else {
            $query->whereIn('acct_id', $accountIds);
        }

        return $query
            ->pluck('sale_date')
            ->map(static fn (mixed $saleDate): int => (int) substr((string) $saleDate, 0, 4))
            ->filter(static fn (int $year): bool => $year > 0)
            ->unique()
            ->sortDesc()
            ->values()
            ->all();
    }

    /**
     * @param  array<string, mixed>  $params
     * @return Builder<FinAccountLot>
     */
    private function baseQuery(array $params): Builder
    {
        $userId = (int) $params['user_id'];
        $accountIds = $this->ownedAccountIds($userId, is_array($params['account_ids'] ?? null) ? $params['account_ids'] : null);
        $status = (string) ($params['status'] ?? 'all');

        $query = FinAccountLot::query();

        if ($accountIds === []) {
            $query->whereRaw('1 = 0');
        } else {
            $query->whereIn('acct_id', $accountIds);
        }

        if (($params['year'] ?? null) !== null) {
            $year = (int) $params['year'];
            $query->whereBetween('sale_date', ["{$year}-01-01", "{$year}-12-31"]);
        }
        if (($params['date_from'] ?? null) !== null) {
            $query->where('sale_date', '>=', (string) $params['date_from']);
        }
        if (($params['date_to'] ?? null) !== null) {
            $query->where('sale_date', '<=', (string) $params['date_to']);
        }

        if ($status === 'open') {
            $query->whereNull('sale_date');
        } elseif ($status === 'closed') {
            $query->whereNotNull('sale_date');
        }

        $sources = $this->stringValues($params['source'] ?? null);
        if ($sources !== []) {
            $query->whereIn('source', $sources);
        }

        $this->applyReconciliationStateFilter($query, $params['reconciliation_state'] ?? null);

        if (! (bool) ($params['include_superseded'] ?? false)) {
            $query->whereNull('superseded_by_lot_id');
        }
        if (($params['symbol'] ?? null) !== null) {
            $query->where('symbol', 'LIKE', (string) $params['symbol']);
        }
        if (($params['cusip'] ?? null) !== null) {
            $query->where('cusip', (string) $params['cusip']);
        }
        if (($params['document_id'] ?? null) !== null) {
            $query->where('document_id', (int) $params['document_id']);
        }

        return $query;
    }

    /**
     * @param  int[]|null  $requestedAccountIds
     * @return list<int>
     */
    private function ownedAccountIds(int $userId, ?array $requestedAccountIds): array
    {
        $query = FinAccounts::forOwner($userId);

        if ($requestedAccountIds !== null && $requestedAccountIds !== []) {
            $query->whereIn('acct_id', array_map(static fn (int|string $accountId): int => (int) $accountId, $requestedAccountIds));
        }

        return $query
            ->pluck('acct_id')
            ->map(static fn (int|string $accountId): int => (int) $accountId)
            ->values()
            ->all();
    }

    /**
     * @param  Builder<FinAccountLot>  $query
     */
    private function applyReconciliationStateFilter(Builder $query, mixed $stateFilter): void
    {
        $states = $this->stringValues($stateFilter);
        if ($states === []) {
            return;
        }

        $includeNone = in_array('none', $states, true);
        $linkStates = array_values(array_filter($states, static fn (string $state): bool => $state !== 'none'));

        $query->where(function (Builder $stateQuery) use ($includeNone, $linkStates): void {
            if ($linkStates !== []) {
                $stateQuery->whereExists($this->linkedLotExists($linkStates));
            }

            if ($includeNone && $linkStates !== []) {
                $stateQuery->orWhereNotExists($this->linkedLotExists());
            } elseif ($includeNone) {
                $stateQuery->whereNotExists($this->linkedLotExists());
            }
        });
    }

    /**
     * @param  list<string>|null  $states
     */
    private function linkedLotExists(?array $states = null): Closure
    {
        return static function (QueryBuilder $linkQuery) use ($states): void {
            $linkQuery
                ->selectRaw('1')
                ->from('fin_lot_reconciliation_links')
                ->where(function (QueryBuilder $linkedLotQuery): void {
                    $linkedLotQuery
                        ->whereColumn('fin_lot_reconciliation_links.broker_lot_id', 'fin_account_lots.lot_id')
                        ->orWhereColumn('fin_lot_reconciliation_links.account_lot_id', 'fin_account_lots.lot_id');
                });

            if ($states !== null && $states !== []) {
                $linkQuery->whereIn('fin_lot_reconciliation_links.state', $states);
            }
        };
    }

    /**
     * @param  Builder<FinAccountLot>  $query
     */
    private function addReconciliationColumns(Builder $query): void
    {
        $latestLink = static function (Builder $linkQuery): void {
            $linkQuery->where(function (Builder $linkedLotQuery): void {
                $linkedLotQuery
                    ->whereColumn('fin_lot_reconciliation_links.broker_lot_id', 'fin_account_lots.lot_id')
                    ->orWhereColumn('fin_lot_reconciliation_links.account_lot_id', 'fin_account_lots.lot_id');
            });
        };

        $query->addSelect([
            'reconciliation_link_id' => FinLotReconciliationLink::query()
                ->select('id')
                ->where($latestLink)
                ->orderByDesc('id')
                ->limit(1),
            'reconciliation_state' => FinLotReconciliationLink::query()
                ->select('state')
                ->where($latestLink)
                ->orderByDesc('id')
                ->limit(1),
        ]);
    }

    /**
     * @param  Builder<FinAccountLot>  $query
     * @return array<string, int>
     */
    private function countsBySource(Builder $query): array
    {
        $rows = $query
            ->selectRaw('COALESCE(source, ?) as source_key, COUNT(*) as cnt', ['none'])
            ->groupBy('source')
            ->get();
        $counts = [];

        foreach ($rows as $row) {
            $counts[(string) $row->getAttribute('source_key')] = (int) $row->getAttribute('cnt');
        }

        return $counts;
    }

    /**
     * @param  list<int>  $lotIds
     * @return array<string, int>
     */
    private function countsByLatestLinkState(array $lotIds): array
    {
        if ($lotIds === []) {
            return [];
        }

        $lotIdLookup = array_fill_keys($lotIds, true);
        $stateByLotId = [];
        $links = FinLotReconciliationLink::query()
            ->where(function (Builder $query) use ($lotIds): void {
                $query
                    ->whereIn('broker_lot_id', $lotIds)
                    ->orWhereIn('account_lot_id', $lotIds);
            })
            ->orderByDesc('id')
            ->get(['id', 'broker_lot_id', 'account_lot_id', 'state']);

        foreach ($links as $link) {
            foreach (['broker_lot_id', 'account_lot_id'] as $attribute) {
                $lotId = (int) ($link->getAttribute($attribute) ?? 0);
                if ($lotId > 0 && isset($lotIdLookup[$lotId]) && ! array_key_exists($lotId, $stateByLotId)) {
                    $stateByLotId[$lotId] = (string) $link->getAttribute('state');
                }
            }
        }

        $counts = [];
        foreach ($lotIds as $lotId) {
            $state = $stateByLotId[$lotId] ?? 'none';
            $counts[$state] = ($counts[$state] ?? 0) + 1;
        }
        ksort($counts);

        return $counts;
    }

    /**
     * @return list<string>
     */
    private function stringValues(mixed $value): array
    {
        if ($value === null) {
            return [];
        }

        $values = is_array($value) ? $value : [$value];

        return array_values(array_filter(
            array_map(static fn (mixed $item): string => trim((string) $item), $values),
            static fn (string $item): bool => $item !== '',
        ));
    }
}
