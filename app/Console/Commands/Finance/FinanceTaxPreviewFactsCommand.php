<?php

namespace App\Console\Commands\Finance;

use App\Services\Finance\TaxPreviewFactsService;

class FinanceTaxPreviewFactsCommand extends BaseFinanceCommand
{
    protected $signature = 'finance:tax-preview-facts
        {--user= : User ID to inspect; defaults to FINANCE_CLI_USER_ID or 1}
        {--year= : Tax year; defaults to current year}
        {--slice=all : Fact slice: all, schedule1, or form4952}
        {--format=table : Output format: table, json, or toon}';

    protected $description = 'Render backend tax-preview fact source lines for CLI debugging.';

    public function __construct(
        private TaxPreviewFactsService $taxPreviewFactsService,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $userId = (int) ($this->option('user') ?: $this->userId());
        $year = (int) ($this->option('year') ?: date('Y'));
        $slice = (string) ($this->option('slice') ?: 'all');

        if (! in_array($slice, TaxPreviewFactsService::supportedSlices(), true)) {
            $this->error("Unsupported --slice '{$slice}'. Use all, schedule1, or form4952.");

            return self::FAILURE;
        }

        $facts = $this->taxPreviewFactsService->arrayForYear($userId, $year, $slice);

        $headers = ['Slice', 'Line', 'Label', 'Amount', 'Source'];
        $rows = $this->tableRows($facts);

        $this->outputData($headers, $rows, $facts);

        return self::SUCCESS;
    }

    /**
     * @param  array<string, mixed>  $facts
     * @return array<int, array<int, mixed>>
     */
    private function tableRows(array $facts): array
    {
        $rows = [];

        foreach (($facts['schedule1']['line5Sources'] ?? []) as $source) {
            if (is_array($source)) {
                $rows[] = ['schedule1', 'line5', $source['label'] ?? '', $source['amount'] ?? 0, $source['id'] ?? ''];
            }
        }

        foreach (($facts['schedule1']['line8zSources'] ?? []) as $source) {
            if (is_array($source)) {
                $rows[] = ['schedule1', 'line8z', $source['label'] ?? '', $source['amount'] ?? 0, $source['id'] ?? ''];
            }
        }

        foreach (($facts['form4952']['investmentInterestSources'] ?? []) as $source) {
            if (is_array($source)) {
                $rows[] = ['form4952', 'line1', $source['label'] ?? '', $source['amount'] ?? 0, $source['id'] ?? ''];
            }
        }

        foreach (($facts['form4952']['investmentExpenseSources'] ?? []) as $source) {
            if (is_array($source)) {
                $rows[] = ['form4952', 'line5', $source['label'] ?? '', $source['amount'] ?? 0, $source['id'] ?? ''];
            }
        }

        return $rows;
    }
}
