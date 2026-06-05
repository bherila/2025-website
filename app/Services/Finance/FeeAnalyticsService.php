<?php

namespace App\Services\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinAccountTag;
use App\Models\FinanceTool\FinStatement;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

class FeeAnalyticsService
{
    public const float MISMATCH_THRESHOLD_USD = 1.00;

    public const float ON_TARGET_TOLERANCE = 0.10;

    private const array FEE_CHARACTERISTICS = ['fee_schE', 'fee_irc67g'];

    /**
     * These transaction types store fee charges as negative t_amt and credits
     * as positive t_amt, so signed fee cost is -t_amt. Other fee rows use
     * the signed t_fee column directly, where charges are positive.
     */
    private const array FEE_TRANSACTION_TYPES = ['fee', 'advisory fee', 'management fee'];

    // Keep in sync with resources/js/lib/finance/transactionTypes.ts.
    private const array CASH_FLOW_TRANSACTION_TYPES = ['Transfer', 'Deposit', 'Withdrawal'];

    /**
     * @return array{total:float,by_characteristic:array{fee_schE:float,fee_irc67g:float,untagged:float},line_items:array<int, array<string, mixed>>}
     */
    public function actualFeesForAccount(int|FinAccounts $account, int $year, bool $includeLineItems = true): array
    {
        $resolvedAccount = $account instanceof FinAccounts
            ? $account
            : FinAccounts::query()->where('acct_id', $account)->first();

        if ($resolvedAccount instanceof FinAccounts && $this->accountPeriodForYear($resolvedAccount, $year) === null) {
            return $this->emptyActualFees();
        }

        $accountId = $resolvedAccount instanceof FinAccounts ? (int) $resolvedAccount->acct_id : $account;
        [$start, $end] = $this->yearBounds($year);

        return $this->actualFeesForPeriod($accountId, $start, $end, $includeLineItems);
    }

    public function expectedFeesForAccount(FinAccounts $account, int $year): float
    {
        if (! $this->accountHasExpectedFees($account)) {
            return 0.0;
        }

        $period = $this->accountPeriodForYear($account, $year);
        if ($period === null) {
            return 0.0;
        }

        [$start, $end, $periodDays] = $period;
        $yearsInPeriod = $periodDays / 365.25;
        $averageBalance = $this->avgBalanceForPeriod((int) $account->acct_id, $start, $end);
        $percentage = (float) ($account->expected_fee_pct ?? 0);
        $flat = (float) ($account->expected_fee_flat ?? 0);
        $percentageAnnualFee = MoneyMath::multiply($averageBalance, $percentage / 100);

        return MoneyMath::add(
            MoneyMath::multiply($percentageAnnualFee, $yearsInPeriod),
            MoneyMath::multiply($flat, $yearsInPeriod),
        );
    }

    /**
     * @return array<int, array{month:string,gross_return_pct:float|null,net_return_pct:float|null,fees:float,is_projected:bool}>
     */
    public function monthlyFeeDragSeries(int $accountId, int $year): array
    {
        $series = [];
        $latestStatementClose = $this->latestStatementCloseForAccount($accountId, CarbonImmutable::create($year, 12, 31)->startOfDay());

        for ($month = 1; $month <= 12; $month++) {
            $start = CarbonImmutable::create($year, $month, 1)->startOfDay();
            $end = $start->endOfMonth();
            $fees = $this->actualFeesForPeriod($accountId, $start, $end, false)['total'];
            $cashFlows = $this->cashFlowsForPeriod($accountId, $start, $end);
            $startingBalance = $this->balanceAtPeriodStart($accountId, $start);
            $endingBalance = $this->balanceAtPeriodEnd($accountId, $start, $end);
            $returnMetrics = $this->periodReturnMetrics(
                $startingBalance,
                $endingBalance,
                $cashFlows['deposits'],
                $cashFlows['withdrawals'],
                $fees,
            );

            $series[] = [
                'month' => $start->format('Y-m'),
                'gross_return_pct' => $returnMetrics['gross_return_pct'],
                'net_return_pct' => $returnMetrics['net_return_pct'],
                'fees' => $fees,
                'is_projected' => $this->monthIsProjected($start, $latestStatementClose),
            ];
        }

        return $series;
    }

