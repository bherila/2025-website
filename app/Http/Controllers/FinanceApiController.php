<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use App\Models\FinAccounts;
use App\Models\FinAccountLineItems;
use App\Models\FinAccountTag;
use App\Models\FinAccountLineItemTagMap;

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
                return !$account->acct_is_debt == !$isDebt && !$account->acct_is_retirement == !$isRetirement;
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

        DB::table('fin_account_balance_snapshot')->insert([
            'acct_id' => $request->acct_id,
            'balance' => $request->balance,
            'when_added' => now(),
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
        $balanceHistory = DB::table('fin_account_balance_snapshot')
            ->whereIn('acct_id', $accounts->pluck('acct_id')->toArray())
            ->orderBy('when_added', 'asc')
            ->get();

        // Group snapshots by quarter and account, keeping only the latest balance per quarter
        $quarterlyBalances = [];
        foreach ($balanceHistory as $snapshot) {
            $date = $snapshot->when_added;
            $quarter = date('Y', strtotime($date)) . '-Q' . ceil(date('n', strtotime($date)) / 3);

            if (!isset($quarterlyBalances[$quarter])) {
                $quarterlyBalances[$quarter] = [];
            }

            // Always update the balance since we're iterating in chronological order
            $quarterlyBalances[$quarter][$snapshot->acct_id] = $snapshot->balance;
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
                $row[] = $account->acct_is_debt ? '-' . $balance : $balance;
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

    public function getLineItems(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $lineItems = FinAccountLineItems::where('t_account', $account->acct_id)
            ->with('tags')
            ->orderBy('t_date', 'desc')
            ->get();

        return response()->json($lineItems);
    }

    public function deleteLineItem(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $request->validate([
            't_id' => 'required|integer',
        ]);

        FinAccountLineItems::where('t_id', $request->t_id)
            ->where('t_account', $account->acct_id)
            ->delete();

        return response()->json(['success' => true]);
    }

    public function getUserTags(Request $request)
    {
        $uid = Auth::id();

        $tags = FinAccountTag::where('tag_userid', $uid)
            ->whereNull('when_deleted')
            ->get(['tag_id', 'tag_label', 'tag_color']);

        return response()->json($tags);
    }

    public function applyTagToTransactions(Request $request)
    {
        $uid = Auth::id();

        $request->validate([
            'tag_id' => 'required|integer',
            'transaction_ids' => 'required|string',
        ]);

        $tag = FinAccountTag::where('tag_id', $request->tag_id)
            ->where('tag_userid', $uid)
            ->firstOrFail();

        $transaction_ids = explode(',', $request->transaction_ids);

        foreach ($transaction_ids as $transaction_id) {
            FinAccountLineItemTagMap::updateOrCreate(
                [
                    't_id' => $transaction_id,
                    'tag_id' => $tag->tag_id,
                ],
                [
                    'when_deleted' => null,
                ]
            );
        }

        return response()->json(['success' => true]);
    }

    public function updateTransactionComment(Request $request, $transaction_id)
    {
        $uid = Auth::id();

        $request->validate([
            'comment' => 'nullable|string',
        ]);

        $lineItem = FinAccountLineItems::where('t_id', $transaction_id)
            ->whereHas('account', function ($query) use ($uid) {
                $query->where('acct_owner', $uid);
            })
            ->firstOrFail();

        $lineItem->update(['t_comment' => $request->comment]);

        return response()->json(['success' => true]);
    }

    public function getBalanceTimeseries(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $balances = DB::table('fin_account_balance_snapshot')
            ->where('acct_id', $account->acct_id)
            ->orderBy('when_added', 'asc')
            ->select('when_added', 'balance')
            ->get();

        return response()->json($balances);
    }

    public function deleteBalanceSnapshot(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $request->validate([
            'when_added' => 'required|string',
            'balance' => 'required|string',
        ]);

        DB::table('fin_account_balance_snapshot')
            ->where('acct_id', $account->acct_id)
            ->where('when_added', $request->when_added)
            ->where('balance', $request->balance)
            ->delete();

        return response()->json(['success' => true]);
    }

    public function addBalanceSnapshot(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $request->validate([
            'balance' => 'required|string',
            'when_added' => 'required|date',
        ]);

        DB::table('fin_account_balance_snapshot')->insert([
            'acct_id' => $account->acct_id,
            'balance' => $request->balance,
            'when_added' => $request->when_added,
        ]);

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
