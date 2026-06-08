<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Models\Files\FileForFinAccount;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use App\Services\Finance\FeeAnalyticsService;
use App\Services\Finance\MoneyMath;
use App\Services\Finance\TransactionDeletionTombstoneService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\JoinClause;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class FinanceApiController extends Controller
{
    public function __construct(private readonly FeeAnalyticsService $feeAnalyticsService) {}

    public function accounts(Request $request): JsonResponse
    {
        $uid = Auth::id();

        $accounts = FinAccounts::where('acct_owner', $uid)
            ->orderBy('when_closed', 'asc')
            ->orderBy('acct_sort_order', 'asc')
            ->orderBy('acct_name', 'asc')
            ->get();

        $filterAndSortAccounts = function ($isDebt, $isRetirement) use ($accounts) {
            return $accounts->filter(function ($account) use ($isDebt, $isRetirement) {
                return ! $account->acct_is_debt == ! $isDebt && ! $account->acct_is_retirement == ! $isRetirement;
            });
        };

        $assetAccounts = $filterAndSortAccounts(false, false);
        $liabilityAccounts = $filterAndSortAccounts(true, false);
        $retirementAccounts = $filterAndSortAccounts(false, true);

        $activeChartAccounts = $accounts->filter(function ($account) {
            return is_null($account->when_closed);
        });

        $response = [
            'assetAccounts' => $assetAccounts->values(),
            'liabilityAccounts' => $liabilityAccounts->values(),
            'retirementAccounts' => $retirementAccounts->values(),
            'activeChartAccounts' => $activeChartAccounts->values(),
        ];

        // When active_year is provided, include account IDs that have transactions in that year.
        // Used by Account Documents section to sort accounts without activity to the bottom.
        if ($request->filled('active_year')) {
            $year = (int) $request->query('active_year');
            $startDate = "{$year}-01-01";
            $endDate = "{$year}-12-31";
            $allAccountIds = $accounts->pluck('acct_id')->toArray();
            $activeIds = FinAccountLineItems::whereIn('t_account', $allAccountIds)
                ->whereBetween('t_date', [$startDate, $endDate])
                ->distinct()
                ->pluck('t_account')
                ->toArray();
            $response['active_account_ids'] = $activeIds;
        }

        return response()->json($response);
    }

    public function updateBalance(Request $request): JsonResponse
    {
        $request->validate([
            'acct_id' => 'required|integer',
            'balance' => 'required|string',
        ]);

        $uid = Auth::id();

        FinAccounts::where('acct_id', $request->acct_id)
            ->where('acct_owner', $uid)
            ->update([
                'acct_last_balance' => $request->balance,
                'acct_last_balance_date' => now(),
            ]);

        DB::table('fin_statements')->insert([
            'acct_id' => $request->acct_id,
            'balance' => $request->balance,
            'statement_closing_date' => now()->format('Y-m-d'),
        ]);

        return response()->json(['success' => true]);
    }

    public function createAccount(Request $request): JsonResponse
    {
        $request->validate([
            'accountName' => 'required|string',
            'isDebt' => 'boolean',
            'isRetirement' => 'boolean',
            'capitalCommitment' => 'nullable|numeric|min:0',
            'capitalCommitmentCurrency' => 'nullable|string|size:3',
            'capitalCommitmentDate' => 'nullable|date',
            'capitalCommitmentNotes' => 'nullable|string|max:2000',
        ]);

        $uid = Auth::id();

        FinAccounts::create([
            'acct_owner' => $uid,
            'acct_name' => $request->accountName,
            'acct_is_debt' => $request->isDebt,
            'acct_is_retirement' => $request->isRetirement,
            'acct_last_balance' => '0',
            'acct_capital_commitment' => $request->input('capitalCommitment'),
            'acct_capital_commitment_currency' => $request->has('capitalCommitmentCurrency')
                ? $this->capitalCommitmentCurrency($request->input('capitalCommitmentCurrency'))
                : 'USD',
            'acct_capital_commitment_date' => $request->input('capitalCommitmentDate'),
            'acct_capital_commitment_notes' => $request->input('capitalCommitmentNotes'),
        ]);

        return response()->json(['success' => true]);
    }

    public function chartData(Request $request): JsonResponse
    {
        $uid = Auth::id();

        $accounts = FinAccounts::where('acct_owner', $uid)
            ->whereNull('when_closed')
            ->get();

        // Get balance history for active accounts
        $balanceHistory = DB::table('fin_statements')
            ->whereIn('acct_id', $accounts->pluck('acct_id')->toArray())
            ->orderBy('statement_closing_date', 'asc')
            ->get();

        // Group snapshots by quarter and account, keeping only the latest balance per quarter
        $quarterlyBalances = [];
        foreach ($balanceHistory as $statement) {
            $date = $statement->statement_closing_date;
            $quarter = date('Y', strtotime($date)).'-Q'.ceil(date('n', strtotime($date)) / 3);

            if (! isset($quarterlyBalances[$quarter])) {
                $quarterlyBalances[$quarter] = [];
            }

            // Always update the balance since we're iterating in chronological order
            $quarterlyBalances[$quarter][$statement->acct_id] = $statement->balance;
        }

        // Sort quarters chronologically
        ksort($quarterlyBalances);
        $sortedQuarters = array_keys($quarterlyBalances);

        // Convert to array format needed by chart, carrying forward previous balances
        $chartDataArray = [];
        foreach ($sortedQuarters as $index => $quarter) {
            $currentBalances = $quarterlyBalances[$quarter];
            $previousQuarter = $index > 0 ? $sortedQuarters[$index - 1] : null;
            $previousBalances = $previousQuarter ? $quarterlyBalances[$previousQuarter] : [];

            $row = [$quarter];
            foreach ($accounts as $account) {
                // Use current balance if available, otherwise use previous quarter's balance, or '0' if no previous
                $balance = $currentBalances[$account->acct_id] ?? $previousBalances[$account->acct_id] ?? '0';
                // Negate balance for liability accounts
                $row[] = $account->acct_is_debt ? '-'.$balance : $balance;
            }
            $chartDataArray[] = $row;
        }

        return response()->json([
            'data' => $chartDataArray,
            'labels' => $accounts->pluck('acct_name')->toArray(),
            'isNegative' => $accounts->pluck('acct_is_debt')->toArray(),
            'isRetirement' => $accounts->pluck('acct_is_retirement')->toArray(),
        ]);
    }

    public function getBalanceTimeseries(Request $request, int $account_id): JsonResponse
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $balances = DB::table('fin_statements as fs')
            ->leftJoin('fin_statement_details as fsd', 'fs.statement_id', '=', 'fsd.statement_id')
            ->leftJoin('files_for_fin_accounts as ffa', 'fs.statement_id', '=', 'ffa.statement_id')
            ->leftJoin('fin_documents as fd', function (JoinClause $join) use ($uid): void {
                $join->on('fs.document_id', '=', 'fd.id')
                    ->where('fd.user_id', '=', $uid);
            })
            ->where('fs.acct_id', $account->acct_id)
            ->select(
                'fs.statement_id',
                'fs.statement_opening_date',
                'fs.statement_closing_date',
                'fs.balance',
                'fs.cost_basis',
                'fs.is_cost_basis_override',
                'fs.genai_job_id',
                'fd.s3_path as document_s3_path',
                DB::raw('count(DISTINCT fsd.id) as lineItemCount'),
                DB::raw('(count(DISTINCT ffa.id) > 0 OR fs.genai_job_id IS NOT NULL OR fd.s3_path IS NOT NULL) as hasPdf')
            )
            ->groupBy('fs.statement_id', 'fs.statement_opening_date', 'fs.statement_closing_date', 'fs.balance', 'fs.cost_basis', 'fs.is_cost_basis_override', 'fs.genai_job_id', 'fd.s3_path')
            ->orderBy('fs.statement_closing_date', 'asc')
            ->get();

        // Fetch all relevant transactions in ascending date order
        $transactions = DB::table('fin_account_line_items')
            ->where('t_account', $account->acct_id)
            ->whereIn('t_type', ['Deposit', 'Withdrawal', 'Transfer'])
            ->orderBy('t_date', 'asc')
            ->orderBy('t_id', 'asc')
            ->select('t_date', 't_type', 't_amt')
            ->get();

        $returnMetrics = $this->feeAnalyticsService->statementReturnMetrics((int) $account->acct_id, $balances);
        $result = $this->computeCostBasisForStatements($balances, $transactions, $returnMetrics);

        return response()->json($result);
    }

    /**
     * Compute the cost basis for each statement using the account performance algorithm.
     *
     * Algorithm:
     * 1. Start with running total = 0.
     * 2. Process transactions in ascending date order.
     * 3. For each statement date, accumulate all transactions up to and including that date.
     * 4. Deposits add abs(amount), withdrawals subtract abs(amount), transfers add signed amount.
     * 5. If a statement has is_cost_basis_override=true, use the stored cost_basis and reset running total.
     *
     * @param  Collection<int, \stdClass>  $balances
     * @param  Collection<int, \stdClass>  $transactions
     * @param  array<int, array{return_pct:float|null,ytd_return_pct:float|null}>  $returnMetrics
     * @return array<int, array<string, mixed>>
     */
    private function computeCostBasisForStatements(Collection $balances, Collection $transactions, array $returnMetrics): array
    {
        $txList = $transactions->values()->all();
        $txCount = count($txList);
        $txIndex = 0;
        $runningTotal = 0.0;
        $result = [];

        foreach ($balances as $statement) {
            $stmtDate = $statement->statement_closing_date;
            $statementReturnMetrics = $returnMetrics[(int) $statement->statement_id] ?? [
                'return_pct' => null,
                'ytd_return_pct' => null,
            ];

            if (! $stmtDate) {
                $result[] = [
                    'statement_id' => $statement->statement_id,
                    'statement_opening_date' => $statement->statement_opening_date,
                    'statement_closing_date' => $statement->statement_closing_date,
                    'balance' => $statement->balance,
                    'cost_basis' => $runningTotal,
                    'is_cost_basis_override' => (bool) $statement->is_cost_basis_override,
                    'lineItemCount' => (int) $statement->lineItemCount,
                    'hasPdf' => (bool) $statement->hasPdf,
                    'return_pct' => $statementReturnMetrics['return_pct'],
                    'ytd_return_pct' => $statementReturnMetrics['ytd_return_pct'],
                ];

                continue;
            }

            // Apply all transactions up to and including this statement date
            while ($txIndex < $txCount) {
                $tx = $txList[$txIndex];
                if ($tx->t_date > $stmtDate) {
                    break;
                }
                $amount = (float) $tx->t_amt;
                if ($tx->t_type === 'Deposit') {
                    $runningTotal += abs($amount);
                } elseif ($tx->t_type === 'Withdrawal') {
                    $runningTotal -= abs($amount);
                } elseif ($tx->t_type === 'Transfer') {
                    $runningTotal += $amount;
                }
                $txIndex++;
            }

            // If this statement has an override, use override value and reset running total
            if ($statement->is_cost_basis_override) {
                $runningTotal = (float) $statement->cost_basis;
            }

            $result[] = [
                'statement_id' => $statement->statement_id,
                'statement_opening_date' => $statement->statement_opening_date,
                'statement_closing_date' => $statement->statement_closing_date,
                'balance' => $statement->balance,
                'cost_basis' => $runningTotal,
                'is_cost_basis_override' => (bool) $statement->is_cost_basis_override,
                'lineItemCount' => (int) $statement->lineItemCount,
                'hasPdf' => (bool) $statement->hasPdf,
                'return_pct' => $statementReturnMetrics['return_pct'],
                'ytd_return_pct' => $statementReturnMetrics['ytd_return_pct'],
            ];
        }

        return $result;
    }

    public function getSummary(Request $request, int $account_id): JsonResponse
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();
        $year = $this->selectedSummaryYear($request);

        $lineItemsQuery = $this->applySummaryYearFilter(
            FinAccountLineItems::query()->where('t_account', $account_id),
            $year,
        );

        $totals = [
            'total_volume' => (clone $lineItemsQuery)->sum(DB::raw('ABS(t_amt)')),
            'total_commission' => (clone $lineItemsQuery)->sum('t_commission'),
            'total_fee' => $this->summaryFeeTotal($account, $year),
        ];

        $symbolQuery = $this->applySummaryYearFilter(
            FinAccountLineItems::query()
                ->where('t_account', $account_id)
                ->whereNotNull('t_symbol'),
            $year,
        );

        $symbolSummary = $symbolQuery
            ->select('t_symbol', DB::raw('SUM(t_amt) as total_amount'))
            ->groupBy('t_symbol')
            ->orderByRaw('SUM(t_amt) DESC')
            ->get()
            ->toArray();

        $monthQuery = $this->applySummaryYearFilter(
            FinAccountLineItems::query()->where('t_account', $account_id),
            $year,
        );
        $monthExpression = $this->summaryMonthExpression();

        $monthSummary = $monthQuery
            ->select(DB::raw("{$monthExpression} as month"), DB::raw('SUM(t_amt) as total_amount'))
            ->groupBy(DB::raw($monthExpression))
            ->orderBy('month', 'desc')
            ->get()
            ->toArray();

        return response()->json([
            'totals' => $totals,
            'symbolSummary' => $symbolSummary,
            'monthSummary' => $monthSummary,
        ]);
    }

    private function selectedSummaryYear(Request $request): ?int
    {
        $year = $request->query('year');
        if ($year === null || ! is_scalar($year)) {
            return null;
        }

        $yearString = trim((string) $year);
        if ($yearString === '' || $yearString === 'all') {
            return null;
        }

        return (int) $yearString;
    }

    /**
     * @param  Builder<FinAccountLineItems>  $query
     * @return Builder<FinAccountLineItems>
     */
    private function applySummaryYearFilter(Builder $query, ?int $year): Builder
    {
        if ($year !== null) {
            $query->whereYear('t_date', $year);
        }

        return $query;
    }

    private function summaryFeeTotal(FinAccounts $account, ?int $year): float
    {
        if ($year !== null) {
            return (float) $this->feeAnalyticsService->actualFeesForAccount($account, $year, false)['total'];
        }

        $total = 0.0;
        foreach ($this->summaryActiveYears($account) as $activeYear) {
            $actual = $this->feeAnalyticsService->actualFeesForAccount($account, $activeYear, false);
            $total = MoneyMath::add($total, $actual['total']);
        }

        return $total;
    }

    /**
     * `year=all` on the Summary tab means every distinct transaction year for
     * the account, with each year's fee total still computed by FeeAnalyticsService.
     *
     * @return array<int, int>
     */
    private function summaryActiveYears(FinAccounts $account): array
    {
        return FinAccountLineItems::query()
            ->where('t_account', $account->acct_id)
            ->whereNotNull('t_date')
            ->select(DB::raw($this->summaryYearExpression().' as transaction_year'))
            ->distinct()
            ->orderBy('transaction_year')
            ->pluck('transaction_year')
            ->map(static fn (mixed $year): int => (int) $year)
            ->filter(static fn (int $year): bool => $year > 0)
            ->values()
            ->all();
    }

    private function summaryYearExpression(): string
    {
        return DB::connection()->getDriverName() === 'sqlite'
            ? "strftime('%Y', t_date)"
            : 'YEAR(t_date)';
    }

    private function summaryMonthExpression(): string
    {
        return DB::connection()->getDriverName() === 'sqlite'
            ? "strftime('%Y-%m', t_date)"
            : "DATE_FORMAT(t_date, '%Y-%m')";
    }

    public function deleteBalanceSnapshot(Request $request, int $account_id): JsonResponse
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $statementId = $request->input('statement_id');

        // Fallback to searching if statement_id is not provided (backwards compatibility)
        if (! $statementId) {
            $request->validate([
                'statement_closing_date' => 'required|string',
                'balance' => 'required|string',
            ]);

            $statement = DB::table('fin_statements')
                ->where('acct_id', $account->acct_id)
                ->where('statement_closing_date', $request->statement_closing_date)
                ->where('balance', $request->balance)
                ->first();

            if (! $statement) {
                return response()->json(['error' => 'Statement not found'], 404);
            }
            $statementId = $statement->statement_id;
        }

        DB::transaction(function () use ($statementId, $account) {
            // Find associated files to clear cache
            $files = DB::table('files_for_fin_accounts')
                ->where('statement_id', $statementId)
                ->where('acct_id', $account->acct_id)
                ->get();

            foreach ($files as $file) {
                if ($file->file_hash) {
                    Cache::forget("gemini_import:transactions:{$file->file_hash}");
                    Cache::forget("gemini_import:statement:{$file->file_hash}");
                }
            }

            // Un-link lots (not delete)
            DB::table('fin_account_lots')
                ->where('statement_id', $statementId)
                ->where('acct_id', $account->acct_id)
                ->update(['statement_id' => null]);

            // Un-link transactions (not delete)
            DB::table('fin_account_line_items')
                ->where('statement_id', $statementId)
                ->where('t_account', $account->acct_id)
                ->update(['statement_id' => null]);

            // Delete the statement (cascades to details)
            DB::table('fin_statements')
                ->where('statement_id', $statementId)
                ->where('acct_id', $account->acct_id)
                ->delete();
        });

        return response()->json(['success' => true]);
    }

    public function renameAccount(Request $request, int $account_id): JsonResponse
    {
        $request->validate([
            'newName' => 'required|string',
        ]);

        $uid = Auth::id();

        FinAccounts::where('acct_id', $account_id)
            ->where('acct_owner', $uid)
            ->firstOrFail()
            ->update(['acct_name' => $request->newName]);

        return response()->json(['success' => true]);
    }

    public function updateAccountClosed(Request $request, int $account_id): JsonResponse
    {
        $request->validate([
            'closedDate' => 'nullable|date',
        ]);

        $uid = Auth::id();

        FinAccounts::where('acct_id', $account_id)
            ->where('acct_owner', $uid)
            ->firstOrFail()
            ->update(['when_closed' => $request->closedDate]);

        return response()->json(['success' => true]);
    }

    public function updateAccountFlags(Request $request, int $account_id): JsonResponse
    {
        $request->validate([
            'isDebt' => 'boolean',
            'isRetirement' => 'boolean',
            'acctNumber' => 'nullable|string|max:255',
            'expectedFeePct' => 'nullable|numeric|min:0|max:999.9999',
            'expectedFeeFlat' => 'nullable|numeric|min:0',
            'expectedFeeNotes' => 'nullable|string|max:255',
            'capitalCommitment' => 'nullable|numeric|min:0',
            'capitalCommitmentCurrency' => 'nullable|string|size:3',
            'capitalCommitmentDate' => 'nullable|date',
            'capitalCommitmentNotes' => 'nullable|string|max:2000',
        ]);

        $uid = Auth::id();

        $account = FinAccounts::where('acct_id', $account_id)
            ->where('acct_owner', $uid)
            ->firstOrFail();

        $updates = [
            'acct_is_debt' => $request->has('isDebt') ? $request->isDebt : $account->acct_is_debt,
            'acct_is_retirement' => $request->has('isRetirement') ? $request->isRetirement : $account->acct_is_retirement,
        ];

        if ($request->has('acctNumber')) {
            $updates['acct_number'] = $request->acctNumber ?: null;
        }

        if ($request->has('expectedFeePct')) {
            $updates['expected_fee_pct'] = $request->input('expectedFeePct');
        }

        if ($request->has('expectedFeeFlat')) {
            $updates['expected_fee_flat'] = $request->input('expectedFeeFlat');
        }

        if ($request->has('expectedFeeNotes')) {
            $updates['expected_fee_notes'] = $request->input('expectedFeeNotes') ?: null;
        }

        if ($request->has('capitalCommitment')) {
            $updates['acct_capital_commitment'] = $request->input('capitalCommitment');
        }

        if ($request->has('capitalCommitmentCurrency')) {
            $updates['acct_capital_commitment_currency'] = $this->capitalCommitmentCurrency($request->input('capitalCommitmentCurrency'));
        }

        if ($request->has('capitalCommitmentDate')) {
            $updates['acct_capital_commitment_date'] = $request->input('capitalCommitmentDate') ?: null;
        }

        if ($request->has('capitalCommitmentNotes')) {
            $updates['acct_capital_commitment_notes'] = $request->input('capitalCommitmentNotes') ?: null;
        }

        $account->update($updates);

        return response()->json(['success' => true]);
    }

    private function capitalCommitmentCurrency(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $currency = trim((string) $value);

        return $currency === '' ? null : strtoupper($currency);
    }

    public function deleteAccount(Request $request, int $account_id, TransactionDeletionTombstoneService $tombstones): JsonResponse
    {
        $uid = Auth::id();

        $account = FinAccounts::where('acct_id', $account_id)
            ->where('acct_owner', $uid)
            ->firstOrFail();

        DB::transaction(function () use ($account, $tombstones, $uid): void {
            $transactions = FinAccountLineItems::where('t_account', $account->acct_id)->get(['t_id', 't_account']);
            $tombstones->record($transactions, (int) $uid);

            FinAccountLineItems::where('t_account', $account->acct_id)->delete();

            // Delete file records individually so each model's booted() deleting
            // event fires and dispatches DeleteS3Object. A plain $account->delete()
            // would cascade at the DB level, bypassing those Eloquent events.
            FileForFinAccount::where('acct_id', $account->acct_id)->each(function (FileForFinAccount $file): void {
                $file->delete();
            });

            $account->delete();
        });

        return response()->json(['success' => true]);
    }
}