    /**
     * @param  array<int, int>  $accountIds
     * @return array<int, array{month:string,gross_return_pct:float|null,net_return_pct:float|null,fees:float,is_projected:bool}>
     */
    public function monthlyFeeDragSeriesForAccounts(array $accountIds, int $year): array
    {
        $accountIds = array_values(array_unique(array_map(static fn (mixed $accountId): int => (int) $accountId, $accountIds)));
        [$yearStart, $yearEnd] = $this->yearBounds($year);

        $feeTotalsByMonth = [];
        foreach ($this->feeLineItemsForAccountsForPeriod($accountIds, $yearStart, $yearEnd) as $row) {
            $month = CarbonImmutable::parse((string) $row->t_date)->format('Y-m');
            $feeTotalsByMonth[$month] = MoneyMath::add($feeTotalsByMonth[$month] ?? 0.0, $this->feeAmountForLineItem($row));
        }

        $cashFlows = $this->cashFlowsForAccountsForPeriod($accountIds, $yearStart, $yearEnd);
        $statements = FinStatement::query()
            ->whereIn('acct_id', $accountIds)
            ->whereNotNull('statement_closing_date')
            ->where('statement_closing_date', '<=', $yearEnd->toDateString())
            ->orderBy('statement_closing_date')
            ->orderBy('statement_id')
            ->get(['acct_id', 'balance', 'statement_closing_date', 'statement_id']);
        $statementsByAccount = $this->groupStatementsByAccount($statements);
        $latestStatementClose = $this->latestStatementCloseFromGroupedStatements($statementsByAccount);

        $series = [];
        for ($month = 1; $month <= 12; $month++) {
            $start = CarbonImmutable::create($year, $month, 1)->startOfDay();
            $end = $start->endOfMonth();
            $monthKey = $start->format('Y-m');
            $startingBalanceTotal = 0.0;
            $endingBalanceTotal = 0.0;
            $depositsTotal = 0.0;
            $withdrawalsTotal = 0.0;

            foreach ($accountIds as $accountId) {
                $accountStatements = $statementsByAccount[$accountId] ?? [];
                $startingBalance = $this->balanceOnOrBefore($accountStatements, $start->subDay())
                    ?? $this->balanceOnOrAfter($accountStatements, $start);
                $endingBalance = $this->balanceBetween($accountStatements, $start, $end);
                if ($startingBalance === null || $endingBalance === null) {
                    continue;
                }

                $accountCashFlows = $cashFlows[$accountId][$monthKey] ?? ['deposits' => 0.0, 'withdrawals' => 0.0];
                $startingBalanceTotal = MoneyMath::add($startingBalanceTotal, $startingBalance);
                $endingBalanceTotal = MoneyMath::add($endingBalanceTotal, $endingBalance);
                $depositsTotal = MoneyMath::add($depositsTotal, $accountCashFlows['deposits']);
                $withdrawalsTotal = MoneyMath::add($withdrawalsTotal, $accountCashFlows['withdrawals']);
            }

            $fees = $feeTotalsByMonth[$monthKey] ?? 0.0;
            $returnMetrics = $this->periodReturnMetrics(
                $startingBalanceTotal,
                $endingBalanceTotal,
                $depositsTotal,
                $withdrawalsTotal,
                $fees,
            );

            $series[] = [
                'month' => $monthKey,
                'gross_return_pct' => $returnMetrics['gross_return_pct'],
                'net_return_pct' => $returnMetrics['net_return_pct'],
                'fees' => $fees,
                'is_projected' => $this->monthIsProjected($start, $latestStatementClose),
            ];
        }

        return $series;
    }

    /**
     * @return array{net_return:float|null,gross_return:float|null,net_return_pct:float|null,gross_return_pct:float|null}
     */
    public function periodReturnMetrics(
        ?float $startingBalance,
        ?float $endingBalance,
        float $deposits,
        float $withdrawals,
        float $fees,
    ): array {
        if ($startingBalance === null || $endingBalance === null || $startingBalance === 0.0) {
            return [
                'net_return' => null,
                'gross_return' => null,
                'net_return_pct' => null,
                'gross_return_pct' => null,
            ];
        }

        $netReturn = $this->netReturn($startingBalance, $endingBalance, $deposits, $withdrawals);
        $grossReturn = MoneyMath::add($netReturn, $fees);

        return [
            'net_return' => $netReturn,
            'gross_return' => $grossReturn,
            'net_return_pct' => $this->annualizedReturnPct($netReturn, $startingBalance),
            'gross_return_pct' => $this->annualizedReturnPct($grossReturn, $startingBalance),
        ];
    }

