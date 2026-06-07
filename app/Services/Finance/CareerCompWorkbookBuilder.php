<?php

namespace App\Services\Finance;

/**
 * Pure builder turning the frozen Career Comparison projection (`CareerCompProjection::toArray()`)
 * into a multi-tab workbook description consumed by CareerCompXlsxExportController.
 *
 * All money arithmetic flows through {@see MoneyMath}; rows hold plain JSON-serialisable numbers.
 *
 * @phpstan-type WorkbookRow array{line?: string, description?: string, amount?: float, note?: string, isHeader?: bool, isTotal?: bool, values?: list<float|null>}
 * @phpstan-type WorkbookSheet array{name: string, rows: array<int, WorkbookRow>, columns?: list<string>}
 */
class CareerCompWorkbookBuilder
{
    private const string SUMMARY = 'Summary';

    private const string PER_JOB = 'Per-Job';

    private const string CASH_FLOW = 'Cash-Flow';

    private const string LIQUIDITY = 'Liquidity';

    private const string AFTER_TAX_LIQUIDITY = 'After-Tax Liquidity';

    private const string ASSUMPTIONS = 'Assumptions';

    private const string VESTING = 'Equity Vesting Schedule';

    private const string DELTAS = 'Deltas-vs-Current';

    private const string EQUITY_TAX_SUMMARY = 'Equity Tax Summary';

    private const string EQUITY_TAX_ANNUAL = 'Equity Tax Annual';

    private const string EQUITY_TAX_SOURCES = 'Equity Tax Sources';

    /** @var list<string> */
    private const array LIQUIDITY_BANDS = ['low', 'medium', 'high'];

    /** @var array<string, string> */
    private const array LIQUIDITY_BAND_LABELS = [
        'low' => 'Low',
        'medium' => 'Medium',
        'high' => 'High',
    ];

