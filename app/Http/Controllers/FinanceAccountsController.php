<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use App\Models\FinAccounts;
use App\Models\FinAccountLineItems;

class FinanceAccountsController extends Controller
{
    public function index()
    {
        return view('finance.accounts');
    }

    public function show(Request $request, $account_id)
    {
        $uid = Auth::id();

        $account = FinAccounts::where('acct_id', $account_id)
            ->where('acct_owner', $uid)
            ->first();

        if (!$account) {
            abort(404, 'Account not found');
        }

        return view('finance.transactions', ['account_id' => $account_id, 'accountName' => $account->acct_name]);
    }

    public function summary(Request $request, $account_id)
    {
        $uid = Auth::id();

        $account = FinAccounts::where('acct_id', $account_id)
            ->where('acct_owner', $uid)
            ->first();

        if (!$account) {
            abort(404, 'Account not found');
        }

        $lineItemsQuery = FinAccountLineItems::where('t_account', $account_id)
            ->whereNull('when_deleted');

        $totals = [
            'total_volume' => $lineItemsQuery->sum(DB::raw('ABS(t_amt)')),
            'total_commission' => $lineItemsQuery->sum('t_commission'),
            'total_fee' => $lineItemsQuery->sum('t_fee'),
        ];

        $symbolSummary = FinAccountLineItems::where('t_account', $account_id)
            ->whereNull('when_deleted')
            ->whereNotNull('t_symbol')
            ->select('t_symbol', DB::raw('SUM(t_amt) as total_amount'))
            ->groupBy('t_symbol')
            ->orderByRaw('SUM(t_amt) DESC')
            ->get()
            ->toArray();

        $monthSummary = FinAccountLineItems::where('t_account', $account_id)
            ->whereNull('when_deleted')
            ->select(DB::raw("DATE_FORMAT(t_date, '%Y-%m') as month"), DB::raw('SUM(t_amt) as total_amount'))
            ->groupBy(DB::raw("DATE_FORMAT(t_date, '%Y-%m')"))
            ->orderBy('month', 'desc')
            ->get()
            ->toArray();

        $accountName = $account->acct_name;

        return view('finance.summary', compact('totals', 'symbolSummary', 'monthSummary', 'account_id', 'accountName'));
    }

    public function statements(Request $request, $account_id)
    {
        $uid = Auth::id();

        $account = FinAccounts::where('acct_id', $account_id)
            ->where('acct_owner', $uid)
            ->first();

        if (!$account) {
            abort(404, 'Account not found');
        }

        return view('finance.statements', ['account_id' => $account_id, 'accountName' => $account->acct_name]);
    }

    public function maintenance(Request $request, $account_id)
    {
        $uid = Auth::id();

        $account = FinAccounts::where('acct_id', $account_id)
            ->where('acct_owner', $uid)
            ->first();

        if (!$account) {
            abort(404, 'Account not found');
        }

        return view('finance.maintenance', [
            'account_id' => $account_id,
            'accountName' => $account->acct_name,
            'whenClosed' => $account->when_closed,
            'isDebt' => $account->acct_is_debt,
            'isRetirement' => $account->acct_is_retirement,
        ]);
    }

    public function showImportTransactionsPage(Request $request, $account_id)
    {
        $uid = Auth::id();

        $account = FinAccounts::where('acct_id', $account_id)
            ->where('acct_owner', $uid)
            ->first();

        if (!$account) {
            abort(404, 'Account not found');
        }

        return view('finance.import-transactions', ['account_id' => $account_id, 'accountName' => $account->acct_name]);
    }
}
