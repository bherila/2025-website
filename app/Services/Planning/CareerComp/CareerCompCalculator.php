<?php

namespace App\Services\Planning\CareerComp;

use App\Services\Finance\K1CodeCharacterResolver;
use App\Services\Finance\MoneyMath;
use App\Services\Finance\TaxPreviewFacts\Builders\EquityCompensationFactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Builders\Form6251FactsBuilder;
use App\Support\Finance\FederalIncomeTax;
use DateTimeImmutable;

final class CareerCompCalculator
{
    private const string MULTI_CURRENT_BASELINE_ID = 'current-baseline';

    private Form6251FactsBuilder $form6251FactsBuilder;

    public function __construct(
        private RsuVestingExpander $rsuVestingExpander = new RsuVestingExpander,
        private OptionsVestingService $optionsVestingService = new OptionsVestingService,
        private EquityValuationService $equityValuationService = new EquityValuationService,
        private PrivateValuationScenarioService $privateValuationScenarioService = new PrivateValuationScenarioService,
        private EquityCompensationFactsBuilder $equityCompensationFactsBuilder = new EquityCompensationFactsBuilder,
        ?Form6251FactsBuilder $form6251FactsBuilder = null,
    ) {
        $this->form6251FactsBuilder = $form6251FactsBuilder ?? new Form6251FactsBuilder(new K1CodeCharacterResolver);
    }

    public function project(CareerCompInputs $inputs): CareerCompProjection
    {
        $startYear = $inputs->int('startYear');
        $horizonYears = max(1, $inputs->int('horizonYears'));
        $modelAssumptions = $inputs->modelAssumptions();
        $jobs = [];
        $warnings = [];
        $currentJobs = $inputs->currentJobs();
        $currentJobIds = array_map(static fn (JobSpec $job): string => $job->id(), $currentJobs);
        $currentBaselineId = $this->currentBaselineId($currentJobs);

        if ($currentJobs !== []) {
            $projected = $this->projectCurrentBaseline($currentJobs, $startYear, $horizonYears, $modelAssumptions, $currentBaselineId);
            $jobs[] = $projected['job'];
            $warnings = array_merge($warnings, $projected['warnings']);
        }
        foreach ($inputs->hypotheticalJobs() as $job) {
            if ($job->archived()) {
                continue;
            }

            $projected = $this->projectOfferScenario($currentJobs, $job, $startYear, $horizonYears, $modelAssumptions);
            $jobs[] = $projected['job'];
            $warnings = array_merge($warnings, $projected['warnings']);
        }

        return new CareerCompProjection([
            'startYear' => $startYear,
            'horizonYears' => $horizonYears,
            'currentJobId' => $currentBaselineId,
            'currentJobIds' => $currentJobIds,
            'jobs' => $jobs,
            'deltasVsCurrent' => $this->deltasVsCurrent($jobs, $currentBaselineId),
            'warnings' => array_values(array_unique($warnings)),
        ]);
    }

    /**
     * @return array{job:array<string, mixed>,warnings:list<string>}
     */
    private function projectJob(JobSpec $job, int $startYear, int $horizonYears, ModelAssumptions $modelAssumptions, ?DateTimeImmutable $activeThrough = null): array
    {
        $jobStartDate = $this->parseJobStartDate($job);
        $projectedOptionGrants = $this->projectedOptionRefresherGrants($job, $startYear, $horizonYears, $jobStartDate, $modelAssumptions, $activeThrough);
        $vestingJob = $this->withProjectedOptionRefresherGrants($job, $projectedOptionGrants);
        $warnings = $this->staticWarnings($vestingJob, $startYear, $horizonYears);
        $rsuRows = $this->rsuVestingExpander->expand($vestingJob, $startYear, $horizonYears, $activeThrough);
        $optionResult = $this->optionsVestingService->expand($vestingJob, $startYear, $horizonYears, $activeThrough);
        $baseVestingRows = array_merge($rsuRows, $optionResult['rows']);
        $warnings = array_merge($warnings, $optionResult['warnings']);
        $refresherDefs = $this->refresherDefinitions($vestingJob, $startYear, $horizonYears, $jobStartDate, $activeThrough);
        $valuation = $this->equityValuationService->value($vestingJob, $baseVestingRows, $refresherDefs, $startYear, $horizonYears, $activeThrough);
        // Fold representative refresher vesting into the breakdown + after-tax facts.
        $vestingRows = array_merge($baseVestingRows, $valuation['refresherRows']);
        $paperVestingRows = $this->paperVestingRows($vestingJob, $startYear, $horizonYears, $valuation['refresherRows'], $activeThrough);
        $paperEquity = $this->privateValuationScenarioService->project($vestingJob, $paperVestingRows, $startYear, $horizonYears, $modelAssumptions);
        $warnings = array_merge($warnings, $paperEquity['warnings']);
        $paperEquityProjection = [
            'scenarios' => $paperEquity['scenarios'],
            'totalsByOutcome' => $paperEquity['totalsByOutcome'],
        ];
        $valuation = $this->applyPrivateScenarioLiquidity($vestingJob, $valuation, $paperEquityProjection, $paperVestingRows, $modelAssumptions, $startYear, $horizonYears);

        $raisePct = $job->number('comp.annualRaisePct');
        $baseSalary = $job->number('comp.baseSalary');
        $cashBonus = $job->number('comp.cashBonus');

        $annual = [];
        $totalCashComp = 0.0;
        $negativeFcfWarned = false;

        for ($offset = 0; $offset < $horizonYears; $offset++) {
            $year = $startYear + $offset;
            $raiseFactor = $this->raiseFactor($raisePct, $this->cashCompRaiseOffset($jobStartDate, $offset, $year));
            $cashCompFactor = $this->cashCompYearFactor($jobStartDate, $year, $activeThrough);
            $salary = MoneyMath::multiply(MoneyMath::multiply($baseSalary, $raiseFactor), $cashCompFactor);
            $bonus = MoneyMath::multiply(MoneyMath::multiply($cashBonus, $raiseFactor), $cashCompFactor);
            $vestedLiquidEquity = MoneyMath::round($valuation['annualEquity'][$year] ?? 0.0);
            $shareSaleProceeds = $vestedLiquidEquity;
            $equitySaleBasis = MoneyMath::round($valuation['annualEquitySaleBasis'][$year] ?? 0.0);
            $equityCapitalGain = MoneyMath::round($valuation['annualEquityCapitalGain'][$year] ?? 0.0);
            $privateRsuOrdinaryIncome = MoneyMath::round($valuation['annualPrivateRsuOrdinaryIncome'][$year] ?? 0.0);
            $exerciseOutlay = $this->exerciseOutlayForYear($vestingJob, $optionResult['rows'], $year);
            $cashComp = MoneyMath::add($salary, $bonus);
            $freeCashFlow = MoneyMath::subtract(MoneyMath::add($cashComp, $shareSaleProceeds), $exerciseOutlay);

            if ($freeCashFlow < 0.0 && ! $negativeFcfWarned) {
                $warnings[] = "{$job->name()}: negative free cash flow in {$year}.";
                $negativeFcfWarned = true;
            }

            $totalCashComp = MoneyMath::add($totalCashComp, $cashComp);
            $annual[] = [
                'year' => $year,
                'salary' => $salary,
                'bonus' => $bonus,
                'vestedLiquidEquity' => $vestedLiquidEquity,
                'shareSaleProceeds' => $shareSaleProceeds,
                'equitySaleBasis' => $equitySaleBasis,
                'equityCapitalGain' => $equityCapitalGain,
                'privateRsuOrdinaryIncome' => $privateRsuOrdinaryIncome,
                'exerciseOutlay' => $exerciseOutlay,
                'freeCashFlow' => $freeCashFlow,
            ];
        }

        $lifetime = [
            'totalCashComp' => $totalCashComp,
            'totalEquityValue' => $valuation['totals'],
            'totalPaperEquityValue' => $paperEquityProjection['totalsByOutcome'],
            'totalValue' => [
                'low' => MoneyMath::add($totalCashComp, $valuation['totals']['low']),
                'medium' => MoneyMath::add($totalCashComp, $valuation['totals']['medium']),
                'high' => MoneyMath::add($totalCashComp, $valuation['totals']['high']),
            ],
            'totalPaperValue' => [
                'low' => MoneyMath::add($totalCashComp, $paperEquityProjection['totalsByOutcome']['low']),
                'medium' => MoneyMath::add($totalCashComp, $paperEquityProjection['totalsByOutcome']['medium']),
                'high' => MoneyMath::add($totalCashComp, $paperEquityProjection['totalsByOutcome']['high']),
            ],
        ];
        $afterTax = $this->equityCompensationFactsBuilder->build($vestingJob, $vestingRows, $annual, $lifetime['totalValue'], $modelAssumptions)->toArray();
        $defaultAfterTaxTotalValue = [
            'low' => MoneyMath::round($afterTax['lifetime']['totalValue']['low']),
            'medium' => MoneyMath::round($afterTax['lifetime']['totalValue']['medium']),
            'high' => MoneyMath::round($afterTax['lifetime']['totalValue']['high']),
        ];
        $afterTax['lifetime']['totalValue'] = $this->afterTaxTotalValueByOutcome($vestingJob, $vestingRows, $annual, $valuation, $lifetime['totalValue'], $defaultAfterTaxTotalValue, $modelAssumptions, $afterTax);

        return [
            'job' => [
                'id' => $job->id(),
                'name' => $job->name(),
                'isCurrent' => $job->isCurrent(),
                'annual' => $annual,
                'liquidity' => $valuation['liquidity'],
                'paperEquity' => $paperEquityProjection,
                'vesting' => $vestingRows,
                'lifetime' => $lifetime,
                'afterTax' => $afterTax,
            ],
            'warnings' => $warnings,
        ];
    }

