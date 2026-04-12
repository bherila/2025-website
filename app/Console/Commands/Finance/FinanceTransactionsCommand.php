<?php

namespace App\Console\Commands\Finance;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;

class FinanceTransactionsCommand extends BaseFinanceCommand
{
    protected $signature = 'finance:transactions
        {--account= : Filter to a single account ID}
        {--year= : Filter by year (e.g. 2024)}
        {--month= : Filter by month 1–12; requires --year}
        {--type= : Filter by t_type (e.g. Buy, Sell, Dividend)}
        {--symbol= : Filter by ticker symbol}
        {--limit=100 : Max rows to return (0 = unlimited)}
        {--format=table : Output format: table or json}';

    protected $description = 'List transactions from one or all accounts for the configured user (FINANCE_CLI_USER_ID)';

    public function handle(): int
    {
        if (! $this->validateFormat()) {
            return 1;
        }

        $this->resolveUser();

        // Validate --month requires --year
        if ($this->option('month') !== null && $this->option('year') === null) {
            $this->error('--month requires --year to be specified.');

            return 1;
        }

        // Validate --year and --month ranges
        if ($this->option('year') !== null) {
            $year = (int) $this->option('year');
            if ($year < 1900 || $year > 9999) {
                $this->error("--year must be a 4-digit year (1900–9999), got '{$this->option('year')}'.");

                return 1;
            }
        }

        if ($this->option('month') !== null) {
            $month = (int) $this->option('month');
            if ($month < 1 || $month > 12) {
                $this->error("--month must be between 1 and 12, got '{$this->option('month')}'.");

                return 1;
            }
        }

        // Resolve account IDs the user is allowed to see, including closed accounts.
        $accountQuery = FinAccounts::withoutGlobalScopes()
            ->where('acct_owner', $this->userId());

        if ($this->option('account') !== null) {
            $accountQuery->where('acct_id', (int) $this->option('account'));
        }

        $accountIds = $accountQuery->pluck('acct_id');

        if ($accountIds->isEmpty()) {
            $this->line('No accounts found.');

            return 0;
        }

        // Build transaction query
        $query = FinAccountLineItems::query()
            ->with('account:acct_id,acct_name')
            ->whereIn('t_account', $accountIds)
            ->orderBy('t_date', 'desc')
            ->orderBy('t_id', 'desc');

        if ($this->option('year') !== null) {
            $year = (int) $this->option('year');

            if ($this->option('month') !== null) {
                $query->whereYear('t_date', $year)
                    ->whereMonth('t_date', (int) $this->option('month'));
            } else {
                $query->whereYear('t_date', $year);
            }
        }

        if ($this->option('type') !== null) {
            $query->where('t_type', $this->option('type'));
        }

        if ($this->option('symbol') !== null) {
            $query->where('t_symbol', strtoupper((string) $this->option('symbol')));
        }

        $limit = (int) $this->option('limit');
        if ($limit > 0) {
            $query->limit($limit);
        }

        $transactions = $query->get();

        $headers = ['t_id', 'account', 'date', 'type', 'symbol', 'qty', 'amount', 'description'];

        $rows = $transactions->map(fn (FinAccountLineItems $t) => [
            $t->t_id,
            $t->account?->acct_name ?? $t->t_account,
            $t->t_date,
            $t->t_type,
            $t->t_symbol ?? '',
            $t->t_qty !== null ? number_format((float) $t->t_qty, 4, '.', '') : '',
            number_format((float) $t->t_amt, 2),
            mb_strimwidth((string) ($t->t_description ?? ''), 0, 60, '…'),
        ])->toArray();

        $data = $transactions->map(fn (FinAccountLineItems $t) => $t->getAttributes())->values()->toArray();

        $this->outputData($headers, $rows, $data);

        return 0;
    }
}