    /**
     * @param  array{total:float,by_characteristic:array{fee_schE:float,fee_irc67g:float,untagged:float},line_items:array<int, array<string, mixed>>}|null  $actual
     * @return array<int, array{entity_name:string,k1_fees_schE:float,k1_fees_irc67g:float,statement_fees_schE:float,statement_fees_irc67g:float,delta_schE:float,delta_irc67g:float,status:string,tax_document_id:int|null,account_id:int}>
     */
    public function reconcileK1Fees(int $accountId, int $year, ?array $actual = null): array
    {
        $actual ??= $this->actualFeesForAccount($accountId, $year);
        $grossStatementFees = $this->grossStatementFeeBucketsForAccount($accountId, $year, $actual);
        $statementSchE = $grossStatementFees['fee_schE'];
        $statementIrc67g = $grossStatementFees['fee_irc67g'];

        $documents = FileForTaxDocument::query()
            ->with(['accountLinks', 'employmentEntity'])
            ->where('form_type', 'k1')
            ->where('tax_year', $year)
            ->where(function (Builder $query) use ($accountId, $year): void {
                $query
                    ->where('account_id', $accountId)
                    ->orWhereHas('accountLinks', function (Builder $linkQuery) use ($accountId, $year): void {
                        $linkQuery
                            ->where('account_id', $accountId)
                            ->where('form_type', 'k1')
                            ->where('tax_year', $year);
                    });
            })
            ->orderBy('id')
            ->get();

        if ($documents->count() > 1) {
            $k1Fees = ['schE' => 0.0, 'irc67g' => 0.0, 'has_unclassified_13zz' => false];

            foreach ($documents as $document) {
                $documentFees = $this->k1FeeBuckets($document);
                $k1Fees['schE'] = MoneyMath::add($k1Fees['schE'], $documentFees['schE']);
                $k1Fees['irc67g'] = MoneyMath::add($k1Fees['irc67g'], $documentFees['irc67g']);
                $k1Fees['has_unclassified_13zz'] = $k1Fees['has_unclassified_13zz'] || $documentFees['has_unclassified_13zz'];
            }

            return [
                $this->reconciliationRow(
                    'All linked K-1s',
                    $k1Fees,
                    $statementSchE,
                    $statementIrc67g,
                    null,
                    $accountId,
                ),
            ];
        }

        $rows = [];

        foreach ($documents as $document) {
            $k1Fees = $this->k1FeeBuckets($document);
            $rows[] = $this->reconciliationRow(
                $this->k1EntityName($document),
                $k1Fees,
                $statementSchE,
                $statementIrc67g,
                (int) $document->id,
                $accountId,
            );
        }

        return $rows;
    }

    public function feeAmountForLineItem(FinAccountLineItems $row): float
    {
        if ($this->isFeeType($row->t_type)) {
            return $this->signedFeeCostFromTransactionAmount($row->t_amt);
        }

        return $this->signedFeeCostFromFeeColumn($row->t_fee);
    }

    public function accountHasExpectedFees(FinAccounts $account): bool
    {
        return $account->expected_fee_pct !== null
            || $account->expected_fee_flat !== null
            || $account->expected_fee_notes !== null;
    }

    public function deltaStatus(float $actual, float $expected, bool $hasExpectation): ?string
    {
        if (! $hasExpectation) {
            return null;
        }

        if ($expected === 0.0) {
            if ($actual === 0.0) {
                return 'on_target';
            }

            return $actual < 0.0 ? 'under' : 'over';
        }

        $tolerance = abs($expected) * self::ON_TARGET_TOLERANCE;
        if ($actual < $expected - $tolerance) {
            return 'under';
        }

        if ($actual > $expected + $tolerance) {
            return 'over';
        }

        return 'on_target';
    }

    /**
     * @return array{0:CarbonImmutable,1:CarbonImmutable}
     */
    private function yearBounds(int $year): array
    {
        return [
            CarbonImmutable::create($year, 1, 1)->startOfDay(),
            CarbonImmutable::create($year, 12, 31)->startOfDay(),
        ];
    }

    /**
     * @return array{0:CarbonImmutable,1:CarbonImmutable,2:int}|null
     */
    private function accountPeriodForYear(FinAccounts $account, int $year): ?array
    {
        [$yearStart, $yearEnd] = $this->yearBounds($year);
        $openedAt = $this->accountOpenedAt($account) ?? $yearStart;
        $closedAt = $this->carbonFromMixed($account->when_closed)?->startOfDay();
        $periodStart = $openedAt->greaterThan($yearStart) ? $openedAt : $yearStart;
        $periodEnd = $closedAt instanceof CarbonImmutable && $closedAt->lessThan($yearEnd) ? $closedAt : $yearEnd;

        if ($periodEnd->lessThan($periodStart)) {
            return null;
        }

        return [$periodStart, $periodEnd, (int) $periodStart->diffInDays($periodEnd) + 1];
    }