    /**
     * @param  list<JobSpec>  $currentJobs
     * @return array{job:array<string, mixed>,warnings:list<string>}
     */
    private function projectCurrentBaseline(array $currentJobs, int $startYear, int $horizonYears, ModelAssumptions $modelAssumptions, ?string $currentBaselineId): array
    {
        $projected = array_map(
            fn (JobSpec $job): array => $this->projectJob($job, $startYear, $horizonYears, $modelAssumptions),
            $currentJobs,
        );

        if (count($projected) === 1 && $currentBaselineId !== null) {
            $projected[0]['job']['componentJobIds'] = [$currentJobs[0]->id()];
            $projected[0]['job']['componentJobNames'] = [$currentJobs[0]->name()];

            return $projected[0];
        }

        return $this->combineProjectedJobs(
            id: $currentBaselineId ?? self::MULTI_CURRENT_BASELINE_ID,
            name: 'Current jobs',
            isCurrent: true,
            projected: $projected,
            startYear: $startYear,
            horizonYears: $horizonYears,
            modelAssumptions: $modelAssumptions,
            metadata: [
                'componentJobIds' => array_map(static fn (JobSpec $job): string => $job->id(), $currentJobs),
                'componentJobNames' => array_map(static fn (JobSpec $job): string => $job->name(), $currentJobs),
            ],
        );
    }

    /**
     * @param  list<JobSpec>  $currentJobs
     * @return array{job:array<string, mixed>,warnings:list<string>}
     */
    private function projectOfferScenario(array $currentJobs, JobSpec $job, int $startYear, int $horizonYears, ModelAssumptions $modelAssumptions): array
    {
        $currentById = [];
        foreach ($currentJobs as $currentJob) {
            $currentById[$currentJob->id()] = $currentJob;
        }

        $retainedCurrentJobIds = array_values(array_filter(
            $job->retainedCurrentJobIds(),
            static fn (string $id): bool => isset($currentById[$id]),
        ));
        $retained = array_fill_keys($retainedCurrentJobIds, true);
        $priorCurrentActiveThrough = $this->priorCurrentActiveThrough($job, $modelAssumptions);
        $projected = [];
        $quitCurrentJobIds = [];

        foreach ($currentJobs as $currentJob) {
            if (isset($retained[$currentJob->id()])) {
                $projected[] = $this->projectJob($currentJob, $startYear, $horizonYears, $modelAssumptions);

                continue;
            }

            $quitCurrentJobIds[] = $currentJob->id();
            if ($priorCurrentActiveThrough instanceof DateTimeImmutable) {
                $projected[] = $this->projectJob($currentJob, $startYear, $horizonYears, $modelAssumptions, $priorCurrentActiveThrough);
            }
        }

        $projected[] = $this->projectJob($job, $startYear, $horizonYears, $modelAssumptions);

        if (count($projected) === 1) {
            $projected[0]['job']['retainedCurrentJobIds'] = $retainedCurrentJobIds;
            $projected[0]['job']['quitCurrentJobIds'] = $quitCurrentJobIds;
            $projected[0]['job']['componentJobIds'] = [$job->id()];
            $projected[0]['job']['componentJobNames'] = [$job->name()];

            return $projected[0];
        }

        return $this->combineProjectedJobs(
            id: $job->id(),
            name: $job->name(),
            isCurrent: false,
            projected: $projected,
            startYear: $startYear,
            horizonYears: $horizonYears,
            modelAssumptions: $modelAssumptions,
            metadata: [
                'retainedCurrentJobIds' => $retainedCurrentJobIds,
                'quitCurrentJobIds' => $quitCurrentJobIds,
                'componentJobIds' => array_map(
                    static fn (array $entry): string => (string) ($entry['job']['id'] ?? ''),
                    $projected,
                ),
                'componentJobNames' => array_map(
                    static fn (array $entry): string => (string) ($entry['job']['name'] ?? ''),
                    $projected,
                ),
            ],
        );
    }

    /**
     * @param  list<JobSpec>  $currentJobs
     */
    private function currentBaselineId(array $currentJobs): ?string
    {
        if ($currentJobs === []) {
            return null;
        }

        return count($currentJobs) === 1 ? $currentJobs[0]->id() : self::MULTI_CURRENT_BASELINE_ID;
    }

    private function priorCurrentActiveThrough(JobSpec $job, ModelAssumptions $modelAssumptions): ?DateTimeImmutable
    {
        $startDate = $this->parseJobStartDate($job);
        if (! $startDate instanceof DateTimeImmutable) {
            return null;
        }

        $noticeWeeks = $this->transitionWeeks($job, 'currentJobNoticeWeeks', $modelAssumptions->currentJobNoticeWeeks());
        $timeOffWeeks = $this->transitionWeeks($job, 'timeOffBetweenJobsWeeks', $modelAssumptions->timeOffBetweenJobsWeeks());
        $noticeDays = max(0, (int) round($noticeWeeks * 7));
        $timeOffDays = max(0, (int) round($timeOffWeeks * 7));
        $resignationDate = $this->parseDateValue($job->value('priorJobResignationDate'));

        if (! $resignationDate instanceof DateTimeImmutable) {
            $resignationDate = $startDate->modify('-'.($noticeDays + $timeOffDays).' days');
        }

        $activeThrough = $resignationDate->modify('+'.$noticeDays.' days')->modify('-1 day');
        $latestActiveThrough = $startDate->modify('-'.($timeOffDays + 1).' days');
        if ($activeThrough > $latestActiveThrough) {
            return $latestActiveThrough;
        }

        return $activeThrough;
    }

    private function transitionWeeks(JobSpec $job, string $key, float $default): float
    {
        $value = $job->value('transitionOverride.'.$key);

        return is_numeric($value) ? max(0.0, min(52.0, (float) $value)) : $default;
    }

