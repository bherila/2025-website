<?php

namespace App\Console\Commands\Finance;

use App\Models\FinanceTool\FinAccounts;

class FinanceAccountsCommand extends BaseFinanceCommand
{
    protected $signature = 'finance:accounts
        {--format=table : Output format: table or json}
        {--include-closed : Include accounts with a when_closed date}';

    protected $description = 'List all financial accounts for the configured user (FINANCE_CLI_USER_ID)';

    public function handle(): int
    {
        if (! $this->validateFormat()) {
            return 1;
        }

        if ($this->resolveUser() === null) {
            return 1;
        }

        $query = FinAccounts::forOwner($this->userId())
            ->orderBy('acct_sort_order')
            ->orderBy('acct_name');

        if (! $this->option('include-closed')) {
            $query->whereNull('when_closed');
        }

        $accounts = $query->get();

        $headers = ['acct_id', 'name', 'number', 'balance', 'debt', 'retirement', 'closed'];

        $rows = $accounts->map(fn (FinAccounts $a) => [
            $a->acct_id,
            $a->acct_name,
            $a->acct_number ?? '',
            number_format((float) $a->acct_last_balance, 2),
            $a->acct_is_debt ? 'yes' : 'no',
            $a->acct_is_retirement ? 'yes' : 'no',
            $a->when_closed?->toDateString() ?? '',
        ])->toArray();

        $data = $accounts->map(fn (FinAccounts $a) => [
            'acct_id' => $a->acct_id,
            'acct_name' => $a->acct_name,
            'acct_number' => $a->acct_number,
            'acct_last_balance' => $a->acct_last_balance,
            'acct_is_debt' => $a->acct_is_debt,
            'acct_is_retirement' => $a->acct_is_retirement,
            'when_closed' => $a->when_closed?->toDateString(),
        ])->values()->toArray();

        $this->outputData($headers, $rows, $data);

        return 0;
    }
}