    private function accountOpenedAt(FinAccounts $account): ?CarbonImmutable
    {
        $whenOpened = $this->carbonFromMixed($account->getAttribute('when_opened'));
        if ($whenOpened instanceof CarbonImmutable) {
            return $whenOpened->startOfDay();
        }

        $firstTransactionDate = FinAccountLineItems::query()
            ->where('t_account', $account->acct_id)
            ->whereNotNull('t_date')
            ->min('t_date');

        if ($firstTransactionDate !== null) {
            return CarbonImmutable::parse((string) $firstTransactionDate)->startOfDay();
        }

        $firstStatementDate = FinStatement::query()
            ->where('acct_id', $account->acct_id)
            ->whereNotNull('statement_closing_date')
            ->min('statement_closing_date');

        return $firstStatementDate !== null ? CarbonImmutable::parse((string) $firstStatementDate)->startOfDay() : null;
    }

    private function carbonFromMixed(mixed $value): ?CarbonImmutable
    {
        if ($value instanceof CarbonImmutable) {
            return $value;
        }

        if ($value instanceof CarbonInterface) {
            return CarbonImmutable::instance($value);
        }

        if (is_string($value) && trim($value) !== '') {
            return CarbonImmutable::parse($value);
        }

        return null;
    }

    private function avgBalanceForPeriod(int $accountId, CarbonImmutable $start, CarbonImmutable $end): float
    {
        $statements = FinStatement::query()
            ->where('acct_id', $accountId)
            ->whereNotNull('statement_closing_date')
            ->whereBetween('statement_closing_date', [$start->toDateString(), $end->toDateString()])
            ->orderBy('statement_closing_date')
            ->orderBy('statement_id')
            ->get(['balance']);

        if ($statements->count() >= 2) {
            $balances = $statements
                ->map(fn (FinStatement $statement): float => (float) $statement->balance)
                ->all();

            return MoneyMath::divide(MoneyMath::sum($balances), $statements->count());
        }

        $openingBalance = $this->statementBalanceOnOrBefore($accountId, $start->subDay())
            ?? $this->statementBalanceOnOrAfter($accountId, $start)
            ?? $this->accountLastBalance($accountId);
        $closingBalance = $this->statementBalanceOnOrBefore($accountId, $end)
            ?? $openingBalance;

        return MoneyMath::divide(MoneyMath::add($openingBalance, $closingBalance), 2);
    }

    /**
     * @return array{total:float,by_characteristic:array{fee_schE:float,fee_irc67g:float,untagged:float},line_items:array<int, array<string, mixed>>}
     */
    private function actualFeesForPeriod(int $accountId, CarbonImmutable $start, CarbonImmutable $end, bool $includeLineItems): array
    {
        $totals = $this->emptyFeeBuckets();
        $lineItems = [];

        foreach ($this->feeLineItemsForPeriod($accountId, $start, $end) as $row) {
            $feeAmount = $this->feeAmountForLineItem($row);
            if ($feeAmount === 0.0) {
                continue;
            }

            $bucket = $this->bucketForLineItem($row);
            $totals[$bucket] = MoneyMath::add($totals[$bucket], $feeAmount);

            if ($includeLineItems) {
                $lineItems[] = $this->lineItemPayload($row, $feeAmount, $bucket);
            }
        }

        return [
            'total' => MoneyMath::sum(array_values($totals)),
            'by_characteristic' => $totals,
            'line_items' => $lineItems,
        ];
    }

    /**
     * @return Collection<int, FinAccountLineItems>
     */
    private function feeLineItemsForPeriod(int $accountId, CarbonImmutable $start, CarbonImmutable $end): Collection
    {
        return $this->feeLineItemsForAccountsForPeriod([$accountId], $start, $end);
    }

    /**
     * @param  array<int, int>  $accountIds
     * @return Collection<int, FinAccountLineItems>
     */
    private function feeLineItemsForAccountsForPeriod(array $accountIds, CarbonImmutable $start, CarbonImmutable $end): Collection
    {
        return FinAccountLineItems::query()
            ->with('tags')
            ->whereIn('t_account', $accountIds)
            ->whereBetween('t_date', [$start->toDateString(), $end->toDateString()])
            ->where(function (Builder $query): void {
                $query
                    ->whereRaw("LOWER(COALESCE(t_type, '')) IN (?, ?, ?)", self::FEE_TRANSACTION_TYPES)
                    ->orWhereRaw('ABS(COALESCE(t_fee, 0)) > 0.000001')
                    ->orWhereHas('tags', function (Builder $tagQuery): void {
                        $tagQuery->whereIn('tax_characteristic', self::FEE_CHARACTERISTICS);
                    });
            })
            ->orderBy('t_date')
            ->orderBy('t_id')
            ->get();
    }

    private function bucketForLineItem(FinAccountLineItems $row): string
    {
        $characteristics = $this->lineItemFeeTags($row)
            ->pluck('tax_characteristic')
            ->filter()
            ->values()
            ->all();

        // Sch E wins when an item has both fee tags so deductible fee treatment is deterministic.
        foreach (self::FEE_CHARACTERISTICS as $characteristic) {
            if (in_array($characteristic, $characteristics, true)) {
                return $characteristic;
            }
        }

        return 'untagged';
    }