    /**
     * @param  list<array{job:array<string, mixed>,warnings:list<string>}>  $projected
     * @param  array<string, mixed>  $metadata
     * @return array{job:array<string, mixed>,warnings:list<string>}
     */
    private function combineProjectedJobs(string $id, string $name, bool $isCurrent, array $projected, int $startYear, int $horizonYears, ModelAssumptions $modelAssumptions, array $metadata = []): array
    {
        $jobs = array_map(
            static fn (array $entry): array => $entry['job'],
            $projected,
        );
        $annual = $this->combineAnnualRowsForJobs($jobs, $startYear, $horizonYears);
        $lifetime = $this->combineLifetimeForJobs($annual, $jobs);
        $combined = [
            'id' => $id,
            'name' => $name,
            'isCurrent' => $isCurrent,
            'annual' => $annual,
            'liquidity' => $this->combineLiquidityForJobs($jobs, $startYear, $horizonYears),
            'paperEquity' => $this->combinePaperEquityForJobs($jobs, $isCurrent),
            'vesting' => $this->combineVestingRowsForJobs($jobs),
            'lifetime' => $lifetime,
        ];
        $combined = array_merge($combined, $metadata);
        $combined['afterTax'] = $this->combineAfterTaxForJobs($jobs, $annual, $lifetime['totalValue'], $modelAssumptions);

        return [
            'job' => $combined,
            'warnings' => array_merge(...array_map(
                static fn (array $entry): array => $entry['warnings'],
                $projected,
            )),
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $jobs
     * @return list<array<string, mixed>>
     */
    private function combineAnnualRowsForJobs(array $jobs, int $startYear, int $horizonYears): array
    {
        $byJob = array_map(
            fn (array $job): array => $this->rowsByYear(is_array($job['annual'] ?? null) ? $job['annual'] : []),
            $jobs,
        );
        $fields = ['salary', 'bonus', 'vestedLiquidEquity', 'shareSaleProceeds', 'equitySaleBasis', 'equityCapitalGain', 'privateRsuOrdinaryIncome', 'exerciseOutlay', 'freeCashFlow'];
        $rows = [];

        for ($offset = 0; $offset < $horizonYears; $offset++) {
            $year = $startYear + $offset;
            $row = ['year' => $year];
            foreach ($fields as $field) {
                $row[$field] = MoneyMath::sum(array_map(
                    static fn (array $rowsByYear): float => (float) ($rowsByYear[$year][$field] ?? 0.0),
                    $byJob,
                ));
            }
            $rows[] = $row;
        }

        return $rows;
    }

    /**
     * @param  list<array<string, mixed>>  $annual
     * @param  list<array<string, mixed>>  $jobs
     * @return array<string, mixed>
     */
    private function combineLifetimeForJobs(array $annual, array $jobs): array
    {
        $totalCashComp = MoneyMath::sum(array_map(
            static fn (array $row): float => MoneyMath::add((float) ($row['salary'] ?? 0.0), (float) ($row['bonus'] ?? 0.0)),
            $annual,
        ));
        $totalEquityValue = $this->sumBanded(array_map(
            static fn (array $job): array => is_array($job['lifetime']['totalEquityValue'] ?? null) ? $job['lifetime']['totalEquityValue'] : [],
            $jobs,
        ));
        $totalPaperEquityValue = $this->sumBanded(array_map(
            static fn (array $job): array => is_array($job['lifetime']['totalPaperEquityValue'] ?? null)
                ? $job['lifetime']['totalPaperEquityValue']
                : (is_array($job['lifetime']['totalEquityValue'] ?? null) ? $job['lifetime']['totalEquityValue'] : []),
            $jobs,
        ));

        return [
            'totalCashComp' => $totalCashComp,
            'totalEquityValue' => $totalEquityValue,
            'totalPaperEquityValue' => $totalPaperEquityValue,
            'totalValue' => $this->addCashToBanded($totalCashComp, $totalEquityValue),
            'totalPaperValue' => $this->addCashToBanded($totalCashComp, $totalPaperEquityValue),
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $jobs
     * @return array{low:list<array{year:int,cumulativeValue:float}>,medium:list<array{year:int,cumulativeValue:float}>,high:list<array{year:int,cumulativeValue:float}>}
     */
    private function combineLiquidityForJobs(array $jobs, int $startYear, int $horizonYears): array
    {
        $combined = ['low' => [], 'medium' => [], 'high' => []];

        foreach (['low', 'medium', 'high'] as $band) {
            for ($offset = 0; $offset < $horizonYears; $offset++) {
                $year = $startYear + $offset;
                $combined[$band][] = [
                    'year' => $year,
                    'cumulativeValue' => MoneyMath::sum(array_map(
                        fn (array $job): float => $this->cumulativeValueForYear(is_array($job['liquidity'][$band] ?? null) ? $job['liquidity'][$band] : [], $year),
                        $jobs,
                    )),
                ];
            }
        }

        return $combined;
    }

    /**
     * @param  list<array<string, mixed>>  $jobs
     * @return array<string, mixed>
     */
    private function combinePaperEquityForJobs(array $jobs, bool $isCurrent): array
    {
        $paperEquity = ['scenarios' => [], 'totalsByOutcome' => ['low' => 0.0, 'medium' => 0.0, 'high' => 0.0]];
        if ($jobs === []) {
            return $paperEquity;
        }

        if ($isCurrent) {
            foreach ($jobs as $job) {
                if (is_array($job['paperEquity']['scenarios'] ?? null)) {
                    $paperEquity['scenarios'] = array_merge($paperEquity['scenarios'], array_values(array_filter($job['paperEquity']['scenarios'], 'is_array')));
                }
            }
        } else {
            $lastJob = $jobs[count($jobs) - 1];
            $paperEquity = is_array($lastJob['paperEquity'] ?? null) ? $lastJob['paperEquity'] : $paperEquity;
            foreach (array_slice($jobs, 0, -1) as $prior) {
                $paperEquity = $this->combinePaperEquity($prior, ['paperEquity' => $paperEquity]);
            }
        }

        $paperEquity['totalsByOutcome'] = $this->sumBanded(array_map(
            static fn (array $job): array => is_array($job['lifetime']['totalPaperEquityValue'] ?? null)
                ? $job['lifetime']['totalPaperEquityValue']
                : (is_array($job['lifetime']['totalEquityValue'] ?? null) ? $job['lifetime']['totalEquityValue'] : []),
            $jobs,
        ));

        return $paperEquity;
    }

    /**
     * @param  list<array<string, mixed>>  $jobs
     * @return list<array<string, mixed>>
     */
    private function combineVestingRowsForJobs(array $jobs): array
    {
        $rows = [];
        foreach ($jobs as $job) {
            if (is_array($job['vesting'] ?? null)) {
                $rows = array_merge($rows, array_values(array_filter($job['vesting'], 'is_array')));
            }
        }

        usort($rows, fn (array $left, array $right): int => [(int) ($left['year'] ?? 0), (string) ($left['grantId'] ?? '')] <=> [(int) ($right['year'] ?? 0), (string) ($right['grantId'] ?? '')]);

        return $rows;
    }

    /**
     * @param  list<array<string, mixed>>  $jobs
     * @param  list<array<string, mixed>>  $annual
     * @param  array{low:float,medium:float,high:float}  $preTaxTotalValue
     * @return array<string, mixed>|null
     */
    private function combineAfterTaxForJobs(array $jobs, array $annual, array $preTaxTotalValue, ModelAssumptions $modelAssumptions): ?array
    {
        $afterTaxEntries = [];
        foreach ($jobs as $job) {
            $afterTax = $job['afterTax'] ?? null;
            if (is_array($afterTax)) {
                $afterTaxEntries[] = ['job' => $job, 'afterTax' => $afterTax];
            }
        }
        if ($afterTaxEntries === []) {
            return null;
        }

        $firstEntry = $afterTaxEntries[0];
        $combinedAfterTax = $firstEntry['afterTax'];
        $runningAnnual = is_array($firstEntry['job']['annual'] ?? null) ? $firstEntry['job']['annual'] : [];
        $runningLifetime = is_array($firstEntry['job']['lifetime'] ?? null) ? $firstEntry['job']['lifetime'] : [];

        foreach (array_slice($afterTaxEntries, 1) as $entry) {
            $job = $entry['job'];

            $runningAnnual = $this->combineAnnualRows($runningAnnual, is_array($job['annual'] ?? null) ? $job['annual'] : [], (int) ($annual[0]['year'] ?? 0), count($annual));
            $runningLifetime = $this->combineLifetime($runningAnnual, $runningLifetime, is_array($job['lifetime'] ?? null) ? $job['lifetime'] : []);
            $combinedAfterTax = $this->combineAfterTax($combinedAfterTax, $entry['afterTax'], $runningAnnual, $runningLifetime['totalValue'], $modelAssumptions);
        }

        if ($combinedAfterTax !== null) {
            $combinedAfterTax['lifetime']['totalValue'] = $this->combinedAfterTaxTotalValueByOutcome($jobs, $preTaxTotalValue, $combinedAfterTax);
        }

        return $combinedAfterTax;
    }

    /**
     * @param  list<array<string, mixed>>  $priorRows
     * @param  list<array<string, mixed>>  $offerRows
     * @return list<array<string, mixed>>
     */
    private function combineAnnualRows(array $priorRows, array $offerRows, int $startYear, int $horizonYears): array
    {
        $priorByYear = $this->rowsByYear($priorRows);
        $offerByYear = $this->rowsByYear($offerRows);
        $fields = ['salary', 'bonus', 'vestedLiquidEquity', 'shareSaleProceeds', 'equitySaleBasis', 'equityCapitalGain', 'privateRsuOrdinaryIncome', 'exerciseOutlay', 'freeCashFlow'];
        $rows = [];

        for ($offset = 0; $offset < $horizonYears; $offset++) {
            $year = $startYear + $offset;
            $row = ['year' => $year];
            foreach ($fields as $field) {
                $row[$field] = MoneyMath::sum([
                    (float) ($priorByYear[$year][$field] ?? 0.0),
                    (float) ($offerByYear[$year][$field] ?? 0.0),
                ]);
            }
            $rows[] = $row;
        }

        return $rows;
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     * @return array<int, array<string, mixed>>
     */
    private function rowsByYear(array $rows): array
    {
        $byYear = [];

        foreach ($rows as $row) {
            if (is_numeric($row['year'] ?? null)) {
                $byYear[(int) $row['year']] = $row;
            }
        }

        return $byYear;
    }

    /**
     * @param  list<array<string, mixed>>  $annual
     * @param  array<string, mixed>  $priorLifetime
     * @param  array<string, mixed>  $offerLifetime
     * @return array<string, mixed>
     */
    private function combineLifetime(array $annual, array $priorLifetime, array $offerLifetime): array
    {
        $totalCashComp = MoneyMath::sum(array_map(
            static fn (array $row): float => MoneyMath::add((float) ($row['salary'] ?? 0.0), (float) ($row['bonus'] ?? 0.0)),
            $annual,
        ));
        $totalEquityValue = $this->combineBanded($priorLifetime['totalEquityValue'] ?? [], $offerLifetime['totalEquityValue'] ?? []);
        $totalPaperEquityValue = $this->combineBanded($priorLifetime['totalPaperEquityValue'] ?? $priorLifetime['totalEquityValue'] ?? [], $offerLifetime['totalPaperEquityValue'] ?? []);

        return [
            'totalCashComp' => $totalCashComp,
            'totalEquityValue' => $totalEquityValue,
            'totalPaperEquityValue' => $totalPaperEquityValue,
            'totalValue' => $this->addCashToBanded($totalCashComp, $totalEquityValue),
            'totalPaperValue' => $this->addCashToBanded($totalCashComp, $totalPaperEquityValue),
        ];
    }

    /**
     * @param  array<string, mixed>  $left
     * @param  array<string, mixed>  $right
     * @return array{low:float,medium:float,high:float}
     */
    private function combineBanded(array $left, array $right): array
    {
        return [
            'low' => MoneyMath::add((float) ($left['low'] ?? 0.0), (float) ($right['low'] ?? 0.0)),
            'medium' => MoneyMath::add((float) ($left['medium'] ?? 0.0), (float) ($right['medium'] ?? 0.0)),
            'high' => MoneyMath::add((float) ($left['high'] ?? 0.0), (float) ($right['high'] ?? 0.0)),
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $values
     * @return array{low:float,medium:float,high:float}
     */
    private function sumBanded(array $values): array
    {
        return array_reduce(
            $values,
            fn (array $carry, array $value): array => $this->combineBanded($carry, $value),
            ['low' => 0.0, 'medium' => 0.0, 'high' => 0.0],
        );
    }

    /**
     * @param  array{low:float,medium:float,high:float}  $values
     * @return array{low:float,medium:float,high:float}
     */
    private function addCashToBanded(float $cash, array $values): array
    {
        return [
            'low' => MoneyMath::add($cash, $values['low']),
            'medium' => MoneyMath::add($cash, $values['medium']),
            'high' => MoneyMath::add($cash, $values['high']),
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     */
    private function cumulativeValueForYear(array $rows, int $year): float
    {
        foreach ($rows as $row) {
            if ((int) ($row['year'] ?? 0) === $year) {
                return (float) ($row['cumulativeValue'] ?? 0.0);
            }
        }

        return 0.0;
    }

    /**
     * @param  array<string, mixed>  $prior
     * @param  array<string, mixed>  $offer
     * @return array<string, mixed>
     */
    private function combinePaperEquity(array $prior, array $offer): array
    {
        $paperEquity = is_array($offer['paperEquity'] ?? null) ? $offer['paperEquity'] : ['scenarios' => [], 'totalsByOutcome' => ['low' => 0.0, 'medium' => 0.0, 'high' => 0.0]];
        $priorEquity = is_array($prior['lifetime']['totalPaperEquityValue'] ?? null)
            ? $prior['lifetime']['totalPaperEquityValue']
            : (is_array($prior['lifetime']['totalEquityValue'] ?? null) ? $prior['lifetime']['totalEquityValue'] : []);
        $paperEquity['totalsByOutcome'] = $this->combineBanded($priorEquity, is_array($paperEquity['totalsByOutcome'] ?? null) ? $paperEquity['totalsByOutcome'] : []);

        if (is_array($paperEquity['scenarios'] ?? null)) {
            $paperEquity['scenarios'] = array_map(function (array $scenario) use ($prior): array {
                $band = in_array($scenario['outcome'] ?? null, ['low', 'medium', 'high'], true) ? (string) $scenario['outcome'] : 'medium';
                if (is_array($scenario['points'] ?? null)) {
                    $scenario['points'] = array_map(function (array $point) use ($prior, $band): array {
                        $year = (int) ($point['year'] ?? 0);
                        $point['netPaperValue'] = MoneyMath::add((float) ($point['netPaperValue'] ?? 0.0), $this->priorPaperValueForYear($prior, $band, $year));

                        return $point;
                    }, $scenario['points']);
                }
                $scenario['totalNetPaperValue'] = MoneyMath::add((float) ($scenario['totalNetPaperValue'] ?? 0.0), (float) ($prior['lifetime']['totalPaperEquityValue'][$band] ?? $prior['lifetime']['totalEquityValue'][$band] ?? 0.0));

                return $scenario;
            }, $paperEquity['scenarios']);
        }

        return $paperEquity;
    }

    /**
     * @param  array<string, mixed>  $prior
     */
    private function priorPaperValueForYear(array $prior, string $band, int $year): float
    {
        $paperEquity = is_array($prior['paperEquity'] ?? null) ? $prior['paperEquity'] : [];
        $scenarios = is_array($paperEquity['scenarios'] ?? null) ? $paperEquity['scenarios'] : [];
        $values = [];

        foreach (array_values(array_filter($scenarios, 'is_array')) as $scenario) {
            if (($scenario['outcome'] ?? null) !== $band || ! is_array($scenario['points'] ?? null)) {
                continue;
            }

            foreach (array_values(array_filter($scenario['points'], 'is_array')) as $point) {
                if ((int) ($point['year'] ?? 0) === $year) {
                    $values[] = (float) ($point['netPaperValue'] ?? 0.0);
                }
            }
        }

        if ($values !== []) {
            return max($values);
        }

        return $this->cumulativeValueForYear($prior['liquidity'][$band] ?? [], $year);
    }

    /**
     * @param  array<string, mixed>|null  $priorAfterTax
     * @param  array<string, mixed>|null  $offerAfterTax
     * @param  list<array<string, mixed>>  $annual
     * @param  array{low:float,medium:float,high:float}  $preTaxTotalValue
     * @return array<string, mixed>|null
     */
    private function combineAfterTax(?array $priorAfterTax, ?array $offerAfterTax, array $annual, array $preTaxTotalValue, ModelAssumptions $modelAssumptions): ?array
    {
        if (! is_array($priorAfterTax) || ! is_array($offerAfterTax)) {
            return null;
        }

        $priorByYear = $this->rowsByYear(is_array($priorAfterTax['annual'] ?? null) ? $priorAfterTax['annual'] : []);
        $offerByYear = $this->rowsByYear(is_array($offerAfterTax['annual'] ?? null) ? $offerAfterTax['annual'] : []);
        $preTaxByYear = $this->rowsByYear($annual);
        $isMarried = $modelAssumptions->isMarried();
        $combinedAnnual = [];
        $form6251 = [];
        $lifetime = [
            'taxableCompIncome' => 0.0,
            'totalTaxableIncome' => 0.0,
            'nsoOrdinaryIncome' => 0.0,
            'isoAmtPreference' => 0.0,
            'equitySaleProceeds' => 0.0,
            'equityCapitalGain' => 0.0,
            'estimatedRegularTax' => 0.0,
            'estimatedAmt' => 0.0,
            'totalEstimatedTax' => 0.0,
            'freeCashFlow' => 0.0,
            'totalValue' => ['low' => 0.0, 'medium' => 0.0, 'high' => 0.0],
        ];

        foreach ($annual as $annualRow) {
            $year = (int) $annualRow['year'];
            $prior = $priorByYear[$year] ?? [];
            $offer = $offerByYear[$year] ?? [];
            $taxableCompIncome = MoneyMath::add((float) ($prior['taxableCompIncome'] ?? 0.0), (float) ($offer['taxableCompIncome'] ?? 0.0));
            $equityCapitalGain = MoneyMath::add((float) ($prior['equityCapitalGain'] ?? 0.0), (float) ($offer['equityCapitalGain'] ?? 0.0));
            $totalTaxableIncome = MoneyMath::add($taxableCompIncome, $equityCapitalGain);
            $isoAmtPreference = MoneyMath::add((float) ($prior['isoAmtPreference'] ?? 0.0), (float) ($offer['isoAmtPreference'] ?? 0.0));
            $estimatedRegularTax = MoneyMath::round(FederalIncomeTax::regularTax($totalTaxableIncome, $year, $isMarried, 0.0, $equityCapitalGain));
            $form6251Facts = $this->form6251FactsBuilder->buildFromOtherAdjustments(
                taxableIncome: $totalTaxableIncome,
                line3OtherAdjustments: $isoAmtPreference,
                year: $year,
                isMarried: $isMarried,
                regularTax: $estimatedRegularTax,
                sourceEntries: [],
                preferentialIncome: $equityCapitalGain,
            );
            $estimatedAmt = MoneyMath::round($form6251Facts->amt);
            $totalEstimatedTax = MoneyMath::add($estimatedRegularTax, $estimatedAmt);
            $freeCashFlow = MoneyMath::subtract((float) ($preTaxByYear[$year]['freeCashFlow'] ?? 0.0), $totalEstimatedTax);
            $sourceIds = array_values(array_unique(array_merge(
                is_array($prior['sourceIds'] ?? null) ? $prior['sourceIds'] : [],
                is_array($offer['sourceIds'] ?? null) ? $offer['sourceIds'] : [],
            )));

            if ($isoAmtPreference !== 0.0 || $form6251Facts->amt !== 0.0) {
                $form6251[] = ['year' => $year, 'facts' => $form6251Facts->toArray()];
            }

            $row = [
                'year' => $year,
                'taxableCompIncome' => $taxableCompIncome,
                'totalTaxableIncome' => $totalTaxableIncome,
                'nsoOrdinaryIncome' => MoneyMath::add((float) ($prior['nsoOrdinaryIncome'] ?? 0.0), (float) ($offer['nsoOrdinaryIncome'] ?? 0.0)),
                'isoAmtPreference' => $isoAmtPreference,
                'equitySaleProceeds' => MoneyMath::add((float) ($prior['equitySaleProceeds'] ?? 0.0), (float) ($offer['equitySaleProceeds'] ?? 0.0)),
                'equityCapitalGain' => $equityCapitalGain,
                'estimatedRegularTax' => $estimatedRegularTax,
                'estimatedAmt' => $estimatedAmt,
                'totalEstimatedTax' => $totalEstimatedTax,
                'freeCashFlow' => $freeCashFlow,
                'sourceIds' => $sourceIds,
            ];
            $combinedAnnual[] = $row;

            foreach (['taxableCompIncome', 'totalTaxableIncome', 'nsoOrdinaryIncome', 'isoAmtPreference', 'equitySaleProceeds', 'equityCapitalGain', 'estimatedRegularTax', 'estimatedAmt', 'totalEstimatedTax', 'freeCashFlow'] as $field) {
                $lifetime[$field] = MoneyMath::add($lifetime[$field], (float) $row[$field]);
            }
        }

        $lifetime['totalValue'] = [
            'low' => MoneyMath::subtract($preTaxTotalValue['low'], $lifetime['totalEstimatedTax']),
            'medium' => MoneyMath::subtract($preTaxTotalValue['medium'], $lifetime['totalEstimatedTax']),
            'high' => MoneyMath::subtract($preTaxTotalValue['high'], $lifetime['totalEstimatedTax']),
        ];

        return [
            'annual' => $combinedAnnual,
            'lifetime' => $lifetime,
            'sources' => array_values(array_merge(
                is_array($priorAfterTax['sources'] ?? null) ? $priorAfterTax['sources'] : [],
                is_array($offerAfterTax['sources'] ?? null) ? $offerAfterTax['sources'] : [],
            )),
            'form6251' => $form6251,
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $jobs
     * @param  array{low:float,medium:float,high:float}  $preTaxTotalValue
     * @param  array<string, mixed>  $combinedAfterTax
     * @return array{low:float,medium:float,high:float}
     */
    private function combinedAfterTaxTotalValueByOutcome(array $jobs, array $preTaxTotalValue, array $combinedAfterTax): array
    {
        $mediumTax = (float) ($combinedAfterTax['lifetime']['totalEstimatedTax'] ?? 0.0);
        $separateMediumTax = 0.0;
        $separateTaxByBand = ['low' => 0.0, 'medium' => 0.0, 'high' => 0.0];

        foreach ($jobs as $job) {
            foreach (['low', 'medium', 'high'] as $band) {
                $preTax = (float) ($job['lifetime']['totalValue'][$band] ?? 0.0);
                $afterTax = (float) ($job['afterTax']['lifetime']['totalValue'][$band] ?? $preTax);
                $tax = MoneyMath::subtract($preTax, $afterTax);
                $separateTaxByBand[$band] = MoneyMath::add($separateTaxByBand[$band], $tax);
                if ($band === 'medium') {
                    $separateMediumTax = MoneyMath::add($separateMediumTax, $tax);
                }
            }
        }

        $totalValue = ['low' => 0.0, 'medium' => 0.0, 'high' => 0.0];
        foreach (['low', 'medium', 'high'] as $band) {
            $bandTaxAdjustment = MoneyMath::subtract($separateTaxByBand[$band], $separateMediumTax);
            $bandTax = MoneyMath::add($mediumTax, $bandTaxAdjustment);
            $totalValue[$band] = MoneyMath::subtract($preTaxTotalValue[$band], $bandTax);
        }

        return $totalValue;
    }

    private function raiseFactor(float $raisePct, int $offset): float
    {
        return round((1.0 + ($raisePct / 100.0)) ** $offset, 8);
    }

    private function parseJobStartDate(JobSpec $job): ?DateTimeImmutable
    {
        return $this->parseDateValue($job->value('startDate'));
    }

    private function parseDateValue(mixed $value): ?DateTimeImmutable
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);

        return $date instanceof DateTimeImmutable ? $date : null;
    }

    private function cashCompRaiseOffset(?DateTimeImmutable $jobStartDate, int $projectionOffset, int $year): int
    {
        if ($jobStartDate === null) {
            return $projectionOffset;
        }

        $projectionStartYear = $year - $projectionOffset;
        if ((int) $jobStartDate->format('Y') <= $projectionStartYear) {
            return $projectionOffset;
        }

        return max(0, $year - (int) $jobStartDate->format('Y'));
    }

    private function refresherStartYear(?DateTimeImmutable $jobStartDate, int $projectionStartYear): int
    {
        if ($jobStartDate === null) {
            return $projectionStartYear;
        }

        return max($projectionStartYear, (int) $jobStartDate->format('Y'));
    }

    /**
     * Prorate cash compensation by calendar days worked in the projected year. Null start dates
     * intentionally preserve the historical full-year model.
     */
    private function cashCompYearFactor(?DateTimeImmutable $jobStartDate, int $year, ?DateTimeImmutable $activeThrough = null): float
    {
        $yearStart = new DateTimeImmutable(sprintf('%04d-01-01', $year));
        $nextYearStart = $yearStart->modify('+1 year');
        $activeStart = $jobStartDate instanceof DateTimeImmutable && $jobStartDate > $yearStart ? $jobStartDate : $yearStart;
        $activeEndExclusive = $nextYearStart;

        if ($activeThrough instanceof DateTimeImmutable) {
            if ($activeThrough < $yearStart) {
                return 0.0;
            }

            $candidateEnd = $activeThrough->modify('+1 day');
            $activeEndExclusive = $candidateEnd < $nextYearStart ? $candidateEnd : $nextYearStart;
        }

        if ($activeStart >= $nextYearStart || $activeEndExclusive <= $activeStart) {
            return 0.0;
        }

        $daysInYear = (int) $yearStart->diff($nextYearStart)->days;
        $workedDays = (int) $activeStart->diff($activeEndExclusive)->days;

        return $daysInYear > 0 ? $workedDays / $daysInYear : 1.0;
    }

    /**
     * Build the RSU refresher grants implied by the job's refresher policy: one every
     * `cadenceYears` starting `firstYearOffset`, valued at `pctOfBase`% of that year's raised base.
     * The dollar value is band-agnostic; share counts are resolved per band downstream.
     *
     * @return list<array{grantId:string,grantYearOffset:int,grantYear:int,value:float,vestingMonths:int,cliffMonths:int,frequency:string}>
     */
    private function refresherDefinitions(JobSpec $job, int $startYear, int $horizonYears, ?DateTimeImmutable $jobStartDate, ?DateTimeImmutable $activeThrough): array
    {
        if (! $job->grantsRsu()) {
            return [];
        }

        $pctOfBase = $job->number('refresher.pctOfBase');
        if ($pctOfBase <= 0.0) {
            return [];
        }

        $cadence = max(1, $job->int('refresher.cadenceYears'));
        $firstOffset = max(0, $job->int('refresher.firstYearOffset'));
        $vestingMonths = max(0, (int) round($job->number('refresher.vestingYears') * 12));
        $cliffMonths = max(0, $job->int('refresher.cliffMonths'));
        $frequency = VestingSchedule::normalizeFrequency($job->value('refresher.vestingFrequency'));
        $baseSalary = $job->number('comp.baseSalary');
        $raisePct = $job->number('comp.annualRaisePct');
        $refresherStartYear = $this->refresherStartYear($jobStartDate, $startYear);

        $definitions = [];
        for ($offset = 0; $offset < $horizonYears; $offset++) {
            $grantYear = $startYear + $offset;
            $grantDate = DateTimeImmutable::createFromFormat('!Y-m-d', sprintf('%04d-01-01', $grantYear));
            if ($activeThrough instanceof DateTimeImmutable && $grantDate instanceof DateTimeImmutable && $grantDate > $activeThrough) {
                continue;
            }

            $yearsSinceRefresherStart = $grantYear - $refresherStartYear;
            if ($yearsSinceRefresherStart < $firstOffset || ($yearsSinceRefresherStart - $firstOffset) % $cadence !== 0) {
                continue;
            }

            $raisedBase = MoneyMath::multiply($baseSalary, $this->raiseFactor($raisePct, $this->cashCompRaiseOffset($jobStartDate, $offset, $grantYear)));
            $value = MoneyMath::multiply($raisedBase, $pctOfBase / 100.0);
            if ($value <= 0.0) {
                continue;
            }

            $definitions[] = [
                'grantId' => $job->id().'-refresher-'.$grantYear,
                'grantYearOffset' => $offset,
                'grantYear' => $grantYear,
                'value' => $value,
                'vestingMonths' => $vestingMonths,
                'cliffMonths' => $cliffMonths,
                'frequency' => $frequency,
            ];
        }

        return $definitions;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function projectedOptionRefresherGrants(JobSpec $job, int $startYear, int $horizonYears, ?DateTimeImmutable $jobStartDate, ModelAssumptions $modelAssumptions, ?DateTimeImmutable $activeThrough): array
    {
        if (! $job->grantsOptions() || (string) $job->value('refresher.optionType') !== 'iso') {
            return [];
        }

        $optionPct = $job->number('refresher.optionPctOfFullyDilutedShares');
        $fullyDilutedShares = $job->number('company.fullyDilutedShares');
        if ($optionPct <= 0.0 || $fullyDilutedShares <= 0.0) {
            return [];
        }

        $shareCount = MoneyMath::multiply($fullyDilutedShares, $optionPct / 100.0);
        if ($shareCount <= 0.0) {
            return [];
        }

        $cadence = max(1, $job->int('refresher.cadenceYears'));
        $firstOffset = max(0, $job->int('refresher.firstYearOffset'));
        $vestingYears = max(0.25, $job->number('refresher.vestingYears'));
        $cliffMonths = max(0, $job->int('refresher.cliffMonths'));
        $frequency = VestingSchedule::normalizeFrequency($job->value('refresher.vestingFrequency'));
        $refresherStartYear = $this->refresherStartYear($jobStartDate, $startYear);
        $grants = [];

        for ($offset = 0; $offset < $horizonYears; $offset++) {
            $grantYear = $startYear + $offset;
            $grantDate = DateTimeImmutable::createFromFormat('!Y-m-d', sprintf('%04d-01-01', $grantYear));
            if ($activeThrough instanceof DateTimeImmutable && $grantDate instanceof DateTimeImmutable && $grantDate > $activeThrough) {
                continue;
            }

            $yearsSinceRefresherStart = $grantYear - $refresherStartYear;
            if ($yearsSinceRefresherStart < $firstOffset || ($yearsSinceRefresherStart - $firstOffset) % $cadence !== 0) {
                continue;
            }

            $grants[] = [
                'id' => $job->id().'-option-refresher-'.$grantYear,
                'kind' => 'refresher',
                'type' => 'iso',
                'grantDate' => sprintf('%04d-01-01', $grantYear),
                'vestingStartDate' => null,
                'shareCount' => round($shareCount, 4),
                'strike' => $this->optionRefresherStrike($job, $offset, $grantYear, $modelAssumptions),
                'cliffMonths' => $cliffMonths,
                'vestingYears' => $vestingYears,
                'vestingFrequency' => $frequency,
                'earlyExercise83b' => false,
                'source' => 'projected_refresher',
            ];
        }

        return $grants;
    }

    /**
     * @param  list<array<string, mixed>>  $projectedOptionGrants
     */
    private function withProjectedOptionRefresherGrants(JobSpec $job, array $projectedOptionGrants): JobSpec
    {
        if ($projectedOptionGrants === []) {
            return $job;
        }

        $values = $job->toArray();
        $existingGrants = is_array($values['optionGrants'] ?? null) ? array_values(array_filter($values['optionGrants'], 'is_array')) : [];
        $values['optionGrants'] = array_merge($existingGrants, $projectedOptionGrants);

        return JobSpec::nullableFromArray($values, $job->isCurrent()) ?? $job;
    }

    private function optionRefresherStrike(JobSpec $job, int $grantYearOffset, int $grantYear, ModelAssumptions $modelAssumptions): float
    {
        if (! $job->isPrivate()) {
            return $this->equityValuationService->sharePrice($job, $grantYearOffset, 'medium');
        }

        return $this->privateValuationScenarioService->commonFmvForYear($job, $grantYear, 'medium', $modelAssumptions);
    }

    /**
     * @param  array<string, mixed>  $valuation
     * @param  array{scenarios:list<array<string, mixed>>,totalsByOutcome:array{low:float,medium:float,high:float}}  $paperEquityProjection
     * @param  list<array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float,source?:string}>  $taxBasisVestingRows
     * @return array<string, mixed>
     */
    private function applyPrivateScenarioLiquidity(JobSpec $job, array $valuation, array $paperEquityProjection, array $taxBasisVestingRows, ModelAssumptions $modelAssumptions, int $startYear, int $horizonYears): array
    {
        if (! $job->isPrivate()) {
            return $valuation;
        }

        $scenarios = array_values(array_filter($paperEquityProjection['scenarios'], 'is_array'));
        if ($scenarios === []) {
            return $valuation;
        }

        $bestScenariosByOutcome = $this->bestPrivateScenariosByOutcome($scenarios);
        if ($bestScenariosByOutcome === []) {
            return $valuation;
        }

        $valuation['annualEquitySaleBasis'] = [];
        $valuation['annualEquityCapitalGain'] = [];
        $valuation['annualPrivateRsuOrdinaryIncome'] = [];
        $valuation['annualEquityByOutcome'] = [];
        $valuation['annualEquitySaleBasisByOutcome'] = [];
        $valuation['annualEquityCapitalGainByOutcome'] = [];
        $valuation['annualPrivateRsuOrdinaryIncomeByOutcome'] = [];

        foreach (['low', 'medium', 'high'] as $band) {
            $scenario = $bestScenariosByOutcome[$band] ?? $bestScenariosByOutcome['medium'] ?? null;
            if (! is_array($scenario)) {
                continue;
            }

            $pointsByYear = $this->privateScenarioPointsByYear($scenario);
            $liquidity = [];
            $previousCumulativeValue = 0.0;
            $previousCumulativeBasis = 0.0;
            $previousCumulativePrivateRsuOrdinaryIncome = 0.0;
            $finalCumulativeValue = 0.0;

            for ($offset = 0; $offset < $horizonYears; $offset++) {
                $year = $startYear + $offset;
                $point = $pointsByYear[$year] ?? null;
                $isLiquid = is_array($point) && filter_var($point['liquidityEvent'] ?? false, FILTER_VALIDATE_BOOL);
                $cumulativeValue = $isLiquid ? MoneyMath::round($this->number($point['grossOwnershipValue'] ?? null)) : 0.0;
                $cumulativePrivateRsuOrdinaryIncome = $isLiquid ? MoneyMath::round($this->number($point['rsuOwnershipValue'] ?? null)) : 0.0;
                $cumulativeBasis = $isLiquid ? MoneyMath::round(MoneyMath::add(
                    MoneyMath::add($this->number($point['exerciseCost'] ?? null), $this->cumulativeTaxedNsoBasis($job, $taxBasisVestingRows, $year, $modelAssumptions)),
                    $cumulativePrivateRsuOrdinaryIncome,
                )) : 0.0;

                $liquidity[] = ['year' => $year, 'cumulativeValue' => $cumulativeValue];
                $finalCumulativeValue = $cumulativeValue;

                $annualProceeds = max(0.0, MoneyMath::subtract($cumulativeValue, $previousCumulativeValue));
                $annualBasis = max(0.0, MoneyMath::subtract($cumulativeBasis, $previousCumulativeBasis));
                $annualPrivateRsuOrdinaryIncome = max(0.0, MoneyMath::subtract($cumulativePrivateRsuOrdinaryIncome, $previousCumulativePrivateRsuOrdinaryIncome));
                $annualCapitalGain = max(0.0, MoneyMath::subtract($annualProceeds, $annualBasis));
                $valuation['annualEquityByOutcome'][$band][$year] = $annualProceeds;
                $valuation['annualEquitySaleBasisByOutcome'][$band][$year] = $annualBasis;
                $valuation['annualEquityCapitalGainByOutcome'][$band][$year] = $annualCapitalGain;
                $valuation['annualPrivateRsuOrdinaryIncomeByOutcome'][$band][$year] = $annualPrivateRsuOrdinaryIncome;

                if ($band === 'medium') {
                    $valuation['annualEquity'][$year] = $annualProceeds;
                    $valuation['annualEquitySaleBasis'][$year] = $annualBasis;
                    $valuation['annualEquityCapitalGain'][$year] = $annualCapitalGain;
                    $valuation['annualPrivateRsuOrdinaryIncome'][$year] = $annualPrivateRsuOrdinaryIncome;
                }

                $previousCumulativeValue = $cumulativeValue;
                $previousCumulativeBasis = $cumulativeBasis;
                $previousCumulativePrivateRsuOrdinaryIncome = $cumulativePrivateRsuOrdinaryIncome;
            }

            $valuation['liquidity'][$band] = $liquidity;
            $valuation['totals'][$band] = $finalCumulativeValue;
        }

        return $valuation;
    }

    /**
     * @param  list<array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float,source?:string}>  $vestingRows
     * @param  list<array{year:int,salary:float,bonus:float,vestedLiquidEquity:float,shareSaleProceeds:float,equitySaleBasis:float,equityCapitalGain:float,privateRsuOrdinaryIncome:float,exerciseOutlay:float,freeCashFlow:float}>  $annual
     * @param  array<string, mixed>  $valuation
     * @param  array{low:float,medium:float,high:float}  $preTaxTotalValue
     * @param  array{low:float,medium:float,high:float}  $defaultTotalValue
     * @param  array{lifetime:array{totalEstimatedTax:float}}  $mediumFacts  Already-built medium-outcome after-tax facts, reused to skip a redundant rebuild.
     * @return array{low:float,medium:float,high:float}
     */
    private function afterTaxTotalValueByOutcome(JobSpec $job, array $vestingRows, array $annual, array $valuation, array $preTaxTotalValue, array $defaultTotalValue, ModelAssumptions $modelAssumptions, array $mediumFacts): array
    {
        if (! is_array($valuation['annualEquityByOutcome'] ?? null)) {
            return $defaultTotalValue;
        }

        $totalValue = ['low' => 0.0, 'medium' => 0.0, 'high' => 0.0];
        foreach (['low', 'medium', 'high'] as $band) {
            $bandFacts = $band === 'medium'
                ? $mediumFacts
                : $this->equityCompensationFactsBuilder->build($job, $vestingRows, $this->annualRowsForOutcome($annual, $valuation, $band), $preTaxTotalValue, $modelAssumptions)->toArray();
            $totalValue[$band] = MoneyMath::subtract($preTaxTotalValue[$band], $bandFacts['lifetime']['totalEstimatedTax']);
        }

        return $totalValue;
    }

    /**
     * @param  list<array{year:int,salary:float,bonus:float,vestedLiquidEquity:float,shareSaleProceeds:float,equitySaleBasis:float,equityCapitalGain:float,privateRsuOrdinaryIncome:float,exerciseOutlay:float,freeCashFlow:float}>  $annual
     * @param  array<string, mixed>  $valuation
     * @return list<array{year:int,salary:float,bonus:float,vestedLiquidEquity:float,shareSaleProceeds:float,equitySaleBasis:float,equityCapitalGain:float,privateRsuOrdinaryIncome:float,exerciseOutlay:float,freeCashFlow:float}>
     */
    private function annualRowsForOutcome(array $annual, array $valuation, string $band): array
    {
        $rows = [];
        foreach ($annual as $row) {
            $year = (int) $row['year'];
            $shareSaleProceeds = MoneyMath::round($valuation['annualEquityByOutcome'][$band][$year] ?? 0.0);
            $row['vestedLiquidEquity'] = $shareSaleProceeds;
            $row['shareSaleProceeds'] = $shareSaleProceeds;
            $row['equitySaleBasis'] = MoneyMath::round($valuation['annualEquitySaleBasisByOutcome'][$band][$year] ?? 0.0);
            $row['equityCapitalGain'] = MoneyMath::round($valuation['annualEquityCapitalGainByOutcome'][$band][$year] ?? 0.0);
            $row['privateRsuOrdinaryIncome'] = MoneyMath::round($valuation['annualPrivateRsuOrdinaryIncomeByOutcome'][$band][$year] ?? 0.0);
            $row['freeCashFlow'] = MoneyMath::subtract(MoneyMath::sum([$row['salary'], $row['bonus'], $shareSaleProceeds]), $row['exerciseOutlay']);
            $rows[] = $row;
        }

        return $rows;
    }

    /**
     * @param  list<array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float,source?:string}>  $vestingRows
     */
    private function cumulativeTaxedNsoBasis(JobSpec $job, array $vestingRows, int $saleYear, ModelAssumptions $modelAssumptions): float
    {
        $basis = 0.0;

        foreach ($vestingRows as $row) {
            if ((int) $row['year'] > $saleYear || (string) $row['type'] !== 'nso') {
                continue;
            }

            $basis = MoneyMath::add($basis, $this->nsoBargainElement($job, $row, (int) $row['year'], $modelAssumptions));
        }

        return $basis;
    }

    /**
     * @param  array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float,source?:string}  $row
     */
    private function nsoBargainElement(JobSpec $job, array $row, int $exerciseYear, ModelAssumptions $modelAssumptions): float
    {
        $sharePrice = $this->privateValuationScenarioService->commonFmvForYear($job, $exerciseYear, 'medium', $modelAssumptions);
        $spread = max(0.0, MoneyMath::subtract($sharePrice, $this->strikeForGrant($job, (string) $row['grantId'])));

        return MoneyMath::multiply($spread, (float) $row['exercisableShares']);
    }

    /**
     * @param  list<array<string, mixed>>  $scenarios
     * @return array{low?:array<string, mixed>,medium?:array<string, mixed>,high?:array<string, mixed>}
     */
    private function bestPrivateScenariosByOutcome(array $scenarios): array
    {
        $best = [];

        foreach ($scenarios as $scenario) {
            if (! $this->privateScenarioHasLiquidityEvent($scenario)) {
                continue;
            }

            $outcome = (string) ($scenario['outcome'] ?? 'medium');
            if (! in_array($outcome, ['low', 'medium', 'high'], true)) {
                $outcome = 'medium';
            }

            $currentTotal = $this->number($best[$outcome]['totalNetPaperValue'] ?? null);
            $candidateTotal = $this->number($scenario['totalNetPaperValue'] ?? null);
            if (! isset($best[$outcome]) || $candidateTotal >= $currentTotal) {
                $best[$outcome] = $scenario;
            }
        }

        return $best;
    }

    /**
     * @param  array<string, mixed>  $scenario
     */
    private function privateScenarioHasLiquidityEvent(array $scenario): bool
    {
        foreach ($this->privateScenarioPointsByYear($scenario) as $point) {
            if (filter_var($point['liquidityEvent'] ?? false, FILTER_VALIDATE_BOOL)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $scenario
     * @return array<int, array<string, mixed>>
     */
    private function privateScenarioPointsByYear(array $scenario): array
    {
        $pointsByYear = [];
        $points = is_array($scenario['points'] ?? null) ? array_values(array_filter($scenario['points'], 'is_array')) : [];

        foreach ($points as $point) {
            $pointsByYear[(int) ($point['year'] ?? 0)] = $point;
        }

        return $pointsByYear;
    }

    /**
     * @param  list<array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float,source?:string}>  $refresherRows
     * @return list<array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float,source?:string}>
     */
    private function paperVestingRows(JobSpec $job, int $startYear, int $horizonYears, array $refresherRows, ?DateTimeImmutable $activeThrough): array
    {
        $paperStartYear = min($startYear, $this->earliestGrantYear($job) ?? $startYear);
        $paperHorizonYears = max(1, $startYear + $horizonYears - $paperStartYear);
        $paperOptionResult = $this->optionsVestingService->expand($job, $paperStartYear, $paperHorizonYears, $activeThrough);

        return array_merge(
            $this->rsuVestingExpander->expand($job, $paperStartYear, $paperHorizonYears, $activeThrough),
            $paperOptionResult['rows'],
            $refresherRows,
        );
    }

    private function earliestGrantYear(JobSpec $job): ?int
    {
        $years = [];
        foreach (array_merge($job->rsuGrants(), $job->optionGrants()) as $grant) {
            $year = $this->grantYear($grant);
            if ($year !== null) {
                $years[] = $year;
            }
        }

        return $years === [] ? null : min($years);
    }

    /**
     * @param  array<string, mixed>  $grant
     */
    private function grantYear(array $grant): ?int
    {
        $grantDate = (string) ($grant['grantDate'] ?? '');
        if ($grantDate === '') {
            return null;
        }

        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $grantDate);
        if (! $date instanceof DateTimeImmutable) {
            return null;
        }

        return (int) $date->format('Y');
    }

    /**
     * @param  list<array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float,source?:string}>  $optionRows
     */
    private function exerciseOutlayForYear(JobSpec $job, array $optionRows, int $year): float
    {
        $outlays = [];
        foreach ($optionRows as $row) {
            if ((int) $row['year'] !== $year) {
                continue;
            }

            $strike = $this->strikeForGrant($job, (string) $row['grantId']);
            $outlays[] = MoneyMath::multiply($strike, $row['exercisableShares']);
        }

        return MoneyMath::sum($outlays);
    }

    private function strikeForGrant(JobSpec $job, string $grantId): float
    {
        foreach ($job->optionGrants() as $grant) {
            if ((string) ($grant['id'] ?? '') === $grantId) {
                return is_numeric($grant['strike'] ?? null) ? (float) $grant['strike'] : 0.0;
            }
        }

        return 0.0;
    }

    /**
     * @return list<string>
     */
    private function staticWarnings(JobSpec $job, int $startYear, int $horizonYears): array
    {
        $warnings = [];
        $low = $job->number('growthBands.lowPct');
        $medium = $job->number('growthBands.mediumPct');
        $high = $job->number('growthBands.highPct');

        if ($low >= $medium || $medium >= $high) {
            $warnings[] = "{$job->name()}: growth bands should increase from Low to Medium to High.";
        }

        foreach (array_merge($job->rsuGrants(), $job->optionGrants()) as $grant) {
            $vestingMonths = (int) round((float) ($grant['vestingYears'] ?? 0) * 12);
            $cliffMonths = (int) round((float) ($grant['cliffMonths'] ?? 0));
            if ($vestingMonths > 0 && $cliffMonths > $vestingMonths) {
                $warnings[] = "{$job->name()}: grant {$grant['id']} cliff is longer than total vesting.";
            }
        }

        if ($job->isPrivate() && ! $this->privateLiquidityWithinHorizon($job, $startYear, $horizonYears)) {
            $warnings[] = "{$job->name()}: private liquidity date is beyond the planning horizon; equity never realizes.";
        }

        return $warnings;
    }

    private function privateLiquidityWithinHorizon(JobSpec $job, int $startYear, int $horizonYears): bool
    {
        foreach ($job->valuationScenarios() as $scenario) {
            $stages = is_array($scenario['stages'] ?? null) ? array_values(array_filter($scenario['stages'], 'is_array')) : [];
            foreach ($stages as $stage) {
                $year = (int) ($stage['year'] ?? 0);
                if ($year >= $startYear && $year < $startYear + $horizonYears && filter_var($stage['liquidityEvent'] ?? false, FILTER_VALIDATE_BOOL)) {
                    return true;
                }
            }
        }

        $value = $job->value('company.liquidityDate');
        if (! is_string($value) || $value === '') {
            return false;
        }

        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        if (! $date instanceof DateTimeImmutable) {
            return false;
        }

        $year = (int) $date->format('Y');

        return $year >= $startYear && $year < $startYear + $horizonYears;
    }

    private function number(mixed $value): float
    {
        return is_numeric($value) ? (float) $value : 0.0;
    }

    /**
     * @param  list<array<string, mixed>>  $jobs
     * @return list<array<string, mixed>>
     */
    private function deltasVsCurrent(array $jobs, ?string $currentJobId): array
    {
        if ($currentJobId === null) {
            return [];
        }

        $current = null;
        foreach ($jobs as $job) {
            if (($job['id'] ?? null) === $currentJobId || ($job['isCurrent'] ?? false) === true) {
                $current = $job;
                break;
            }
        }
        if (! is_array($current)) {
            return [];
        }

        $deltas = [];
        foreach ($jobs as $job) {
            if (($job['id'] ?? null) === $currentJobId || ($job['isCurrent'] ?? false) === true || ! is_array($job['lifetime'] ?? null)) {
                continue;
            }

            $deltas[] = [
                'jobId' => (string) $job['id'],
                'name' => (string) $job['name'],
                'cashCompDelta' => MoneyMath::subtract((float) ($job['lifetime']['totalCashComp'] ?? 0.0), (float) ($current['lifetime']['totalCashComp'] ?? 0.0)),
                'totalValueDelta' => [
                    'low' => MoneyMath::subtract((float) ($job['lifetime']['totalValue']['low'] ?? 0.0), (float) ($current['lifetime']['totalValue']['low'] ?? 0.0)),
                    'medium' => MoneyMath::subtract((float) ($job['lifetime']['totalValue']['medium'] ?? 0.0), (float) ($current['lifetime']['totalValue']['medium'] ?? 0.0)),
                    'high' => MoneyMath::subtract((float) ($job['lifetime']['totalValue']['high'] ?? 0.0), (float) ($current['lifetime']['totalValue']['high'] ?? 0.0)),
                ],
                'totalPaperValueDelta' => [
                    'low' => MoneyMath::subtract((float) ($job['lifetime']['totalPaperValue']['low'] ?? 0.0), (float) ($current['lifetime']['totalPaperValue']['low'] ?? 0.0)),
                    'medium' => MoneyMath::subtract((float) ($job['lifetime']['totalPaperValue']['medium'] ?? 0.0), (float) ($current['lifetime']['totalPaperValue']['medium'] ?? 0.0)),
                    'high' => MoneyMath::subtract((float) ($job['lifetime']['totalPaperValue']['high'] ?? 0.0), (float) ($current['lifetime']['totalPaperValue']['high'] ?? 0.0)),
                ],
            ];
        }

        return $deltas;
    }
}
