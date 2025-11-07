<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Models\FinAccounts;

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
}