    /**
     * @param  array<string, mixed>  $projection
     * @return array{filename: string, sheets: array<int, WorkbookSheet>}
     */
    public function build(array $projection, ?string $filename = null): array
    {
        $jobs = $this->jobs($projection);

        return [
            'filename' => $this->filename($filename),
            'sheets' => [
                $this->summarySheet($jobs),
                $this->perJobSheet($jobs),
                $this->cashFlowSheet($jobs),
                $this->liquiditySheet($projection, $jobs),
                $this->afterTaxLiquiditySheet($projection, $jobs),
                $this->assumptionsSheet($projection, $jobs),
                $this->vestingSheet($jobs),
                $this->deltasSheet($projection),
                $this->equityTaxSummarySheet($projection, $jobs),
                $this->equityTaxAnnualSheet($jobs),
                $this->equityTaxSourcesSheet($jobs),
            ],
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $jobs
     * @return WorkbookSheet
     */
    private function summarySheet(array $jobs): array
    {
        $rows = [['description' => 'Career comparison summary', 'isHeader' => true]];

        $rows[] = ['description' => 'Total cash compensation', 'isHeader' => true];
        foreach ($jobs as $job) {
            $rows[] = ['description' => $this->jobName($job), 'amount' => $this->money($job, 'lifetime.totalCashComp')];
        }

        $rows[] = ['description' => 'Lifetime equity value (medium band)', 'isHeader' => true];
        foreach ($jobs as $job) {
            $rows[] = ['description' => $this->jobName($job), 'amount' => $this->money($job, 'lifetime.totalEquityValue.medium')];
        }

        $rows[] = ['description' => 'Lifetime total value (medium band)', 'isHeader' => true];
        foreach ($jobs as $job) {
            $rows[] = ['description' => $this->jobName($job), 'amount' => $this->money($job, 'lifetime.totalValue.medium'), 'isTotal' => true];
        }

        return ['name' => self::SUMMARY, 'rows' => $rows];
    }

    /**
     * @param  list<array<string, mixed>>  $jobs
     * @return WorkbookSheet
     */
    private function perJobSheet(array $jobs): array
    {
        $rows = [];

        foreach ($jobs as $job) {
            $rows[] = [
                'description' => $this->jobName($job),
                'note' => ($job['isCurrent'] ?? false) ? 'Current job' : 'Hypothetical offer',
                'isHeader' => true,
            ];
            $rows[] = ['description' => 'Total cash compensation', 'amount' => $this->money($job, 'lifetime.totalCashComp')];
            $rows[] = ['description' => 'Lifetime equity value — low', 'amount' => $this->money($job, 'lifetime.totalEquityValue.low')];
            $rows[] = ['description' => 'Lifetime equity value — medium', 'amount' => $this->money($job, 'lifetime.totalEquityValue.medium')];
            $rows[] = ['description' => 'Lifetime equity value — high', 'amount' => $this->money($job, 'lifetime.totalEquityValue.high')];
            $rows[] = ['description' => 'Lifetime total value — low', 'amount' => $this->money($job, 'lifetime.totalValue.low')];
            $rows[] = ['description' => 'Lifetime total value — medium', 'amount' => $this->money($job, 'lifetime.totalValue.medium')];
            $rows[] = ['description' => 'Lifetime total value — high', 'amount' => $this->money($job, 'lifetime.totalValue.high'), 'isTotal' => true];
        }

        return ['name' => self::PER_JOB, 'rows' => $rows];
    }

    /**
     * @param  list<array<string, mixed>>  $jobs
     * @return WorkbookSheet
     */
    private function cashFlowSheet(array $jobs): array
    {
        $rows = [];

        foreach ($jobs as $job) {
            $rows[] = ['description' => $this->jobName($job), 'isHeader' => true];
            $annualFcf = [];

            foreach ($this->rowsOf($job, 'annual') as $year) {
                $fcf = $this->numeric($year, 'freeCashFlow');
                $annualFcf[] = $fcf;
                $rows[] = [
                    'line' => $this->year($year),
                    'description' => 'Free cash flow',
                    'amount' => $fcf,
                ];
            }

            $rows[] = ['description' => 'Total free cash flow', 'amount' => MoneyMath::sum($annualFcf), 'isTotal' => true];
        }

        return ['name' => self::CASH_FLOW, 'rows' => $rows];
    }

    /**
     * @param  array<string, mixed>  $projection
     * @param  list<array<string, mixed>>  $jobs
     * @return WorkbookSheet
     */
    private function liquiditySheet(array $projection, array $jobs): array
    {
        return [
            'name' => self::LIQUIDITY,
            'columns' => $this->liquidityColumns($jobs),
            'rows' => $this->liquidityRows($projection, $jobs, false),
        ];
    }

    /**
     * @param  array<string, mixed>  $projection
     * @param  list<array<string, mixed>>  $jobs
     * @return WorkbookSheet
     */
    private function afterTaxLiquiditySheet(array $projection, array $jobs): array
    {
        if (! $this->hasAfterTaxLiquidity($jobs)) {
            return [
                'name' => self::AFTER_TAX_LIQUIDITY,
                'rows' => [[
                    'description' => 'After-tax liquidity unavailable',
                    'note' => 'Recalculate the scenario to populate after-tax projection fields.',
                    'isHeader' => true,
                ]],
            ];
        }

        return [
            'name' => self::AFTER_TAX_LIQUIDITY,
            'columns' => $this->liquidityColumns($jobs),
            'rows' => $this->liquidityRows($projection, $jobs, true),
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $jobs
     * @return list<string>
     */
    private function liquidityColumns(array $jobs): array
    {
        $columns = ['Year'];

        foreach ($jobs as $job) {
            foreach (self::LIQUIDITY_BANDS as $band) {
                $columns[] = $this->jobName($job).' '.self::LIQUIDITY_BAND_LABELS[$band];
            }
        }

        return $columns;
    }

    /**
     * @param  array<string, mixed>  $projection
     * @param  list<array<string, mixed>>  $jobs
     * @return list<WorkbookRow>
     */
    private function liquidityRows(array $projection, array $jobs, bool $afterTax): array
    {
        $rows = [];

        foreach ($this->projectionYears($projection) as $year) {
            $values = [];

            foreach ($jobs as $job) {
                foreach (self::LIQUIDITY_BANDS as $band) {
                    $values[] = $afterTax
                        ? $this->afterTaxLiquidityValue($job, $band, $year)
                        : $this->liquidityValue($job, $band, $year);
                }
            }

            $rows[] = ['line' => (string) $year, 'values' => $values];
        }

        return $rows;
    }

    /**
     * @param  array<string, mixed>  $projection
     * @param  list<array<string, mixed>>  $jobs
     * @return WorkbookSheet
     */
    private function assumptionsSheet(array $projection, array $jobs): array
    {
        $currentJobId = $projection['currentJobId'] ?? null;

        $rows = [
            ['description' => 'Planning assumptions', 'isHeader' => true],
            ['description' => 'Start year', 'note' => (string) (int) ($projection['startYear'] ?? 0)],
            ['description' => 'Horizon (years)', 'note' => (string) (int) ($projection['horizonYears'] ?? 0)],
            ['description' => 'Current job', 'note' => is_string($currentJobId) && $currentJobId !== '' ? $currentJobId : 'None'],
            ['description' => 'Jobs compared', 'note' => (string) count($jobs)],
            ['description' => 'Warnings', 'isHeader' => true],
        ];

        $warnings = is_array($projection['warnings'] ?? null) ? array_values(array_filter($projection['warnings'], 'is_string')) : [];
        if ($warnings === []) {
            $rows[] = ['description' => 'None', 'note' => 'No warnings reported.'];
        } else {
            foreach ($warnings as $warning) {
                $rows[] = ['description' => 'Warning', 'note' => $warning];
            }
        }

        return ['name' => self::ASSUMPTIONS, 'rows' => $rows];
    }

    /**
     * @param  list<array<string, mixed>>  $jobs
     * @return WorkbookSheet
     */
    private function vestingSheet(array $jobs): array
    {
        $rows = [];

        foreach ($jobs as $job) {
            $rows[] = ['description' => $this->jobName($job), 'isHeader' => true];

            $rows[] = ['description' => 'Annual equity value', 'isHeader' => true];
            foreach ($this->rowsOf($job, 'annual') as $year) {
                $proceeds = $this->numeric($year, 'shareSaleProceeds');
                $exercise = $this->numeric($year, 'exerciseOutlay');
                $rows[] = [
                    'line' => $this->year($year),
                    'description' => 'Vested & liquid equity',
                    'amount' => $this->numeric($year, 'vestedLiquidEquity'),
                    'note' => 'Proceeds '.$this->dollars($proceeds).' − exercise outlay '.$this->dollars($exercise).' (net '.$this->dollars(MoneyMath::subtract($proceeds, $exercise)).')',
                ];
            }

            $rows[] = ['description' => 'Grant vesting (shares)', 'isHeader' => true];
            foreach ($this->rowsOf($job, 'vesting') as $vest) {
                $rows[] = [
                    'line' => $this->year($vest),
                    'description' => strtoupper((string) ($vest['type'] ?? '')).' · '.(string) ($vest['grantId'] ?? ''),
                    'note' => 'Vested '.$this->shares($this->numeric($vest, 'vestedShares')).' · exercisable '.$this->shares($this->numeric($vest, 'exercisableShares')),
                ];
            }
        }

        return ['name' => self::VESTING, 'rows' => $rows];
    }

    /**
     * @param  array<string, mixed>  $projection
     * @return WorkbookSheet
     */
    private function deltasSheet(array $projection): array
    {
        $rows = [['description' => 'Deltas vs current job', 'isHeader' => true]];

        $deltas = is_array($projection['deltasVsCurrent'] ?? null)
            ? array_values(array_filter($projection['deltasVsCurrent'], 'is_array'))
            : [];

        if ($deltas === []) {
            $rows[] = ['description' => 'No current job baseline', 'note' => 'Deltas are computed against an empty baseline.'];

            return ['name' => self::DELTAS, 'rows' => $rows];
        }

        foreach ($deltas as $delta) {
            $low = $this->numeric($delta, 'totalValueDelta.low');
            $high = $this->numeric($delta, 'totalValueDelta.high');
            $rows[] = [
                'description' => (string) ($delta['name'] ?? ''),
                'amount' => $this->numeric($delta, 'totalValueDelta.medium'),
                'note' => 'Cash Δ '.$this->dollars($this->numeric($delta, 'cashCompDelta')).' · low Δ '.$this->dollars($low).' · high Δ '.$this->dollars($high),
                'isTotal' => true,
            ];
        }

        return ['name' => self::DELTAS, 'rows' => $rows];
    }

    /**
     * @param  array<string, mixed>  $projection
     * @param  list<array<string, mixed>>  $jobs
     * @return WorkbookSheet
     */
    private function equityTaxSummarySheet(array $projection, array $jobs): array
    {
        $rows = [['description' => 'Equity compensation tax summary', 'isHeader' => true]];
        $currentAfterTax = $this->afterTaxLifetime($this->currentJob($projection, $jobs));

        foreach ($jobs as $job) {
            $lifetime = $this->afterTaxLifetime($job);
            $rows[] = ['description' => $this->jobName($job), 'note' => ($job['isCurrent'] ?? false) ? 'Current job' : 'Hypothetical offer', 'isHeader' => true];

            if ($lifetime === []) {
                $rows[] = ['description' => 'After-tax projection unavailable', 'note' => 'Recalculate the scenario to populate after-tax fields.'];

                continue;
            }

            $rows[] = ['description' => 'Taxable compensation income', 'amount' => $this->money($lifetime, 'taxableCompIncome')];
            $rows[] = ['description' => 'NSO ordinary income', 'amount' => $this->money($lifetime, 'nsoOrdinaryIncome')];
            $rows[] = ['description' => 'ISO AMT preference', 'amount' => $this->money($lifetime, 'isoAmtPreference')];
            $rows[] = ['description' => '83(b) election source amount', 'amount' => $this->sourceAmountForType($job, 'equity_comp_83b_election')];
            $rows[] = ['description' => 'Equity sale proceeds', 'amount' => $this->money($lifetime, 'equitySaleProceeds')];
            $rows[] = ['description' => 'Estimated regular tax', 'amount' => $this->money($lifetime, 'estimatedRegularTax')];
            $rows[] = ['description' => 'Estimated AMT', 'amount' => $this->money($lifetime, 'estimatedAmt')];
            $rows[] = ['description' => 'Total estimated federal/AMT tax', 'amount' => $this->money($lifetime, 'totalEstimatedTax'), 'isTotal' => true];
            $rows[] = ['description' => 'After-tax free cash flow', 'amount' => $this->money($lifetime, 'freeCashFlow')];
            $rows[] = ['description' => 'After-tax total value — low', 'amount' => $this->money($lifetime, 'totalValue.low')];
            $rows[] = ['description' => 'After-tax total value — medium', 'amount' => $this->money($lifetime, 'totalValue.medium'), 'note' => $this->afterTaxDeltaNote($job, $lifetime, $currentAfterTax)];
            $rows[] = ['description' => 'After-tax total value — high', 'amount' => $this->money($lifetime, 'totalValue.high'), 'isTotal' => true];
        }

        return ['name' => self::EQUITY_TAX_SUMMARY, 'rows' => $rows];
    }

    /**
     * @param  list<array<string, mixed>>  $jobs
     * @return WorkbookSheet
     */
    private function equityTaxAnnualSheet(array $jobs): array
    {
        $rows = [['description' => 'Annual equity compensation tax facts', 'isHeader' => true]];

        foreach ($jobs as $job) {
            $rows[] = ['description' => $this->jobName($job), 'isHeader' => true];
            $annualRows = $this->afterTaxAnnualRows($job);

            if ($annualRows === []) {
                $rows[] = ['description' => 'After-tax annual rows unavailable', 'note' => 'Recalculate the scenario to populate after-tax fields.'];

                continue;
            }

            foreach ($annualRows as $annual) {
                $year = $this->year($annual);
                $rows[] = ['line' => $year, 'description' => 'Taxable compensation income', 'amount' => $this->money($annual, 'taxableCompIncome')];
                $this->appendNonZeroTaxLine($rows, $annual, $year, 'NSO ordinary income', 'nsoOrdinaryIncome');
                $this->appendNonZeroTaxLine($rows, $annual, $year, 'ISO AMT preference', 'isoAmtPreference');
                $this->appendNonZeroAmount($rows, $year, '83(b) election source amount', $this->annualSourceTypeAmount($job, $annual, 'equity_comp_83b_election'));
                $this->appendNonZeroTaxLine($rows, $annual, $year, 'Equity sale proceeds', 'equitySaleProceeds');
                $rows[] = ['line' => $year, 'description' => 'Estimated regular tax', 'amount' => $this->money($annual, 'estimatedRegularTax')];
                $rows[] = ['line' => $year, 'description' => 'Estimated AMT', 'amount' => $this->money($annual, 'estimatedAmt')];
                $rows[] = ['line' => $year, 'description' => 'Total estimated federal/AMT tax', 'amount' => $this->money($annual, 'totalEstimatedTax'), 'isTotal' => true];
                $rows[] = ['line' => $year, 'description' => 'After-tax free cash flow', 'amount' => $this->money($annual, 'freeCashFlow'), 'isTotal' => true];
            }
        }

        return ['name' => self::EQUITY_TAX_ANNUAL, 'rows' => $rows];
    }

    /**
     * @param  list<array<string, mixed>>  $jobs
     * @return WorkbookSheet
     */
    private function equityTaxSourcesSheet(array $jobs): array
    {
        $rows = [['description' => 'Equity tax source facts', 'isHeader' => true]];

        foreach ($jobs as $job) {
            $rows[] = ['description' => $this->jobName($job), 'isHeader' => true];
            $sources = $this->afterTaxSources($job);

            if ($sources === []) {
                $rows[] = ['description' => 'No equity tax sources', 'note' => 'No ISO, NSO, 83(b), or sale-proceeds source facts were produced.'];

                continue;
            }

            foreach ($sources as $source) {
                $sourceType = (string) ($source['sourceType'] ?? '');
                $routing = (string) ($source['routing'] ?? '');
                $label = (string) ($source['label'] ?? '');
                $rows[] = [
                    'line' => $this->sourceYears($job, (string) ($source['id'] ?? '')),
                    'description' => $this->sourceTypeLabel($sourceType),
                    'amount' => $this->money($source, 'amount'),
                    'note' => trim($label.($routing !== '' ? ' · '.$routing : '')),
                ];
            }
        }

        return ['name' => self::EQUITY_TAX_SOURCES, 'rows' => $rows];
    }

    /**
     * @param  array<string, mixed>  $projection
     * @return list<int>
     */
    private function projectionYears(array $projection): array
    {
        $startYear = (int) ($projection['startYear'] ?? 0);
        $horizonYears = (int) ($projection['horizonYears'] ?? 0);

        if ($startYear <= 0 || $horizonYears <= 0) {
            return [];
        }

        return range($startYear, $startYear + $horizonYears - 1);
    }

    /**
     * @param  list<array<string, mixed>>  $jobs
     */
    private function hasAfterTaxLiquidity(array $jobs): bool
    {
        if ($jobs === []) {
            return false;
        }

        foreach ($jobs as $job) {
            if ($this->afterTaxAnnualRows($job) === []) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param  array<string, mixed>  $job
     */
    private function liquidityValue(array $job, string $band, int $year): float
    {
        foreach ($this->liquidityBandRows($job, $band) as $point) {
            if ((int) ($point['year'] ?? 0) === $year) {
                return $this->money($point, 'cumulativeValue');
            }
        }

        return 0.0;
    }

    /**
     * @param  array<string, mixed>  $job
     */
    private function afterTaxLiquidityValue(array $job, string $band, int $year): float
    {
        return MoneyMath::add(
            $this->afterTaxCashFlowBase($job, $year),
            $this->liquidityValue($job, $band, $year),
        );
    }

    /**
     * @param  array<string, mixed>  $job
     */
    private function afterTaxCashFlowBase(array $job, int $year): float
    {
        $annualCashFlows = [];

        foreach ($this->afterTaxAnnualRows($job) as $annual) {
            if ((int) ($annual['year'] ?? 0) > $year) {
                continue;
            }

            $annualCashFlows[] = MoneyMath::subtract(
                $this->money($annual, 'freeCashFlow'),
                $this->money($annual, 'equitySaleProceeds'),
            );
        }

        return MoneyMath::sum($annualCashFlows);
    }

    /**
     * @param  array<string, mixed>  $job
     * @return list<array<string, mixed>>
     */
    private function liquidityBandRows(array $job, string $band): array
    {
        $liquidity = is_array($job['liquidity'] ?? null) ? $job['liquidity'] : [];

        return $this->rowsOf($liquidity, $band);
    }

    /**
     * @param  array<string, mixed>  $projection
     * @return list<array<string, mixed>>
     */
    private function jobs(array $projection): array
    {
        return is_array($projection['jobs'] ?? null)
            ? array_values(array_filter($projection['jobs'], 'is_array'))
            : [];
    }

    /**
     * @param  array<string, mixed>  $job
     * @return list<array<string, mixed>>
     */
    private function rowsOf(array $job, string $key): array
    {
        return is_array($job[$key] ?? null)
            ? array_values(array_filter($job[$key], 'is_array'))
            : [];
    }

    /**
     * @param  list<WorkbookRow>  $rows
     * @param  array<string, mixed>  $source
     */
    private function appendNonZeroTaxLine(array &$rows, array $source, string $year, string $description, string $path): void
    {
        $this->appendNonZeroAmount($rows, $year, $description, $this->money($source, $path));
    }

    /**
     * @param  list<WorkbookRow>  $rows
     */
    private function appendNonZeroAmount(array &$rows, string $year, string $description, float $amount): void
    {
        if ($amount === 0.0) {
            return;
        }

        $rows[] = ['line' => $year, 'description' => $description, 'amount' => $amount];
    }

    /**
     * @param  array<string, mixed>|null  $job
     * @return array<string, mixed>
     */
    private function afterTaxLifetime(?array $job): array
    {
        if (! is_array($job)) {
            return [];
        }

        $afterTax = $this->afterTax($job);

        return is_array($afterTax['lifetime'] ?? null) ? $afterTax['lifetime'] : [];
    }

    /**
     * @param  array<string, mixed>  $job
     * @return list<array<string, mixed>>
     */
    private function afterTaxAnnualRows(array $job): array
    {
        return $this->rowsOf($this->afterTax($job), 'annual');
    }

    /**
     * @param  array<string, mixed>  $job
     * @return list<array<string, mixed>>
     */
    private function afterTaxSources(array $job): array
    {
        return $this->rowsOf($this->afterTax($job), 'sources');
    }

    /**
     * @param  array<string, mixed>  $job
     * @return array<string, mixed>
     */
    private function afterTax(array $job): array
    {
        return is_array($job['afterTax'] ?? null) ? $job['afterTax'] : [];
    }

    /**
     * @param  array<string, mixed>  $job
     * @param  array<string, mixed>  $annual
     */
    private function annualSourceTypeAmount(array $job, array $annual, string $sourceType): float
    {
        $sourceIds = is_array($annual['sourceIds'] ?? null)
            ? array_values(array_filter($annual['sourceIds'], 'is_string'))
            : [];
        $amounts = [];

        foreach ($this->afterTaxSources($job) as $source) {
            if (($source['sourceType'] ?? null) === $sourceType && in_array((string) ($source['id'] ?? ''), $sourceIds, true)) {
                $amounts[] = $this->money($source, 'amount');
            }
        }

        return MoneyMath::sum($amounts);
    }

    /**
     * @param  array<string, mixed>  $job
     */
    private function sourceAmountForType(array $job, string $sourceType): float
    {
        $amounts = [];

        foreach ($this->afterTaxSources($job) as $source) {
            if (($source['sourceType'] ?? null) === $sourceType) {
                $amounts[] = $this->money($source, 'amount');
            }
        }

        return MoneyMath::sum($amounts);
    }

    /**
     * @param  array<string, mixed>  $job
     */
    private function sourceYears(array $job, string $sourceId): string
    {
        $years = [];

        foreach ($this->afterTaxAnnualRows($job) as $annual) {
            $sourceIds = is_array($annual['sourceIds'] ?? null)
                ? array_values(array_filter($annual['sourceIds'], 'is_string'))
                : [];

            if (in_array($sourceId, $sourceIds, true)) {
                $years[] = $this->year($annual);
            }
        }

        return implode(', ', array_values(array_unique($years)));
    }

    /**
     * @param  array<string, mixed>  $projection
     * @param  list<array<string, mixed>>  $jobs
     * @return array<string, mixed>|null
     */
    private function currentJob(array $projection, array $jobs): ?array
    {
        $currentJobId = $projection['currentJobId'] ?? null;
        if (! is_string($currentJobId) || $currentJobId === '') {
            return null;
        }

        foreach ($jobs as $job) {
            if (($job['id'] ?? null) === $currentJobId) {
                return $job;
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $job
     * @param  array<string, mixed>  $lifetime
     * @param  array<string, mixed>  $currentAfterTax
     */
    private function afterTaxDeltaNote(array $job, array $lifetime, array $currentAfterTax): string
    {
        if (($job['isCurrent'] ?? false) || $currentAfterTax === []) {
            return '';
        }

        $delta = MoneyMath::subtract($this->money($lifetime, 'totalValue.medium'), $this->money($currentAfterTax, 'totalValue.medium'));

        return 'Medium after-tax LTV Δ vs current '.$this->dollars($delta);
    }

    private function sourceTypeLabel(string $sourceType): string
    {
        return match ($sourceType) {
            'equity_comp_iso_bargain_element' => 'ISO AMT preference',
            'equity_comp_nso_ordinary_income' => 'NSO ordinary income',
            'equity_comp_83b_election' => '83(b) election',
            'equity_comp_sale_proceeds' => 'Equity sale proceeds',
            default => $sourceType !== '' ? $sourceType : 'Equity tax source',
        };
    }

    /**
     * @param  array<string, mixed>  $job
     */
    private function jobName(array $job): string
    {
        return (string) ($job['name'] ?? 'Job');
    }

    /**
     * @param  array<string, mixed>  $source
     */
    private function money(array $source, string $path): float
    {
        return MoneyMath::round($this->numeric($source, $path));
    }

    /**
     * @param  array<string, mixed>  $source
     */
    private function numeric(array $source, string $path): float
    {
        $value = $source;

        foreach (explode('.', $path) as $segment) {
            if (! is_array($value) || ! array_key_exists($segment, $value)) {
                return 0.0;
            }

            $value = $value[$segment];
        }

        return is_numeric($value) ? (float) $value : 0.0;
    }

    /**
     * @param  array<string, mixed>  $row
     */
    private function year(array $row): string
    {
        return (string) (int) ($row['year'] ?? 0);
    }

    private function dollars(float $value): string
    {
        return '$'.number_format($value, 2);
    }

    private function shares(float $value): string
    {
        return rtrim(rtrim(number_format($value, 4, '.', ''), '0'), '.') ?: '0';
    }

    private function filename(?string $filename): string
    {
        $filename = trim((string) $filename);

        return $filename !== '' ? $filename : 'career-comparison.xlsx';
    }
}