    /**
     * @return Collection<int, FinAccountTag>
     */
    private function lineItemFeeTags(FinAccountLineItems $row): Collection
    {
        $tags = $row->relationLoaded('tags') ? $row->tags : $row->tags()->get();

        return $tags->filter(
            static fn (FinAccountTag $tag): bool => in_array((string) $tag->tax_characteristic, self::FEE_CHARACTERISTICS, true),
        )->values();
    }

    private function isFeeType(mixed $type): bool
    {
        return is_string($type) && in_array(strtolower(trim($type)), self::FEE_TRANSACTION_TYPES, true);
    }

    private function signedFeeCostFromTransactionAmount(mixed $transactionAmount): float
    {
        return MoneyMath::subtract(0, (float) ($transactionAmount ?? 0));
    }

    private function signedFeeCostFromFeeColumn(mixed $feeAmount): float
    {
        return MoneyMath::round((float) ($feeAmount ?? 0));
    }

    /**
     * @param  array{total:float,by_characteristic:array{fee_schE:float,fee_irc67g:float,untagged:float},line_items:array<int, array<string, mixed>>}|null  $actual
     * @return array{fee_schE:float,fee_irc67g:float,untagged:float}
     */
    private function grossStatementFeeBucketsForAccount(int $accountId, int $year, ?array $actual): array
    {
        $lineItems = $actual['line_items'] ?? [];
        if ($lineItems !== []) {
            return $this->grossStatementFeeBucketsFromPayload($lineItems);
        }

        $account = FinAccounts::query()->where('acct_id', $accountId)->first();
        if ($account instanceof FinAccounts) {
            $period = $this->accountPeriodForYear($account, $year);
            if ($period === null) {
                return $this->emptyFeeBuckets();
            }

            [$start, $end] = $period;

            return $this->grossStatementFeeBucketsForPeriod($accountId, $start, $end);
        }

        [$start, $end] = $this->yearBounds($year);

        return $this->grossStatementFeeBucketsForPeriod($accountId, $start, $end);
    }

    /**
     * @param  array<int, array<string, mixed>>  $lineItems
     * @return array{fee_schE:float,fee_irc67g:float,untagged:float}
     */
    private function grossStatementFeeBucketsFromPayload(array $lineItems): array
    {
        $totals = $this->emptyFeeBuckets();

        foreach ($lineItems as $lineItem) {
            $feeAmount = MoneyMath::round(abs((float) ($lineItem['fee_amount'] ?? 0)));
            if ($feeAmount === 0.0) {
                continue;
            }

            $bucket = $this->bucketForPayloadLineItem($lineItem);
            $totals[$bucket] = MoneyMath::add($totals[$bucket], $feeAmount);
        }

        return $totals;
    }

    /**
     * @return array{fee_schE:float,fee_irc67g:float,untagged:float}
     */
    private function grossStatementFeeBucketsForPeriod(int $accountId, CarbonImmutable $start, CarbonImmutable $end): array
    {
        $totals = $this->emptyFeeBuckets();

        foreach ($this->feeLineItemsForPeriod($accountId, $start, $end) as $row) {
            $feeAmount = MoneyMath::round(abs($this->feeAmountForLineItem($row)));
            if ($feeAmount === 0.0) {
                continue;
            }

            $bucket = $this->bucketForLineItem($row);
            $totals[$bucket] = MoneyMath::add($totals[$bucket], $feeAmount);
        }

        return $totals;
    }

    /**
     * @param  array<string, mixed>  $lineItem
     */
    private function bucketForPayloadLineItem(array $lineItem): string
    {
        $characteristic = $lineItem['tax_characteristic'] ?? null;

        return is_string($characteristic) && in_array($characteristic, self::FEE_CHARACTERISTICS, true)
            ? $characteristic
            : 'untagged';
    }

    /**
     * @return array<string, mixed>
     */
    private function lineItemPayload(FinAccountLineItems $row, float $feeAmount, string $bucket): array
    {
        return [
            't_id' => (int) $row->t_id,
            't_account' => (int) $row->t_account,
            't_date' => $row->t_date,
            't_type' => $row->t_type,
            't_description' => $row->t_description,
            't_amt' => $row->t_amt !== null ? (float) $row->t_amt : null,
            't_fee' => $row->t_fee !== null ? (float) $row->t_fee : null,
            'fee_amount' => $feeAmount,
            'tax_characteristic' => $bucket === 'untagged' ? null : $bucket,
            'tags' => $row->tags->map(static fn (FinAccountTag $tag): array => [
                'tag_id' => (int) $tag->tag_id,
                'tag_userid' => (string) $tag->tag_userid,
                'tag_label' => (string) $tag->tag_label,
                'tag_color' => (string) $tag->tag_color,
                'tax_characteristic' => $tag->tax_characteristic,
            ])->values()->all(),
        ];
    }

