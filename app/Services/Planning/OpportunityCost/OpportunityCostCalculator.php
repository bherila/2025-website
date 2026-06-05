<?php

namespace App\Services\Planning\OpportunityCost;

use App\Services\Finance\MoneyMath;
use DateTimeImmutable;

final class OpportunityCostCalculator
{
    public function __construct(
        private RsuVestingExpander $rsuVestingExpander = new RsuVestingExpander,
        private OptionsVestingService $optionsVestingService = new OptionsVestingService,
        private EquityValuationService $equityValuationService = new EquityValuationService,
    ) {}

    public function project(OpportunityCostInputs $inputs): OpportunityCostProjection
    {
        $startYear = $inputs->int('startYear');
        $horizonYears = max(1, $inputs->int('horizonYears'));
        $jobs = [];
        $warnings = [];
        $currentJob = $inputs->currentJob();

        $jobSpecs = [];
        if ($currentJob instanceof JobSpec) {
            $jobSpecs[] = $currentJob;
        }
        foreach ($inputs->hypotheticalJobs() as $job) {
            $jobSpecs[] = $job;
        }

        foreach ($jobSpecs as $job) {
            $projected = $this->projectJob($job, $startYear, $horizonYears);
            $jobs[] = $projected['job'];
            $warnings = array_merge($warnings, $projected['warnings']);
        }

        return new OpportunityCostProjection([
            'startYear' => $startYear,
            'horizonYears' => $horizonYears,
            'currentJobId' => $currentJob?->id(),
            'jobs' => $jobs,
            'deltasVsCurrent' => $this->deltasVsCurrent($jobs, $currentJob?->id()),
            'warnings' => array_values(array_unique($warnings)),
        ]);
    }

    /**
     * @return array{job:array<string, mixed>,warnings:list<string>}
     */
    private function projectJob(JobSpec $job, int $startYear, int $horizonYears): array
    {
        $warnings = $this->staticWarnings($job, $startYear, $horizonYears);
        $rsuRows = $this->rsuVestingExpander->expand($job, $startYear, $horizonYears);
        $optionResult = $this->optionsVestingService->expand($job, $startYear, $horizonYears);
        $vestingRows = array_merge($rsuRows, $optionResult['rows']);
        $warnings = array_merge($warnings, $optionResult['warnings']);
        $valuation = $this->equityValuationService->value($job, $vestingRows, $startYear, $horizonYears);

        $annual = [];
        $totalCashComp = 0.0;
        $negativeFcfWarned = false;

        for ($offset = 0; $offset < $horizonYears; $offset++) {
            $year = $startYear + $offset;
            $salary = MoneyMath::round($job->number('comp.baseSalary'));
            $bonus = MoneyMath::round($job->number('comp.cashBonus'));
            $vestedLiquidEquity = MoneyMath::round($valuation['annualEquity'][$year] ?? 0.0);
            $shareSaleProceeds = $vestedLiquidEquity;
            $exerciseOutlay = $this->exerciseOutlayForYear($job, $optionResult['rows'], $year);
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
                'exerciseOutlay' => $exerciseOutlay,
                'freeCashFlow' => $freeCashFlow,
            ];
        }

        $lifetime = [
            'totalCashComp' => $totalCashComp,
            'totalEquityValue' => $valuation['totals'],
            'totalValue' => [
                'low' => MoneyMath::add($totalCashComp, $valuation['totals']['low']),
                'medium' => MoneyMath::add($totalCashComp, $valuation['totals']['medium']),
                'high' => MoneyMath::add($totalCashComp, $valuation['totals']['high']),
            ],
        ];

        return [
            'job' => [
                'id' => $job->id(),
                'name' => $job->name(),
                'isCurrent' => $job->isCurrent(),
                'annual' => $annual,
                'liquidity' => $valuation['liquidity'],
                'vesting' => $vestingRows,
                'lifetime' => $lifetime,
            ],
            'warnings' => $warnings,
        ];
    }

    /**
     * @param  list<array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float}>  $optionRows
     */
    private function exerciseOutlayForYear(JobSpec $job, array $optionRows, int $year): float
    {
        $outlays = [];
        foreach ($optionRows as $row) {
            if ((int) $row['year'] !== $year) {
                continue;
            }

            $strike = $this->strikeForGrant($job, (string) $row['grantId']);
            $outlays[] = MoneyMath::multiply($row['exercisableShares'], $strike);
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
            if (($job['id'] ?? null) === $currentJobId) {
                $current = $job;
                break;
            }
        }
        if (! is_array($current)) {
            return [];
        }

        $deltas = [];
        foreach ($jobs as $job) {
            if (($job['id'] ?? null) === $currentJobId || ! is_array($job['lifetime'] ?? null)) {
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
            ];
        }

        return $deltas;
    }
}
