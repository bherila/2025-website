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
                        't_symbol' => ['type' => ['string', 'null'], 'description' => 'Ticker symbol (optional, nullable). Normalized to uppercase on import.'],
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

        $this->resolveUser();

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

        // Fillable columns, excluding statement_id which must not be set by the importer
        // to prevent linking a row to a statement owned by a different account/user.
        $allowedFields = array_diff((new FinAccountLineItems)->getFillable(), ['statement_id']);

        $validRows = [];
        $errors = [];

        foreach ($transactions as $index => $row) {
            if (! is_array($row)) {
                $errors[] = "Row {$index}: not an object. This is an error and the import will fail.";

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

            // Validate t_date format and calendar validity (YYYY-MM-DD)
            $dateStr = (string) $row['t_date'];
            $parsedDate = \DateTime::createFromFormat('Y-m-d', $dateStr);
            $dateParseErrors = \DateTime::getLastErrors();
            if ($parsedDate === false || ($dateParseErrors && ($dateParseErrors['error_count'] > 0 || $dateParseErrors['warning_count'] > 0))) {
                $errors[] = "Row {$index}: t_date must be a valid date in YYYY-MM-DD format, got '{$dateStr}'.";

                continue;
            }

            // Validate t_amt is numeric
            if (! is_numeric($row['t_amt'])) {
                $errors[] = "Row {$index}: t_amt must be numeric, got '{$row['t_amt']}'.";

                continue;
            }

            $row['t_account'] = $accountId;

            // Normalize t_symbol: trim whitespace, uppercase, and convert empty string to null
            $normalizedSymbol = null;
            if (array_key_exists('t_symbol', $row) && $row['t_symbol'] !== null) {
                $normalizedSymbol = trim((string) $row['t_symbol']);
                $normalizedSymbol = $normalizedSymbol === '' ? null : strtoupper($normalizedSymbol);
            }
            $row['t_symbol'] = $normalizedSymbol;

            // Filter to only allowed fillable columns (strips statement_id and unknown fields)
            $validRows[] = array_intersect_key($row, array_flip($allowedFields));
        }

        foreach ($errors as $error) {
            $this->error($error);
        }

        if (! empty($errors)) {
            return 1;
        }

        // Batch deduplication: pre-fetch existing tuples per account, scoped to the date
        // range of rows being imported, to avoid loading entire account history into memory.
        $toInsert = [];
        $skipped = [];

        /** @var array<int, array<string, bool>> $existingByAccount */
        $existingByAccount = [];
        $accountIdsInBatch = array_unique(array_column($validRows, 't_account'));

        // Build a per-account date range from the incoming batch to limit the pre-fetch query
        /** @var array<int, list<string>> $datesByAccount */
        $datesByAccount = [];
        foreach ($validRows as $row) {
            $datesByAccount[(int) $row['t_account']][] = $row['t_date'];
        }

        foreach ($accountIdsInBatch as $acctId) {
            $accountDates = $datesByAccount[$acctId] ?? [];
            $existing = FinAccountLineItems::query()
                ->where('t_account', $acctId)
                ->whereBetween('t_date', [min($accountDates), max($accountDates)])
                ->get(['t_date', 't_type', 't_amt', 't_symbol']);

            foreach ($existing as $ex) {
                $key = $ex->t_date.'|'.$ex->t_type.'|'.$ex->t_amt.'|'.($ex->t_symbol ?? '');
                $existingByAccount[$acctId][$key] = true;
            }
        }

        foreach ($validRows as $row) {
            $acctId = (int) $row['t_account'];
            $key = $row['t_date'].'|'.$row['t_type'].'|'.$row['t_amt'].'|'.($row['t_symbol'] ?? '');

            if (isset($existingByAccount[$acctId][$key])) {
                $skipped[] = $row;
            } else {
                $toInsert[] = $row;
                // Track in-memory to handle duplicates within the same import batch
                $existingByAccount[$acctId][$key] = true;
            }
        }

        $isDryRun = $this->option('dry-run');
        $isJson = ($this->option('format') ?? 'table') === 'json';

        if (! $isDryRun && ! empty($toInsert)) {
            DB::table('fin_account_line_items')->insert($toInsert);
        }

        // Dry-run preview: suppressed in JSON mode to keep stdout valid JSON
        if ($isDryRun && ! empty($toInsert) && ! $isJson) {
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

        $this->outputData($summaryHeaders, $summaryRows, $summaryData);

        return 0;
    }
}
