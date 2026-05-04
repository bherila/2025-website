<?php

namespace App\Console\Commands\Finance;

use App\Services\Finance\TaxPreviewFactsService;
use App\Services\Finance\TaxReturnReconciliationService;
use HelgeSverre\Toon\DecodeOptions;
use HelgeSverre\Toon\Exceptions\DecodeException;
use HelgeSverre\Toon\Toon;

class FinanceTaxReconcileCommand extends BaseFinanceCommand
{
    protected $signature = 'finance:tax-reconcile
        {--user= : User ID to inspect; defaults to FINANCE_CLI_USER_ID or 1}
        {--year= : Tax year; defaults to fixture year or current year}
        {--fixture=tests/Fixtures/Finance/tax-return-reconciliations/2025-cpa-anonymized.json : JSON or TOON expected-line fixture path}
        {--tolerance= : Override per-line tolerance for all lines}
        {--format=table : Output format: table, json, or toon}';

    protected $description = 'Compare backend tax preview facts against an expected filed-return line fixture.';

    public function __construct(
        private TaxPreviewFactsService $taxPreviewFactsService,
        private TaxReturnReconciliationService $reconciliationService,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        if (! $this->validateFormat(['table', 'json', 'toon'])) {
            return self::FAILURE;
        }

        $fixturePath = $this->fixturePath((string) $this->option('fixture'));
        $fixture = $this->readFixture($fixturePath);
        if ($fixture === null) {
            return self::FAILURE;
        }

        $userId = (int) ($this->option('user') ?: $this->userId());
        $year = (int) ($this->option('year') ?: ($fixture['year'] ?? date('Y')));
        $tolerance = $this->option('tolerance');
        $defaultTolerance = is_numeric($tolerance) ? (float) $tolerance : null;
        $facts = $this->taxPreviewFactsService->arrayForYear($userId, $year);
        $result = $this->reconciliationService->reconcile($facts, $fixture, $defaultTolerance);

        $headers = ['Status', 'Form', 'Line', 'Expected', 'Actual', 'Delta', 'Path'];
        $rows = $this->tableRows($result);

        $this->outputData($headers, $rows, $result);

        return ($result['summary']['status'] ?? 'fail') === 'pass' ? self::SUCCESS : self::FAILURE;
    }

    private function fixturePath(string $path): string
    {
        if (str_starts_with($path, '/')) {
            return $path;
        }

        return base_path($path);
    }

    /**
     * @return array<string, mixed>|null
     */
    private function readFixture(string $path): ?array
    {
        if (! is_file($path)) {
            $this->error("Fixture not found: {$path}");

            return null;
        }

        $raw = file_get_contents($path);
        if ($raw === false) {
            $this->error("Unable to read fixture: {$path}");

            return null;
        }

        $decoded = json_decode($raw, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
            return $decoded;
        }

        try {
            $toon = Toon::decode($raw, DecodeOptions::lenient());
        } catch (DecodeException $e) {
            $this->error("Fixture must be valid JSON or TOON: {$e->getMessage()}");

            return null;
        }

        if (! is_array($toon)) {
            $this->error('Fixture must decode to an object.');

            return null;
        }

        return $toon;
    }

    /**
     * @param  array<string, mixed>  $result
     * @return array<int, array<int, mixed>>
     */
    private function tableRows(array $result): array
    {
        $rows = [];
        $results = $result['results'] ?? [];

        if (! is_array($results)) {
            return $rows;
        }

        foreach ($results as $line) {
            if (! is_array($line)) {
                continue;
            }

            $rows[] = [
                $line['status'] ?? '',
                $line['form'] ?? '',
                $line['line'] ?? '',
                $line['roundedExpected'] ?? '',
                $line['roundedActual'] ?? '',
                $line['delta'] ?? '',
                $line['path'] ?? '',
            ];
        }

        return $rows;
    }
}
