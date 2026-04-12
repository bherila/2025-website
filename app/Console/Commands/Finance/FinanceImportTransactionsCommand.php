<?php

namespace App\Console\Commands\Finance;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use Illuminate\Support\Facades\DB;

class FinanceImportTransactionsCommand extends BaseFinanceCommand
{
    protected $signature = 'finance:import-transactions
        {--account= : Default account ID when not specified per-row in the payload}
        {--dry-run : Validate and display what would be inserted without committing}
        {--schema : Print the expected JSON input schema to stdout and exit}
        {--format=table : Output format for the result summary: table or json}';

    protected $description = 'Import transactions from a JSON payload on stdin into fin_account_line_items';

    /** @var array<mixed> */
    private const INPUT_SCHEMA = [
        'description' => 'Input schema for finance:import-transactions. Pass via stdin.',
        'type' => 'object',
        'required' => ['transactions'],
        'properties' => [
            'account_id' => [
                'type' => 'integer',
                'description' => 'Default account ID for all rows. Overrides --account flag. Per-row t_account takes precedence over this.',
            ],
            'transactions' => [
                'type' => 'array',
                'items' => [
                    'type' => 'object',
                    'required' => ['t_date', 't_type', 't_amt'],
                    'properties' => [
                        't_account' => ['type' => 'integer', 'description' => 'Account ID. Overrides payload account_id and --account.'],
                        't_date' => ['type' => 'string', 'format' => 'date', 'description' => 'Transaction date (YYYY-MM-DD).'],
                        't_type' => ['type' => 'string', 'description' => 'Transaction type (e.g. Buy, Sell, Dividend, deposit, withdrawal).'],
                        't_amt' => ['type' => 'number', 'description' => 'Amount (negative = debit/cost, positive = credit/proceeds).'],
                        't_symbol' => ['type' => 'string', 'description' => 'Ticker symbol (optional).'],
                        't_qty' => ['type' => 'number', 'description' => 'Quantity (shares/contracts; negative for sales).'],
                        't_price' => ['type' => 'number', 'description' => 'Price per share/contract.'],
                        't_commission' => ['type' => 'number'],
                        't_fee' => ['type' => 'number'],
                        't_method' => ['type' => 'string', 'description' => 'Broker method string (e.g. BUY, SELL, BUY TO OPEN).'],
                        't_description' => ['type' => 'string'],
                        't_comment' => ['type' => 'string'],
                        't_source' => ['type' => 'string', 'description' => 'Import source identifier.'],
                        't_origin' => ['type' => 'string', 'enum' => ['manual', 'import', 'api']],
                        'opt_expiration' => ['type' => 'string', 'format' => 'date', 'description' => 'Options expiration date.'],
                        'opt_type' => ['type' => 'string', 'enum' => ['call', 'put']],
                        'opt_strike' => ['type' => 'number'],
                    ],
                ],
            ],
        ],
    ];

    /**
     * Test hook: set this before calling artisan() in a feature test to inject
     * a payload without faking STDIN. Reset to null after the test.
     *
     * @internal
     *
     * @var array<mixed>|null
     */
    public static ?array $testStdinOverride = null;

    /**
     * Return the parsed stdin payload.
     *
     * In feature tests, set $testStdinOverride directly on the class.
     *
     * @return array<mixed>|null
     */
    protected function getStdinData(): ?array
    {
        if (static::$testStdinOverride !== null) {
            return static::$testStdinOverride;
        }

        return $this->readJsonFromStdin();
    }

    public function handle(): int
    {
        if ($this->option('schema')) {
            $this->emitSchema(self::INPUT_SCHEMA);

            return 0;
        }

        if (! $this->validateFormat()) {
            return 1;
        }

        $payload = $this->getStdinData();

        if ($payload === null) {
            $this->error('No JSON payload received on stdin. Pipe a JSON object or use --schema to see the expected format.');

            return 1;
        }

        // Resolve default account ID: per-payload > --account flag
        $defaultAccountId = isset($payload['account_id'])
            ? (int) $payload['account_id']
            : ($this->option('account') !== null ? (int) $this->option('account') : null);

        $transactions = $payload['transactions'] ?? null;

        if (! is_array($transactions) || empty($transactions)) {
            $this->error('Payload must contain a non-empty "transactions" array.');

            return 1;
        }

        // Cache valid account IDs for the user to prevent inserting into another user's account
        $validAccountIds = FinAccounts::withoutGlobalScopes()
            ->where('acct_owner', $this->userId())
            ->pluck('acct_id')
            ->flip()
            ->toArray();

        $toInsert = [];
        $skipped = [];
        $errors = [];

        foreach ($transactions as $index => $row) {
            if (! is_array($row)) {
                $errors[] = "Row {$index}: not an object, skipped.";

                continue;
            }

            // Resolve account ID: per-row > payload-level > --account
            $accountId = isset($row['t_account'])
                ? (int) $row['t_account']
                : $defaultAccountId;

            if ($accountId === null) {
                $errors[] = "Row {$index}: no account_id. Provide t_account in the row, account_id in the payload, or --account.";

                continue;
            }

            if (! isset($validAccountIds[$accountId])) {
                $errors[] = "Row {$index}: account {$accountId} not found or not owned by this user.";

                continue;
            }

            // Validate required fields
            foreach (['t_date', 't_type', 't_amt'] as $required) {
                if (! isset($row[$required]) || $row[$required] === '') {
                    $errors[] = "Row {$index}: missing required field '{$required}'.";

                    continue 2;
                }
            }

            $row['t_account'] = $accountId;

            // Deduplication: check for existing row with same key tuple
            $exists = FinAccountLineItems::query()
                ->where('t_account', $accountId)
                ->where('t_date', $row['t_date'])
                ->where('t_type', $row['t_type'])
                ->where('t_amt', $row['t_amt'])
                ->where('t_symbol', $row['t_symbol'] ?? null)
                ->exists();

            if ($exists) {
                $skipped[] = $row;

                continue;
            }

            // Filter to only fillable columns
            $fillable = (new FinAccountLineItems)->getFillable();
            $toInsert[] = array_intersect_key($row, array_flip($fillable));
        }

        foreach ($errors as $error) {
            $this->error($error);
        }

        if (! empty($errors)) {
            return 1;
        }

        $isDryRun = $this->option('dry-run');

        if (! $isDryRun && ! empty($toInsert)) {
            DB::table('fin_account_line_items')->insert($toInsert);
        }

        // Summary output
        $summaryHeaders = ['status', 'count'];
        $summaryRows = [
            [$isDryRun ? 'would_insert' : 'inserted', count($toInsert)],
            ['skipped_duplicate', count($skipped)],
        ];
        $summaryData = [
            'dry_run' => $isDryRun,
            'inserted' => count($toInsert),
            'skipped_duplicate' => count($skipped),
            'rows' => $isDryRun ? $toInsert : [],
        ];

        if ($isDryRun && ! empty($toInsert)) {
            $this->info('[dry-run] The following rows would be inserted:');
            $previewHeaders = ['t_account', 't_date', 't_type', 't_amt', 't_symbol', 't_description'];
            $previewRows = array_map(fn ($r) => [
                $r['t_account'] ?? '',
                $r['t_date'] ?? '',
                $r['t_type'] ?? '',
                $r['t_amt'] ?? '',
                $r['t_symbol'] ?? '',
                mb_strimwidth((string) ($r['t_description'] ?? ''), 0, 50, '…'),
            ], $toInsert);
            $this->renderTable($previewHeaders, $previewRows);
        }

        $this->outputData($summaryHeaders, $summaryRows, $summaryData);

        return 0;
    }
}
