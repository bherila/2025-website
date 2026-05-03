<?php

namespace App\Services\Finance;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use Illuminate\Support\Facades\DB;

class TransactionImportService
{
    /**
     * @return array<string, mixed>
     */
    public static function inputSchema(): array
    {
        return [
            'description' => 'Transaction import payload. Pass as JSON or TOON on stdin.',
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
    }

    /**
     * @param  array<mixed>  $payload
     * @return list<array<string, mixed>>
     */
    public static function transactionsFromPayload(array $payload): array
    {
        if (isset($payload['transactions']) && is_array($payload['transactions'])) {
            return array_values(array_filter($payload['transactions'], is_array(...)));
        }

        if (isset($payload['accounts']) && is_array($payload['accounts'])) {
            $transactions = [];

            foreach ($payload['accounts'] as $account) {
                if (! is_array($account) || ! isset($account['transactions']) || ! is_array($account['transactions'])) {
                    continue;
                }

                foreach ($account['transactions'] as $transaction) {
                    if (! is_array($transaction)) {
                        continue;
                    }

                    $accountId = $account['acct_id'] ?? $account['account_id'] ?? null;
                    if ($accountId !== null && ! isset($transaction['t_account'])) {
                        $transaction['t_account'] = $accountId;
                    }

                    $transactions[] = $transaction;
                }
            }

            return $transactions;
        }

        if (array_is_list($payload)) {
            return array_values(array_filter($payload, is_array(...)));
        }

        return [];
    }

    /**
     * @param  array<mixed>  $payload
     */
    public static function defaultAccountIdFromPayload(array $payload, ?int $fallbackAccountId): ?int
    {
        return isset($payload['account_id'])
            ? (int) $payload['account_id']
            : $fallbackAccountId;
    }

    /**
     * @param  list<array<string, mixed>>  $transactions
     * @param  array{
     *     dry_run?: bool,
     *     default_account_id?: int|null,
     *     default_statement_id?: int|null,
     *     require_type?: bool,
     *     allow_row_statement_id?: bool,
     *     source?: string|null,
     *     include_defaults?: bool
     * }  $options
     */
    public function importForUser(int $userId, array $transactions, array $options = []): TransactionImportResult
    {
        $defaultAccountId = $options['default_account_id'] ?? null;
        $defaultStatementId = $options['default_statement_id'] ?? null;
        $requireType = $options['require_type'] ?? true;
        $allowRowStatementId = $options['allow_row_statement_id'] ?? false;
        $source = $options['source'] ?? null;
        $includeDefaults = $options['include_defaults'] ?? false;

        $validAccountIds = FinAccounts::forOwner($userId)
            ->pluck('acct_id')
            ->flip()
            ->toArray();

        $allowedFields = array_flip((new FinAccountLineItems)->getFillable());
        if (! $allowRowStatementId) {
            unset($allowedFields['statement_id']);
        }

        $validRows = [];
        $errors = [];

        foreach ($transactions as $index => $row) {
            $normalized = $this->normalizeRow($row);

            $accountId = isset($normalized['t_account'])
                ? (int) $normalized['t_account']
                : $defaultAccountId;

            if ($accountId === null) {
                $errors[] = "Row {$index}: no account_id. Provide t_account in the row, account_id in the payload, or --account.";

                continue;
            }

            if (! isset($validAccountIds[$accountId])) {
                $errors[] = "Row {$index}: account {$accountId} not found or not owned by this user.";

                continue;
            }

            foreach ($this->requiredFields($requireType) as $required) {
                if (! isset($normalized[$required]) || $normalized[$required] === '') {
                    $errors[] = "Row {$index}: missing required field '{$required}'.";

                    continue 2;
                }
            }

            $dateError = $this->validateDate($normalized['t_date'] ?? null);
            if ($dateError !== null) {
                $errors[] = "Row {$index}: {$dateError}";

                continue;
            }

            if (isset($normalized['t_amt']) && ! is_numeric($normalized['t_amt'])) {
                $errors[] = "Row {$index}: t_amt must be numeric, got '{$normalized['t_amt']}'.";

                continue;
            }

            $normalized['t_account'] = $accountId;

            if ($defaultStatementId !== null && ! isset($normalized['statement_id'])) {
                $normalized['statement_id'] = $defaultStatementId;
            }

            if ($source !== null && ! isset($normalized['t_source'])) {
                $normalized['t_source'] = $source;
            }

            if ($includeDefaults) {
                $normalized += [
                    't_qty' => 0,
                    't_price' => 0,
                    't_commission' => 0,
                    't_fee' => 0,
                    'opt_strike' => 0,
                ];
            }

            $normalized['t_date'] = substr((string) $normalized['t_date'], 0, 10);
            $normalized['t_symbol'] = $this->normalizeSymbol($normalized['t_symbol'] ?? null);

            $rowToInsert = array_intersect_key($normalized, $allowedFields);
            $rowToInsert['when_added'] = now();
            $validRows[] = $rowToInsert;
        }

        if ($errors !== []) {
            return new TransactionImportResult(
                dryRun: (bool) ($options['dry_run'] ?? false),
                inserted: 0,
                skippedDuplicate: 0,
                errors: $errors,
            );
        }

        [$toInsert, $skipped] = $this->deduplicateRows($validRows);
        $dryRun = (bool) ($options['dry_run'] ?? false);

        if (! $dryRun && $toInsert !== []) {
            DB::table('fin_account_line_items')->insert($toInsert);
        }

        return new TransactionImportResult(
            dryRun: $dryRun,
            inserted: count($toInsert),
            skippedDuplicate: count($skipped),
            rows: $toInsert,
            skippedRows: $skipped,
        );
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function normalizeRow(array $row): array
    {
        $mapped = $row;

        $aliases = [
            'date' => 't_date',
            'amount' => 't_amt',
            'description' => 't_description',
            'type' => 't_type',
            'symbol' => 't_symbol',
            'quantity' => 't_qty',
            'price' => 't_price',
            'commission' => 't_commission',
            'fee' => 't_fee',
        ];

        foreach ($aliases as $alias => $column) {
            if (array_key_exists($alias, $mapped) && ! array_key_exists($column, $mapped)) {
                $mapped[$column] = $mapped[$alias];
            }
        }

        return $mapped;
    }

    /**
     * @return list<string>
     */
    private function requiredFields(bool $requireType): array
    {
        return $requireType
            ? ['t_date', 't_type', 't_amt']
            : ['t_date', 't_amt'];
    }

    private function validateDate(mixed $value): ?string
    {
        if (! is_string($value) && ! is_numeric($value)) {
            return 't_date must be a valid date in YYYY-MM-DD format.';
        }

        $dateStr = substr((string) $value, 0, 10);
        $parsedDate = \DateTime::createFromFormat('Y-m-d', $dateStr);
        $dateParseErrors = \DateTime::getLastErrors();

        if ($parsedDate === false || ($dateParseErrors && ($dateParseErrors['error_count'] > 0 || $dateParseErrors['warning_count'] > 0))) {
            return "t_date must be a valid date in YYYY-MM-DD format, got '{$value}'.";
        }

        return null;
    }

    private function normalizeSymbol(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $symbol = trim((string) $value);

        return $symbol === '' ? null : strtoupper($symbol);
    }

    /**
     * @param  list<array<string, mixed>>  $validRows
     * @return array{0: list<array<string, mixed>>, 1: list<array<string, mixed>>}
     */
    private function deduplicateRows(array $validRows): array
    {
        $toInsert = [];
        $skipped = [];

        /** @var array<int, array<string, bool>> $existingByAccount */
        $existingByAccount = [];

        /** @var array<int, list<string>> $datesByAccount */
        $datesByAccount = [];
        foreach ($validRows as $row) {
            $datesByAccount[(int) $row['t_account']][] = (string) $row['t_date'];
        }

        foreach ($datesByAccount as $acctId => $accountDates) {
            $existing = FinAccountLineItems::query()
                ->where('t_account', $acctId)
                ->whereBetween('t_date', [min($accountDates), max($accountDates)])
                ->get(['t_date', 't_type', 't_amt', 't_symbol']);

            foreach ($existing as $transaction) {
                $existingByAccount[$acctId][$this->duplicateKey($transaction->getAttributes())] = true;
            }
        }

        foreach ($validRows as $row) {
            $acctId = (int) $row['t_account'];
            $key = $this->duplicateKey($row);

            if (isset($existingByAccount[$acctId][$key])) {
                $skipped[] = $row;
            } else {
                $toInsert[] = $row;
                $existingByAccount[$acctId][$key] = true;
            }
        }

        return [$toInsert, $skipped];
    }

    /**
     * @param  array<string, mixed>  $row
     */
    private function duplicateKey(array $row): string
    {
        return ($row['t_date'] ?? '').'|'.($row['t_type'] ?? '').'|'.($row['t_amt'] ?? '').'|'.($row['t_symbol'] ?? '');
    }
}