    /**
     * @return array{deposits:float,withdrawals:float}
     */
    private function cashFlowsForPeriod(int $accountId, CarbonImmutable $start, CarbonImmutable $end): array
    {
        $cashFlows = $this->cashFlowsForAccountsForPeriod([$accountId], $start, $end);

        return $cashFlows[$accountId][$start->format('Y-m')] ?? ['deposits' => 0.0, 'withdrawals' => 0.0];
    }

    /**
     * @param  array<int, int>  $accountIds
     * @return array<int, array<string, array{deposits:float,withdrawals:float}>>
     */
    private function cashFlowsForAccountsForPeriod(array $accountIds, CarbonImmutable $start, CarbonImmutable $end): array
    {
        $cashFlows = [];

        $rows = FinAccountLineItems::query()
            ->whereIn('t_account', $accountIds)
            ->whereBetween('t_date', [$start->toDateString(), $end->toDateString()])
            ->whereIn('t_type', self::CASH_FLOW_TRANSACTION_TYPES)
            ->get(['t_account', 't_date', 't_type', 't_amt']);

        foreach ($rows as $row) {
            $accountId = (int) $row->t_account;
            $month = CarbonImmutable::parse((string) $row->t_date)->format('Y-m');
            $cashFlows[$accountId][$month] ??= ['deposits' => 0.0, 'withdrawals' => 0.0];
            $amount = (float) ($row->t_amt ?? 0);
            if ($row->t_type === 'Deposit') {
                $cashFlows[$accountId][$month]['deposits'] = MoneyMath::add($cashFlows[$accountId][$month]['deposits'], abs($amount));
            } elseif ($row->t_type === 'Withdrawal') {
                $cashFlows[$accountId][$month]['withdrawals'] = MoneyMath::add($cashFlows[$accountId][$month]['withdrawals'], abs($amount));
            } elseif ($row->t_type === 'Transfer' && $amount >= 0) {
                $cashFlows[$accountId][$month]['deposits'] = MoneyMath::add($cashFlows[$accountId][$month]['deposits'], $amount);
            } elseif ($row->t_type === 'Transfer') {
                $cashFlows[$accountId][$month]['withdrawals'] = MoneyMath::add($cashFlows[$accountId][$month]['withdrawals'], abs($amount));
            }
        }

        return $cashFlows;
    }

    private function netReturn(float $startingBalance, float $endingBalance, float $deposits, float $withdrawals): float
    {
        return MoneyMath::subtract(
            MoneyMath::add(MoneyMath::subtract($endingBalance, $startingBalance), $withdrawals),
            $deposits,
        );
    }

    private function annualizedReturnPct(float $periodReturn, float $startingBalance): float
    {
        return round(($periodReturn / $startingBalance) * 12 * 100, 4);
    }

    private function balanceAtPeriodStart(int $accountId, CarbonImmutable $start): ?float
    {
        return $this->statementBalanceOnOrBefore($accountId, $start->subDay())
            ?? $this->statementBalanceOnOrAfter($accountId, $start);
    }

    private function balanceAtPeriodEnd(int $accountId, CarbonImmutable $start, CarbonImmutable $end): ?float
    {
        $statement = FinStatement::query()
            ->where('acct_id', $accountId)
            ->whereNotNull('statement_closing_date')
            ->whereDate('statement_closing_date', '>=', $start->toDateString())
            ->whereDate('statement_closing_date', '<=', $end->toDateString())
            ->orderByDesc('statement_closing_date')
            ->orderByDesc('statement_id')
            ->first(['balance']);

        return $statement instanceof FinStatement ? (float) $statement->balance : null;
    }

    private function statementBalanceOnOrBefore(int $accountId, CarbonImmutable $date): ?float
    {
        $statement = FinStatement::query()
            ->where('acct_id', $accountId)
            ->whereNotNull('statement_closing_date')
            ->whereDate('statement_closing_date', '<=', $date->toDateString())
            ->orderByDesc('statement_closing_date')
            ->orderByDesc('statement_id')
            ->first(['balance']);

        return $statement instanceof FinStatement ? (float) $statement->balance : null;
    }

    private function statementBalanceOnOrAfter(int $accountId, CarbonImmutable $date): ?float
    {
        $statement = FinStatement::query()
            ->where('acct_id', $accountId)
            ->whereNotNull('statement_closing_date')
            ->whereDate('statement_closing_date', '>=', $date->toDateString())
            ->orderBy('statement_closing_date')
            ->orderBy('statement_id')
            ->first(['balance']);

        return $statement instanceof FinStatement ? (float) $statement->balance : null;
    }

