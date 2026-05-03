<?php

namespace App\Console\Commands\Finance;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use App\Services\Finance\TransactionImportService;

class FinanceTransactionsCommand extends BaseFinanceCommand
{
    protected $signature = 'finance:transactions
        {--account= : Filter to a single account ID}
        {--year= : Filter by year (e.g. 2024)}
        {--month= : Filter by month 1–12; requires --year}
        {--type= : Filter by t_type (e.g. Buy, Sell, Dividend)}
        {--symbol= : Filter by ticker symbol}
        {--limit=100 : Max rows to return (0 = unlimited)}
        {--import : Import transactions from stdin instead of listing}
        {--dry-run : Validate import and display what would be inserted without committing}
        {--schema : Print the expected import input schema to stdout and exit}
        {--input-format=auto : Import stdin format: auto, json, or toon}
        {--format=table : Output format: table, json, or toon}';

    protected $description = 'List or import transactions for the configured user (FINANCE_CLI_USER_ID)';

    /**
     * Test hook: set this before calling artisan() in a feature test to inject
     * an import payload without faking STDIN. Reset to null after the test.
     *
     * @internal
     *
     * @var array<mixed>|null
     */
    public static ?array $testStdinOverride = null;

    /**
     * @return array<mixed>|null
     */
    protected function getStdinData(): ?array
    {
        if (static::$testStdinOverride !== null) {
            return static::$testStdinOverride;
        }

        return $this->readStructuredFromStdin((string) ($this->option('input-format') ?? 'auto'));
    }

    public function handle(TransactionImportService $transactionImportService): int
    {
        if ($this->option('schema')) {
            $this->emitSchema(TransactionImportService::inputSchema());

            return 0;
        }

        if (! $this->validateFormat(['table', 'json', 'toon'])) {
            return 1;
        }

        if ($this->resolveUser() === null) {
            return 1;
        }

        if ($this->option('import')) {
            return $this->handleImport($transactionImportService);
        }

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
        $accountQuery = FinAccounts::forOwner($this->userId());

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

    private function handleImport(TransactionImportService $transactionImportService): int
    {
        $payload = $this->getStdinData();

        if ($payload === null) {
            $this->error('No JSON or TOON payload received on stdin. Pipe a payload or use --schema to see the expected format.');

            return 1;
        }

        $defaultAccountId = TransactionImportService::defaultAccountIdFromPayload(
            $payload,
            $this->option('account') !== null ? (int) $this->option('account') : null,
        );

        $transactions = TransactionImportService::transactionsFromPayload($payload);

        if ($transactions === []) {
            $this->error('Payload must contain a non-empty "transactions" array.');

            return 1;
        }

        $result = $transactionImportService->importForUser($this->userId(), $transactions, [
            'dry_run' => (bool) $this->option('dry-run'),
            'default_account_id' => $defaultAccountId,
            'require_type' => true,
        ]);

        foreach ($result->errors as $error) {
            $this->error($error);
        }

        if ($result->hasErrors()) {
            return 1;
        }

        $structuredOutput = in_array($this->option('format') ?? 'table', ['json', 'toon'], true);

        if ($result->dryRun && $result->rows !== [] && ! $structuredOutput) {
            $this->info('[dry-run] The following rows would be inserted:');
            $previewHeaders = ['t_account', 't_date', 't_type', 't_amt', 't_symbol', 't_description'];
            $previewRows = array_map(fn (array $row): array => [
                $row['t_account'] ?? '',
                $row['t_date'] ?? '',
                $row['t_type'] ?? '',
                $row['t_amt'] ?? '',
                $row['t_symbol'] ?? '',
                mb_strimwidth((string) ($row['t_description'] ?? ''), 0, 50, '…'),
            ], $result->rows);
            $this->renderTable($previewHeaders, $previewRows);
        }

        $summaryHeaders = ['status', 'count'];
        $summaryRows = [
            [$result->dryRun ? 'would_insert' : 'inserted', $result->inserted],
            ['skipped_duplicate', $result->skippedDuplicate],
        ];

        $this->outputData($summaryHeaders, $summaryRows, $result->toArray());

        return 0;
    }
}
