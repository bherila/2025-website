<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Http\Controllers\FinanceTool\Concerns\QueriesUserAccounts;
use App\Models\FinanceTool\FinAccountLineItems;
use Illuminate\Http\Request;

class FinanceAccountsController extends Controller
{
    use QueriesUserAccounts;

    public function showAllTransactions()
    {
        $years = FinAccountLineItems::whereIn('t_account', $this->getUserAccountIds())
            ->whereNotNull('t_date')
            ->pluck('t_date')
            ->map(fn ($date) => (int) substr((string) $date, 0, 4))
            ->filter(fn ($year) => $year > 0)
            ->unique()
            ->sort(fn ($a, $b) => $b - $a)
            ->values()
            ->toArray();

        return view('finance.account-all-transactions', ['availableYears' => $years]);
    }

    public function showAllLots()
    {
        $years = FinAccountLineItems::whereIn('t_account', $this->getUserAccountIds())
            ->whereNotNull('t_date')
            ->pluck('t_date')
            ->map(fn ($date) => (int) substr((string) $date, 0, 4))
            ->filter(fn ($year) => $year > 0)
            ->unique()
            ->sort(fn ($a, $b) => $b - $a)
            ->values()
            ->toArray();

        return view('finance.account-all-lots', ['availableYears' => $years]);
    }

    public function showAllImportPage()
    {
        // Multi-account import page - doesn't need to validate a specific account
        // The import component will handle account selection/mapping
        return view('finance.import-transactions-all', ['account_id' => 'all', 'accountName' => 'All Accounts']);
    }

    public function index()
    {
        return view('finance.accounts');
    }

    public function show(Request $request, $account_id)
    {
        $account = $this->resolveOwnedAccount($account_id);

        return view('finance.transactions', ['account_id' => $account_id, 'accountName' => $account->acct_name]);
    }

    public function summary(Request $request, $account_id)
    {
        $account = $this->resolveOwnedAccount($account_id);
        $accountName = $account->acct_name;

        return view('finance.summary', compact('account_id', 'accountName'));
    }

    public function statements(Request $request, $account_id)
    {
        $account = $this->resolveOwnedAccount($account_id);

        return view('finance.statements', ['account_id' => $account_id, 'accountName' => $account->acct_name]);
    }

    public function lots(Request $request, $account_id)
    {
        $account = $this->resolveOwnedAccount($account_id);

        return view('finance.lots', ['account_id' => $account_id, 'accountName' => $account->acct_name]);
    }

    public function maintenance(Request $request, $account_id)
    {
        $account = $this->resolveOwnedAccount($account_id);

        return view('finance.maintenance', [
            'account_id' => $account_id,
            'accountName' => $account->acct_name,
            'whenClosed' => $account->when_closed,
            'isDebt' => $account->acct_is_debt,
            'isRetirement' => $account->acct_is_retirement,
            'acctNumber' => $account->acct_number,
        ]);
    }

    public function showImportTransactionsPage(Request $request, $account_id)
    {
        $account = $this->resolveOwnedAccount($account_id);

        return view('finance.import-transactions', ['account_id' => $account_id, 'accountName' => $account->acct_name]);
    }

    public function duplicates(Request $request, $account_id)
    {
        $account = $this->resolveOwnedAccount($account_id);

        return view('finance.duplicates', ['account_id' => $account_id, 'accountName' => $account->acct_name]);
    }

    public function linker(Request $request, $account_id)
    {
        $account = $this->resolveOwnedAccount($account_id);

        return view('finance.linker', ['account_id' => $account_id, 'accountName' => $account->acct_name]);
    }
}