    /**
     * Pre-group ascending-by-date statements by account so per-month lookups
     * don't rescan the full collection.
     *
     * @param  Collection<int, FinStatement>  $statements
     * @return array<int, array<int, array{date:CarbonImmutable,balance:float}>>
     */
    private function groupStatementsByAccount(Collection $statements): array
    {
        $byAccount = [];

        foreach ($statements as $statement) {
            $date = $this->carbonFromMixed($statement->statement_closing_date)?->startOfDay();
            if (! $date instanceof CarbonImmutable) {
                continue;
            }

            $byAccount[(int) $statement->acct_id][] = [
                'date' => $date,
                'balance' => (float) $statement->balance,
            ];
        }

        return $byAccount;
    }

    /**
     * @param  array<int, array{date:CarbonImmutable,balance:float}>  $statements
     */
    private function balanceOnOrBefore(array $statements, CarbonImmutable $date): ?float
    {
        $balance = null;

        foreach ($statements as $statement) {
            if ($statement['date']->greaterThan($date)) {
                break;
            }

            $balance = $statement['balance'];
        }

        return $balance;
    }

    /**
     * @param  array<int, array{date:CarbonImmutable,balance:float}>  $statements
     */
    private function balanceBetween(array $statements, CarbonImmutable $start, CarbonImmutable $end): ?float
    {
        $balance = null;

        foreach ($statements as $statement) {
            if ($statement['date']->greaterThan($end)) {
                break;
            }

            if ($statement['date']->greaterThanOrEqualTo($start)) {
                $balance = $statement['balance'];
            }
        }

        return $balance;
    }

    /**
     * @param  array<int, array{date:CarbonImmutable,balance:float}>  $statements
     */
    private function balanceOnOrAfter(array $statements, CarbonImmutable $date): ?float
    {
        foreach ($statements as $statement) {
            if ($statement['date']->greaterThanOrEqualTo($date)) {
                return $statement['balance'];
            }
        }

        return null;
    }

    private function accountLastBalance(int $accountId): float
    {
        $account = FinAccounts::query()->where('acct_id', $accountId)->first(['acct_last_balance']);

        return $account instanceof FinAccounts ? (float) $account->acct_last_balance : 0.0;
    }

    private function latestStatementCloseForAccount(int $accountId, CarbonImmutable $yearEnd): ?CarbonImmutable
    {
        $closingDate = FinStatement::query()
            ->where('acct_id', $accountId)
            ->whereNotNull('statement_closing_date')
            ->where('statement_closing_date', '<=', $yearEnd->toDateString())
            ->max('statement_closing_date');

        return $closingDate !== null ? CarbonImmutable::parse((string) $closingDate)->startOfDay() : null;
    }

    /**
     * @param  array<int, array<int, array{date:CarbonImmutable,balance:float}>>  $statementsByAccount
     */
    private function latestStatementCloseFromGroupedStatements(array $statementsByAccount): ?CarbonImmutable
    {
        $latest = null;

        foreach ($statementsByAccount as $accountStatements) {
            foreach ($accountStatements as $statement) {
                if (! $latest instanceof CarbonImmutable || $statement['date']->greaterThan($latest)) {
                    $latest = $statement['date'];
                }
            }
        }

        return $latest;
    }

    private function monthIsProjected(CarbonImmutable $monthStart, ?CarbonImmutable $latestStatementClose): bool
    {
        return ! $latestStatementClose instanceof CarbonImmutable || $monthStart->greaterThan($latestStatementClose);
    }

    /**
     * @return array{schE:float,irc67g:float,has_unclassified_13zz:bool}
     */
    private function k1FeeBuckets(FileForTaxDocument $document): array
    {
        $data = $document->parsed_data;
        if (! is_array($data) || ! is_array($data['codes'] ?? null)) {
            return ['schE' => 0.0, 'irc67g' => 0.0, 'has_unclassified_13zz' => false];
        }

        // Keep in sync with resources/js/lib/finance/k1RoutingNotes.ts — only
        // Box 13 K is routed to §67(g); Box 11 has no K-code fee mapping.
        $codes = $data['codes'];
        $irc67g = $this->sumK1CodeValues($codes, '13', 'K', 'value');
        $schE = $this->sumK1CodeValues($codes, '13', 'L', 'value');
        $hasUnclassified13zz = false;

        foreach ($this->k1CodeItems($codes, '13', 'ZZ') as $item) {
            if (array_key_exists('fee_subtotal', $item)) {
                $schE = MoneyMath::add($schE, abs($this->parseMoney($item['fee_subtotal']) ?? 0.0));
            } else {
                $hasUnclassified13zz = true;
            }
        }

        return [
            'schE' => MoneyMath::round($schE),
            'irc67g' => MoneyMath::round($irc67g),
            'has_unclassified_13zz' => $hasUnclassified13zz,
        ];
    }

