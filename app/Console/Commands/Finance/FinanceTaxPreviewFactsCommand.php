<?php

namespace App\Console\Commands\Finance;

use App\Models\User;
use App\Services\Finance\TaxPreviewFactsService;

class FinanceTaxPreviewFactsCommand extends BaseFinanceCommand
{
    protected $signature = 'finance:tax-preview-facts
        {--user= : User ID to inspect; defaults to FINANCE_CLI_USER_ID or 1}
        {--year= : Tax year; defaults to current year}
        {--slice=all : Fact slice; see TaxPreviewFactsService::supportedSlices()}
        {--format=table : Output format: table, json, or toon}';

    protected $description = 'Render backend tax-preview fact source lines for CLI debugging.';

    public function __construct(
        private TaxPreviewFactsService $taxPreviewFactsService,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        if (! $this->validateFormat(['table', 'json', 'toon'])) {
            return self::FAILURE;
        }

        $userId = (int) ($this->option('user') ?: $this->userId());
        $year = (int) ($this->option('year') ?: date('Y'));
        $slice = (string) ($this->option('slice') ?: 'all');

        if (! User::query()->whereKey($userId)->exists()) {
            $this->error("User ID {$userId} not found. Pass --user for a valid user or set FINANCE_CLI_USER_ID.");

            return self::FAILURE;
        }

        if (! in_array($slice, TaxPreviewFactsService::supportedSlices(), true)) {
            $this->error("Unsupported --slice '{$slice}'. Use ".implode(', ', TaxPreviewFactsService::supportedSlices()).'.');

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

        foreach (($facts['schedule1']['line4Sources'] ?? []) as $source) {
            if (is_array($source)) {
                $rows[] = ['schedule1', 'line4', $source['label'] ?? '', $source['amount'] ?? 0, $source['id'] ?? ''];
            }
        }

        foreach (($facts['schedule1']['line6Sources'] ?? []) as $source) {
            if (is_array($source)) {
                $rows[] = ['schedule1', 'line6', $source['label'] ?? '', $source['amount'] ?? 0, $source['id'] ?? ''];
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

        foreach ([
            'grossReceiptsTotal' => 'line1',
            'expensesTotal' => 'line28',
            'homeOfficeAllowable' => 'line30',
            'netProfit' => 'line31',
        ] as $key => $line) {
            if (isset($facts['scheduleC'][$key])) {
                $rows[] = ['scheduleC', $line, $key, $facts['scheduleC'][$key], ''];
            }
        }

        foreach (($facts['scheduleC']['entities'] ?? []) as $entity) {
            if (! is_array($entity)) {
                continue;
            }

            foreach (['grossReceiptSources', 'expenseSources', 'homeOfficeSources'] as $key) {
                foreach (($entity[$key] ?? []) as $source) {
                    if (is_array($source)) {
                        $rows[] = ['scheduleC', $key, $source['label'] ?? '', $source['amount'] ?? 0, $source['id'] ?? ''];
                    }
                }
            }
        }

        foreach ([
            'grossFarmIncome' => 'line9',
            'totalFarmExpenses' => 'line33',
            'netFarmProfit' => 'line34',
        ] as $key => $line) {
            if (isset($facts['scheduleF'][$key])) {
                $rows[] = ['scheduleF', $line, $key, $facts['scheduleF'][$key], ''];
            }
        }

        foreach (['grossIncomeSources', 'expenseSources', 'line34Sources'] as $key) {
            foreach (($facts['scheduleF'][$key] ?? []) as $source) {
                if (is_array($source)) {
                    $rows[] = ['scheduleF', $source['routing'] ?? $key, $source['label'] ?? '', $source['amount'] ?? 0, $source['id'] ?? ''];
                }
            }
        }

        foreach ([
            'netEarningsFromSE',
            'seTaxableEarnings',
            'socialSecurityTaxableEarnings',
            'socialSecurityTax',
            'medicareTax',
            'additionalMedicareTax',
            'seTax',
            'deductibleSeTax',
        ] as $key) {
            if (isset($facts['scheduleSE'][$key])) {
                $rows[] = ['scheduleSE', $key, $key, $facts['scheduleSE'][$key], ''];
            }
        }

        foreach (['entries', 'wageSources', 'scheduleFSources'] as $key) {
            foreach (($facts['scheduleSE'][$key] ?? []) as $source) {
                if (is_array($source)) {
                    $rows[] = ['scheduleSE', $source['routing'] ?? $key, $source['label'] ?? '', $source['amount'] ?? 0, $source['id'] ?? ''];
                }
            }
        }

        foreach (['wages', 'threshold', 'excessWages', 'additionalTax'] as $key) {
            if (isset($facts['form8959'][$key])) {
                $rows[] = ['form8959', $key, $key, $facts['form8959'][$key], ''];
            }
        }

        foreach (($facts['form8959']['wageSources'] ?? []) as $source) {
            if (is_array($source)) {
                $rows[] = ['form8959', $source['routing'] ?? 'line1', $source['label'] ?? '', $source['amount'] ?? 0, $source['id'] ?? ''];
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

        foreach (($facts['form4952']['excludedInvestmentExpenseSources'] ?? []) as $source) {
            if (is_array($source)) {
                $rows[] = ['form4952', 'excludedLine5', $source['label'] ?? '', $source['amount'] ?? 0, $source['id'] ?? ''];
            }
        }

        if (isset($facts['form4952']['totalExcludedInvestmentExpenses'])) {
            $rows[] = ['form4952', 'excludedLine5Total', 'totalExcludedInvestmentExpenses', $facts['form4952']['totalExcludedInvestmentExpenses'], ''];
        }

        foreach ([
            'saltDeduction' => 'line7',
            'totalInterest' => 'line10',
            'charitableTotal' => 'line14',
            'otherItemizedTotal' => 'line16',
            'totalItemizedDeductions' => 'line17',
        ] as $key => $line) {
            if (isset($facts['scheduleA'][$key])) {
                $rows[] = ['scheduleA', $line, $key, $facts['scheduleA'][$key], ''];
            }
        }

        foreach ([
            'stateIncomeTaxSources' => 'line5a',
            'realEstateTaxSources' => 'line5b',
            'salesTaxSources' => 'line5a',
            'mortgageInterestSources' => 'line8a',
            'investmentInterestSources' => 'line9',
            'charitableCashSources' => 'line11',
            'charitableNoncashSources' => 'line12',
            'otherItemizedSources' => 'line16',
        ] as $key => $line) {
            foreach (($facts['scheduleA'][$key] ?? []) as $source) {
                if (is_array($source)) {
                    $rows[] = ['scheduleA', $line, $source['label'] ?? '', $source['amount'] ?? 0, $source['id'] ?? ''];
                }
            }
        }

        foreach ([
            'miscIncomeTotal',
            'totalBox1',
            'totalBox2',
            'totalBox3',
            'totalBox4',
            'totalBox11ZZ',
            'totalBox13ZZ',
            'totalPassive',
            'totalNonpassive',
            'grandTotal',
        ] as $key) {
            if (isset($facts['scheduleE'][$key])) {
                $rows[] = ['scheduleE', $key, $key, $facts['scheduleE'][$key], ''];
            }
        }

        foreach (['miscIncomeSources', 'box1Sources', 'box2Sources', 'box3Sources', 'box4Sources', 'box11ZZSources', 'box13ZZSources', 'traderNiiSources'] as $key) {
            foreach (($facts['scheduleE'][$key] ?? []) as $source) {
                if (is_array($source)) {
                    $rows[] = ['scheduleE', $key, $source['label'] ?? '', $source['amount'] ?? 0, $source['id'] ?? ''];
                }
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
            'line11GainLoss' => 'line11',
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

        foreach (($facts['scheduleD']['line11Sources'] ?? []) as $source) {
            if (is_array($source)) {
                $rows[] = ['scheduleD', 'line11Source', $source['label'] ?? '', $source['amount'] ?? 0, $source['id'] ?? ''];
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

        foreach ([
            'partINet1231' => 'line7',
            'partIIOrdinary' => 'line18b',
            'partIIIRecapture' => 'partIII',
            'netToSchedule1Line4' => 'schedule1Line4',
            'netToScheduleDLongTerm' => 'scheduleDLongTerm',
        ] as $key => $line) {
            if (isset($facts['form4797'][$key])) {
                $rows[] = ['form4797', $line, $key, $facts['form4797'][$key], ''];
            }
        }

        foreach (['partISources', 'partIISources', 'partIIISources', 'schedule1Sources', 'scheduleDSources'] as $key) {
            foreach (($facts['form4797'][$key] ?? []) as $source) {
                if (is_array($source)) {
                    $rows[] = ['form4797', $source['routing'] ?? $key, $source['label'] ?? '', $source['amount'] ?? 0, $source['id'] ?? ''];
                }
            }
        }

        foreach ([
            'line1_nondeductibleContributions',
            'line2_priorYearBasis',
            'line6_yearEndFmv',
            'line7_distributionsNotConverted',
            'line8_convertedToRoth',
            'line14_basisCarriedForward',
            'taxableToForm1040Line4b',
        ] as $key) {
            if (isset($facts['form8606'][$key])) {
                $rows[] = ['form8606', $key, $key, $facts['form8606'][$key], ''];
            }
        }

        foreach ([
            'totalPassiveIncome',
            'totalGeneralIncome',
            'totalForeignTaxes',
            'totalLine4b',
            'netForeignSourceTaxableIncome',
        ] as $key) {
            if (isset($facts['form1116'][$key])) {
                $rows[] = ['form1116', $key, $key, $facts['form1116'][$key], ''];
            }
        }

        foreach (['passiveIncomeSources', 'generalIncomeSources', 'foreignTaxSources', 'line4bSources'] as $key) {
            foreach (($facts['form1116'][$key] ?? []) as $source) {
                if (is_array($source)) {
                    $rows[] = ['form1116', $key, $source['label'] ?? '', $source['amount'] ?? 0, $source['id'] ?? ''];
                }
            }
        }

        foreach ([
            'taxableInterest',
            'ordinaryDividends',
            'netCapGains',
            'passiveIncome',
            'nonpassiveTradingIncome',
            'investmentInterestExpense',
            'grossNII',
            'netInvestmentIncome',
        ] as $key) {
            if (isset($facts['form8960'][$key])) {
                $rows[] = ['form8960', $key, $key, $facts['form8960'][$key], ''];
            }
        }

        foreach (($facts['form8960']['componentSources'] ?? []) as $source) {
            if (is_array($source)) {
                $rows[] = ['form8960', $source['routing'] ?? 'component', $source['label'] ?? '', $source['amount'] ?? 0, $source['id'] ?? ''];
            }
        }

        foreach ([
            'totalQbi',
            'totalQbiComponent',
            'qualifiedReitDividends',
            'qualifiedPtpIncome',
            'reitPtpComponent',
            'taxableIncomeBeforeQbi',
            'netCapitalGain',
            'taxableIncomeLessNetCapitalGain',
            'taxableIncomeCap',
            'deduction',
        ] as $key) {
            if (isset($facts['form8995'][$key])) {
                $rows[] = ['form8995', $key, $key, $facts['form8995'][$key], ''];
            }
        }

        foreach (['line1Sources', 'line6Sources', 'reviewSources'] as $key) {
            foreach (($facts['form8995'][$key] ?? []) as $source) {
                if (is_array($source)) {
                    $rows[] = ['form8995', $source['routing'] ?? $key, $source['label'] ?? '', $source['amount'] ?? 0, $source['id'] ?? ''];
                }
            }
        }

        foreach ([
            'amti',
            'exemption',
            'amtTaxBase',
            'tentativeMinTax',
            'regularTaxAfterCredits',
            'amt',
        ] as $key) {
            if (isset($facts['form6251'][$key])) {
                $rows[] = ['form6251', $key, $key, $facts['form6251'][$key], ''];
            }
        }

        foreach (($facts['form6251']['sourceEntries'] ?? []) as $source) {
            if (is_array($source)) {
                $rows[] = ['form6251', 'line'.($source['line'] ?? ''), $source['label'] ?? '', $source['amount'] ?? 0, $source['code'] ?? ''];
            }
        }

        foreach ([
            'totalPassiveIncome',
            'totalPassiveLoss',
            'totalPriorYearUnallowed',
            'netPassiveResult',
            'rentalAllowance',
            'totalAllowedLoss',
            'totalSuspendedLoss',
        ] as $key) {
            if (isset($facts['form8582'][$key])) {
                $rows[] = ['form8582', $key, $key, $facts['form8582'][$key], ''];
            }
        }

        foreach (($facts['form8582']['activities'] ?? []) as $activity) {
            if (is_array($activity)) {
                $rows[] = ['form8582', 'activity', $activity['activityName'] ?? '', $activity['overallGainOrLoss'] ?? 0, $activity['ein'] ?? ''];
            }
        }

        return $rows;
    }
}
