<?php

namespace App\Console\Commands\Finance;

use App\Services\Finance\TransactionImportService;

class FinanceImportTransactionsCommand extends BaseFinanceCommand
{
    protected $signature = 'finance:import-transactions
        {--account= : Default account ID when not specified per-row in the payload}
        {--dry-run : Validate and display what would be inserted without committing}
        {--schema : Print the expected JSON input schema to stdout and exit}
        {--input-format=auto : Input format: auto, json, or toon}
        {--format=table : Output format for the result summary: table, json, or toon}';

    protected $description = 'Import transactions from a JSON or TOON payload on stdin into fin_account_line_items';

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

        $payload = $this->getStdinData();

        if ($payload === null) {
            $this->error('No JSON payload received on stdin. Pipe a JSON object or use --schema to see the expected format.');

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

        $isDryRun = (bool) $this->option('dry-run');
        $structuredOutput = in_array($this->option('format') ?? 'table', ['json', 'toon'], true);

        // Dry-run preview: suppressed in structured modes to keep stdout valid.
        if ($isDryRun && $result->rows !== [] && ! $structuredOutput) {
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

        // Summary output
        $summaryHeaders = ['status', 'count'];
        $summaryRows = [
            [$isDryRun ? 'would_insert' : 'inserted', $result->inserted],
            ['skipped_duplicate', $result->skippedDuplicate],
        ];

        $this->outputData($summaryHeaders, $summaryRows, $result->toArray());

        return 0;
    }
}