    /**
     * @param  array<string, mixed>  $codes
     */
    private function sumK1CodeValues(array $codes, string $box, string $code, string $field): float
    {
        $values = [];

        foreach ($this->k1CodeItems($codes, $box, $code) as $item) {
            $values[] = abs($this->parseMoney($item[$field] ?? null) ?? 0.0);
        }

        return MoneyMath::sum($values);
    }

    /**
     * @param  array<string, mixed>  $codes
     * @return array<int, array<string, mixed>>
     */
    private function k1CodeItems(array $codes, string $box, string $code): array
    {
        $items = is_array($codes[$box] ?? null) ? $codes[$box] : [];

        return array_values(array_filter($items, static function (mixed $item) use ($code): bool {
            return is_array($item) && strtoupper((string) ($item['code'] ?? '')) === $code;
        }));
    }

    private function parseMoney(mixed $value): ?float
    {
        if (is_int($value) || is_float($value)) {
            return (float) $value;
        }

        if (! is_string($value)) {
            return null;
        }

        $raw = trim($value);
        if ($raw === '') {
            return null;
        }

        $isParenthetical = str_starts_with($raw, '(') && str_ends_with($raw, ')');
        $normalized = preg_replace('/[,$\s()]/', '', $raw);
        if ($normalized === null || $normalized === '' || ! is_numeric($normalized)) {
            return null;
        }

        $amount = (float) $normalized;

        return $isParenthetical ? -abs($amount) : $amount;
    }

    private function reconciliationStatus(float $deltaSchE, float $deltaIrc67g, bool $hasUnclassified13zz): string
    {
        if ($hasUnclassified13zz) {
            return 'unclassified';
        }

        if (abs($deltaSchE) > self::MISMATCH_THRESHOLD_USD || abs($deltaIrc67g) > self::MISMATCH_THRESHOLD_USD) {
            return 'mismatch';
        }

        return 'match';
    }

    /**
     * @param  array{schE:float,irc67g:float,has_unclassified_13zz:bool}  $k1Fees
     * @return array{entity_name:string,k1_fees_schE:float,k1_fees_irc67g:float,statement_fees_schE:float,statement_fees_irc67g:float,delta_schE:float,delta_irc67g:float,status:string,tax_document_id:int|null,account_id:int}
     */
    private function reconciliationRow(
        string $entityName,
        array $k1Fees,
        float $statementSchE,
        float $statementIrc67g,
        ?int $taxDocumentId,
        int $accountId,
    ): array {
        $deltaSchE = MoneyMath::subtract($statementSchE, $k1Fees['schE']);
        $deltaIrc67g = MoneyMath::subtract($statementIrc67g, $k1Fees['irc67g']);

        return [
            'entity_name' => $entityName,
            'k1_fees_schE' => $k1Fees['schE'],
            'k1_fees_irc67g' => $k1Fees['irc67g'],
            'statement_fees_schE' => $statementSchE,
            'statement_fees_irc67g' => $statementIrc67g,
            'delta_schE' => $deltaSchE,
            'delta_irc67g' => $deltaIrc67g,
            'status' => $this->reconciliationStatus($deltaSchE, $deltaIrc67g, $k1Fees['has_unclassified_13zz']),
            'tax_document_id' => $taxDocumentId,
            'account_id' => $accountId,
        ];
    }

    private function k1EntityName(FileForTaxDocument $document): string
    {
        $data = $document->parsed_data;
        $name = is_array($data) ? ($data['fields']['B']['value'] ?? null) : null;
        if (is_string($name) && trim($name) !== '') {
            return trim(explode("\n", $name)[0]);
        }

        if (trim($document->original_filename) !== '') {
            return $document->original_filename;
        }

        return "K-1 #{$document->id}";
    }

    /**
     * @return array{total:float,by_characteristic:array{fee_schE:float,fee_irc67g:float,untagged:float},line_items:array<int, array<string, mixed>>}
     */
    private function emptyActualFees(): array
    {
        return [
            'total' => 0.0,
            'by_characteristic' => $this->emptyFeeBuckets(),
            'line_items' => [],
        ];
    }

    /**
     * @return array{fee_schE:float,fee_irc67g:float,untagged:float}
     */
    private function emptyFeeBuckets(): array
    {
        return ['fee_schE' => 0.0, 'fee_irc67g' => 0.0, 'untagged' => 0.0];
    }
}
