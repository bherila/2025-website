<?php

namespace App\Http\Controllers;

use App\Models\FinAccounts;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

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

        if (! $account) {
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

        if (! $account) {
            abort(404, 'Account not found');
        }

        $accountName = $account->acct_name;

        return view('finance.summary', compact('account_id', 'accountName'));
    }

    public function statements(Request $request, $account_id)
    {
        $uid = Auth::id();

        $account = FinAccounts::where('acct_id', $account_id)
            ->where('acct_owner', $uid)
            ->first();

        if (! $account) {
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

        if (! $account) {
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

        if (! $account) {
            abort(404, 'Account not found');
        }

        return view('finance.import-transactions', ['account_id' => $account_id, 'accountName' => $account->acct_name]);
    }

    public function duplicates(Request $request, $account_id)
    {
        $uid = Auth::id();

        $account = FinAccounts::where('acct_id', $account_id)
            ->where('acct_owner', $uid)
            ->first();

        if (! $account) {
            abort(404, 'Account not found');
        }

        return view('finance.duplicates', ['account_id' => $account_id, 'accountName' => $account->acct_name]);
    }

    public function linker(Request $request, $account_id)
    {
        $uid = Auth::id();

        $account = FinAccounts::where('acct_id', $account_id)
            ->where('acct_owner', $uid)
            ->first();

        if (! $account) {
            abort(404, 'Account not found');
        }

        return view('finance.linker', ['account_id' => $account_id, 'accountName' => $account->acct_name]);
    }
}
