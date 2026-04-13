<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Models\Files\FileForFinAccount;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class FinanceApiController extends Controller
{
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
        ]);

        $uid = Auth::id();

        FinAccounts::create([
            'acct_owner' => $uid,
            'acct_name' => $request->accountName,
            'acct_is_debt' => $request->isDebt,
            'acct_is_retirement' => $request->isRetirement,
            'acct_last_balance' => '0',
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
            ->where('fs.acct_id', $account->acct_id)
            ->select(
                'fs.statement_id',
                'fs.statement_opening_date',
                'fs.statement_closing_date',
                'fs.balance',
                'fs.cost_basis',
                'fs.is_cost_basis_override',
                'fs.genai_job_id',
                DB::raw('count(DISTINCT fsd.id) as lineItemCount'),
                DB::raw('(count(DISTINCT ffa.id) > 0 OR fs.genai_job_id IS NOT NULL) as hasPdf')
            )
            ->groupBy('fs.statement_id', 'fs.statement_opening_date', 'fs.statement_closing_date', 'fs.balance', 'fs.cost_basis', 'fs.is_cost_basis_override', 'fs.genai_job_id')
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

        $result = $this->computeCostBasisForStatements($balances, $transactions);

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
     * @return array<int, array<string, mixed>>
     */
    private function computeCostBasisForStatements(Collection $balances, Collection $transactions): array
    {
        $txList = $transactions->values()->all();
        $txCount = count($txList);
        $txIndex = 0;
        $runningTotal = 0.0;
        $result = [];

        foreach ($balances as $statement) {
            $stmtDate = $statement->statement_closing_date;

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
            ];
        }

        return $result;
    }

    public function getSummary(Request $request, int $account_id): JsonResponse
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $lineItemsQuery = FinAccountLineItems::where('t_account', $account_id);

        // Filter by year if provided
        if ($request->has('year') && $request->year !== 'all') {
            $year = intval($request->year);
            $lineItemsQuery->whereYear('t_date', $year);
        }

        $totals = [
            'total_volume' => (clone $lineItemsQuery)->sum(DB::raw('ABS(t_amt)')),
            'total_commission' => (clone $lineItemsQuery)->sum('t_commission'),
            'total_fee' => (clone $lineItemsQuery)->sum('t_fee'),
        ];

        $symbolQuery = FinAccountLineItems::where('t_account', $account_id)
            ->whereNotNull('t_symbol');

        if ($request->has('year') && $request->year !== 'all') {
            $year = intval($request->year);
            $symbolQuery->whereYear('t_date', $year);
        }

        $symbolSummary = $symbolQuery
            ->select('t_symbol', DB::raw('SUM(t_amt) as total_amount'))
            ->groupBy('t_symbol')
            ->orderByRaw('SUM(t_amt) DESC')
            ->get()
            ->toArray();

        $monthQuery = FinAccountLineItems::where('t_account', $account_id);

        if ($request->has('year') && $request->year !== 'all') {
            $year = intval($request->year);
            $monthQuery->whereYear('t_date', $year);
        }

        $monthSummary = $monthQuery
            ->select(DB::raw("DATE_FORMAT(t_date, '%Y-%m') as month"), DB::raw('SUM(t_amt) as total_amount'))
            ->groupBy(DB::raw("DATE_FORMAT(t_date, '%Y-%m')"))
            ->orderBy('month', 'desc')
            ->get()
            ->toArray();

        return response()->json([
            'totals' => $totals,
            'symbolSummary' => $symbolSummary,
            'monthSummary' => $monthSummary,
        ]);
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

        $account->update($updates);

        return response()->json(['success' => true]);
    }

    public function deleteAccount(Request $request, int $account_id): JsonResponse
    {
        $uid = Auth::id();

        $account = FinAccounts::where('acct_id', $account_id)
            ->where('acct_owner', $uid)
            ->firstOrFail();

        DB::transaction(function () use ($account) {
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
