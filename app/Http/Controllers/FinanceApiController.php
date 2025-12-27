<?php

namespace App\Http\Controllers;

use App\Models\FinAccountLineItems;
use App\Models\FinAccounts;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class FinanceApiController extends Controller
{
    public function accounts(Request $request)
    {
        $uid = Auth::id();

        $accounts = FinAccounts::where('acct_owner', $uid)
            ->whereNull('when_deleted')
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

        return response()->json([
            'assetAccounts' => $assetAccounts->values(),
            'liabilityAccounts' => $liabilityAccounts->values(),
            'retirementAccounts' => $retirementAccounts->values(),
            'activeChartAccounts' => $activeChartAccounts->values(),
        ]);
    }

    public function updateBalance(Request $request)
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

    public function createAccount(Request $request)
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

    public function chartData(Request $request)
    {
        $uid = Auth::id();

        $accounts = FinAccounts::where('acct_owner', $uid)
            ->whereNull('when_deleted')
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

    public function getBalanceTimeseries(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $balances = DB::table('fin_statements as fs')
            ->leftJoin('fin_statement_details as fsd', 'fs.statement_id', '=', 'fsd.statement_id')
            ->where('fs.acct_id', $account->acct_id)
            ->select('fs.statement_id', 'fs.statement_opening_date', 'fs.statement_closing_date', 'fs.balance', DB::raw('count(fsd.id) as lineItemCount'))
            ->groupBy('fs.statement_id', 'fs.statement_opening_date', 'fs.statement_closing_date', 'fs.balance')
            ->orderBy('fs.statement_closing_date', 'asc')
            ->get();

        return response()->json($balances);
    }

    public function getSummary(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $lineItemsQuery = FinAccountLineItems::where('t_account', $account_id)
            ->whereNull('when_deleted');

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
            ->whereNull('when_deleted')
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

        $monthQuery = FinAccountLineItems::where('t_account', $account_id)
            ->whereNull('when_deleted');

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

    public function deleteBalanceSnapshot(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $request->validate([
            'statement_closing_date' => 'required|string',
            'balance' => 'required|string',
        ]);

        DB::table('fin_statements')
            ->where('acct_id', $account->acct_id)
            ->where('statement_closing_date', $request->statement_closing_date)
            ->where('balance', $request->balance)
            ->delete();

        return response()->json(['success' => true]);
    }

    public function renameAccount(Request $request, $account_id)
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

    public function updateAccountClosed(Request $request, $account_id)
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

    public function updateAccountFlags(Request $request, $account_id)
    {
        $request->validate([
            'isDebt' => 'boolean',
            'isRetirement' => 'boolean',
        ]);

        $uid = Auth::id();

        $account = FinAccounts::where('acct_id', $account_id)
            ->where('acct_owner', $uid)
            ->firstOrFail();

        $account->update([
            'acct_is_debt' => $request->has('isDebt') ? $request->isDebt : $account->acct_is_debt,
            'acct_is_retirement' => $request->has('isRetirement') ? $request->isRetirement : $account->acct_is_retirement,
        ]);

        return response()->json(['success' => true]);
    }

    public function deleteAccount(Request $request, $account_id)
    {
        $uid = Auth::id();

        $account = FinAccounts::where('acct_id', $account_id)
            ->where('acct_owner', $uid)
            ->firstOrFail();

        DB::transaction(function () use ($account) {
            FinAccountLineItems::where('t_account', $account->acct_id)
                ->update(['when_deleted' => now()]);

            $account->update(['when_deleted' => now()]);
        });

        return response()->json(['success' => true]);
    }
}
