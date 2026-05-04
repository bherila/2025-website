<?php

namespace App\Console\Commands\Finance;

use App\Services\Finance\TaxPreviewFactsService;

class FinanceTaxPreviewFactsCommand extends BaseFinanceCommand
{
    protected $signature = 'finance:tax-preview-facts
        {--user= : User ID to inspect; defaults to FINANCE_CLI_USER_ID or 1}
        {--year= : Tax year; defaults to current year}
        {--slice=all : Fact slice: all, schedule1, scheduleB, form4952, scheduleD, or form8949}
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
            $this->error("Unsupported --slice '{$slice}'. Use all, schedule1, scheduleB, form4952, scheduleD, or form8949.");

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

        foreach (($facts['scheduleB']['interestSources'] ?? []) as $source) {
            if (is_array($source)) {
                $rows[] = ['scheduleB', 'interest', $source['label'] ?? '', $source['amount'] ?? 0, $source['id'] ?? ''];
            }
        }

        foreach (($facts['scheduleB']['ordinaryDividendSources'] ?? []) as $source) {
            if (is_array($source)) {
                $rows[] = ['scheduleB', 'ordinaryDividends', $source['label'] ?? '', $source['amount'] ?? 0, $source['id'] ?? ''];
            }
        }

        foreach (($facts['scheduleB']['qualifiedDividendSources'] ?? []) as $source) {
            if (is_array($source)) {
                $rows[] = ['scheduleB', 'qualifiedDividends', $source['label'] ?? '', $source['amount'] ?? 0, $source['id'] ?? ''];
            }
        }

        foreach (($facts['form4952']['investmentInterestSources'] ?? []) as $source) {
            if (is_array($source)) {
                $rows[] = ['form4952', 'line1', $source['label'] ?? '', $source['amount'] ?? 0, $source['id'] ?? ''];
            }
        }

        foreach ([
            'grossInvestmentIncomeFromScheduleB' => 'line4aScheduleB',
            'grossInvestmentIncomeFromK1' => 'line4aK1',
            'grossInvestmentIncomeTotal' => 'line4aTotal',
            'netInvestmentIncomeBeforeQualifiedDividendElection' => 'line6',
        ] as $key => $line) {
            if (isset($facts['form4952'][$key])) {
                $rows[] = ['form4952', $line, $key, $facts['form4952'][$key], ''];
            }
        }

        foreach (($facts['form4952']['investmentExpenseSources'] ?? []) as $source) {
            if (is_array($source)) {
                $rows[] = ['form4952', 'line5', $source['label'] ?? '', $source['amount'] ?? 0, $source['id'] ?? ''];
            }
        }

        foreach ([
            'line1aGainLoss' => 'line1a',
            'line1bGainLoss' => 'line1b',
            'line2GainLoss' => 'line2',
            'line3GainLoss' => 'line3',
            'line5GainLoss' => 'line5',
            'line7NetShortTerm' => 'line7',
            'line8aGainLoss' => 'line8a',
            'line8bGainLoss' => 'line8b',
            'line9GainLoss' => 'line9',
            'line10GainLoss' => 'line10',
            'line12GainLoss' => 'line12',
            'line13CapitalGainDistributions' => 'line13',
            'line15NetLongTerm' => 'line15',
            'line16Combined' => 'line16',
            'line21LimitedLossOrGain' => 'line21',
        ] as $key => $line) {
            if (isset($facts['scheduleD'][$key])) {
                $rows[] = ['scheduleD', $line, $key, $facts['scheduleD'][$key], ''];
            }
        }

        foreach (($facts['scheduleD']['line5Sources'] ?? []) as $source) {
            if (is_array($source)) {
                $rows[] = ['scheduleD', 'line5Source', $source['label'] ?? '', $source['amount'] ?? 0, $source['id'] ?? ''];
            }
        }

        foreach (($facts['scheduleD']['line12Sources'] ?? []) as $source) {
            if (is_array($source)) {
                $rows[] = ['scheduleD', 'line12Source', $source['label'] ?? '', $source['amount'] ?? 0, $source['id'] ?? ''];
            }
        }

        foreach (($facts['scheduleD']['line13Sources'] ?? []) as $source) {
            if (is_array($source)) {
                $rows[] = ['scheduleD', 'line13Source', $source['label'] ?? '', $source['amount'] ?? 0, $source['id'] ?? ''];
            }
        }

        foreach (($facts['form8949']['scheduleDRollups'] ?? []) as $rollup) {
            if (is_array($rollup)) {
                $rows[] = ['form8949', (string) ($rollup['scheduleDLine'] ?? ''), (string) ($rollup['form8949Box'] ?? ''), $rollup['netGainOrLoss'] ?? 0, "rows={$rollup['rowCount']}"];
            }
        }

        foreach (($facts['form8949']['washSaleAdjustments'] ?? []) as $adjustment) {
            if (is_array($adjustment)) {
                $rows[] = ['form8949', 'washSale', $adjustment['symbol'] ?? '', $adjustment['disallowedLoss'] ?? 0, $adjustment['id'] ?? ''];
            }
        }

        return $rows;
    }
}
