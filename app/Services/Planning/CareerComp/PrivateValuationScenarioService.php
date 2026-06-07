<?php

namespace App\Services\Planning\CareerComp;

use App\Services\Finance\MoneyMath;

final class PrivateValuationScenarioService
{
    /**
     * @param  list<array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float,source?:string}>  $vestingRows
     * @return array{scenarios:list<array{id:string,label:string,outcome:string,points:list<array<string, mixed>>,totalNetPaperValue:float}>,totalsByOutcome:array{low:float,medium:float,high:float}}
     */
    public function project(JobSpec $job, array $vestingRows, int $startYear, int $horizonYears): array
    {
        $totalsByOutcome = ['low' => 0.0, 'medium' => 0.0, 'high' => 0.0];

        if (! $job->isPrivate()) {
            return ['scenarios' => [], 'totalsByOutcome' => $totalsByOutcome];
        }

        $baseFullyDilutedShares = $job->number('company.fullyDilutedShares');
        if ($baseFullyDilutedShares <= 0.0) {
            return ['scenarios' => [], 'totalsByOutcome' => $totalsByOutcome];
        }

        $scenarios = [];
        foreach ($job->valuationScenarios() as $scenario) {
            $stages = $this->normalizedStages($scenario);
            if ($stages === []) {
                continue;
            }

            $outcome = $this->normalizeOutcome((string) ($scenario['outcome'] ?? 'medium'));
            $points = $this->pointsForScenario($job, $vestingRows, $stages, $baseFullyDilutedShares, $startYear, $horizonYears);
            $totalNetPaperValue = $points === [] ? 0.0 : (float) $points[array_key_last($points)]['netPaperValue'];

            $scenarios[] = [
                'id' => $this->scenarioId($scenario, count($scenarios) + 1),
                'label' => $this->scenarioLabel($scenario, count($scenarios) + 1),
                'outcome' => $outcome,
                'points' => $points,
                'totalNetPaperValue' => MoneyMath::round($totalNetPaperValue),
            ];

            $totalsByOutcome[$outcome] = max($totalsByOutcome[$outcome], MoneyMath::round($totalNetPaperValue));
        }

        return ['scenarios' => $scenarios, 'totalsByOutcome' => $totalsByOutcome];
    }

    /**
     * @param  array<string, mixed>  $scenario
     * @return list<array<string, mixed>>
     */
    private function normalizedStages(array $scenario): array
    {
        $stages = is_array($scenario['stages'] ?? null) ? $scenario['stages'] : [];
        $stages = array_values(array_filter($stages, 'is_array'));
        usort($stages, fn (array $left, array $right): int => ((int) ($left['year'] ?? 0)) <=> ((int) ($right['year'] ?? 0)));

        return $stages;
    }

    /**
     * @param  list<array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float,source?:string}>  $vestingRows
     * @param  list<array<string, mixed>>  $stages
     * @return list<array<string, mixed>>
     */
    private function pointsForScenario(JobSpec $job, array $vestingRows, array $stages, float $baseFullyDilutedShares, int $startYear, int $horizonYears): array
    {
        $points = [];

        for ($offset = 0; $offset < $horizonYears; $offset++) {
            $year = $startYear + $offset;
            $snapshot = $this->snapshotForYear($stages, $year);
            $commonFmv = $this->commonFmvForSnapshot($job, $snapshot, $baseFullyDilutedShares);
            $shareTotals = $this->cumulativeShareTotals($job, $vestingRows, $year);
            $dilutionFactor = $this->cumulativeDilutionFactor($stages, $year);
            $dilutedOwnershipPct = $baseFullyDilutedShares > 0.0
                ? round(($shareTotals['totalShares'] / $baseFullyDilutedShares) * $dilutionFactor * 100.0, 6)
                : 0.0;

            $preferredPostMoneyValuation = $this->number($snapshot['preferredPostMoneyValuation'] ?? null);
            $grossOwnershipValue = MoneyMath::multiply($preferredPostMoneyValuation, $dilutedOwnershipPct / 100.0);
            $rsuCommonValue = MoneyMath::multiply($commonFmv, $shareTotals['rsuShares']);
            $optionCommonValue = MoneyMath::multiply($commonFmv, $shareTotals['optionShares']);
            $grossCommonValue = MoneyMath::add($rsuCommonValue, $optionCommonValue);
            $optionIntrinsicValue = MoneyMath::sum($this->optionIntrinsicValues($job, $shareTotals['optionSharesByGrant'], $commonFmv));
            $commonIntrinsicValue = MoneyMath::add($rsuCommonValue, $optionIntrinsicValue);
            $netPaperValue = max(0.0, MoneyMath::subtract($grossOwnershipValue, $shareTotals['exerciseCost']));

            $points[] = [
                'year' => $year,
                'stage' => trim((string) ($snapshot['stage'] ?? '')) !== '' ? (string) $snapshot['stage'] : null,
                'preferredPostMoneyValuation' => MoneyMath::round($preferredPostMoneyValuation),
                'capitalDilutionPct' => $this->number($snapshot['capitalDilutionPct'] ?? null),
                'employeePoolDilutionPct' => $this->number($snapshot['employeePoolDilutionPct'] ?? null),
                'dilutedOwnershipPct' => $dilutedOwnershipPct,
                'commonFmv' => MoneyMath::round($commonFmv),
                'grossOwnershipValue' => $grossOwnershipValue,
                'grossCommonValue' => $grossCommonValue,
                'commonIntrinsicValue' => $commonIntrinsicValue,
                'exerciseCost' => $shareTotals['exerciseCost'],
                'netPaperValue' => $netPaperValue,
                'cumulativeNetPaperValue' => $netPaperValue,
                'liquidityEvent' => $this->hasLiquidityEvent($stages, $year),
            ];
        }

        return $points;
    }

    /**
     * @param  list<array<string, mixed>>  $stages
     * @return array<string, mixed>
     */
    private function snapshotForYear(array $stages, int $year): array
    {
        $snapshot = $stages[0] ?? [];
        foreach ($stages as $stage) {
            if ((int) ($stage['year'] ?? 0) > $year) {
                break;
            }

            $snapshot = $stage;
        }

        return $snapshot;
    }

    /**
     * @param  list<array<string, mixed>>  $stages
     */
    private function cumulativeDilutionFactor(array $stages, int $year): float
    {
        $factor = 1.0;
        foreach ($stages as $stage) {
            if ((int) ($stage['year'] ?? 0) > $year) {
                break;
            }

            $dilutionPct = min(100.0, max(0.0, $this->number($stage['capitalDilutionPct'] ?? null) + $this->number($stage['employeePoolDilutionPct'] ?? null)));
            $factor *= 1.0 - ($dilutionPct / 100.0);
        }

        return round(max(0.0, $factor), 8);
    }

    /**
     * @param  list<array<string, mixed>>  $stages
     */
    private function hasLiquidityEvent(array $stages, int $year): bool
    {
        foreach ($stages as $stage) {
            if ((int) ($stage['year'] ?? 0) <= $year && filter_var($stage['liquidityEvent'] ?? false, FILTER_VALIDATE_BOOL)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $snapshot
     */
    private function commonFmvForSnapshot(JobSpec $job, array $snapshot, float $baseFullyDilutedShares): float
    {
        $explicitCommonFmv = $this->number($snapshot['commonFmv'] ?? null);
        if ($explicitCommonFmv > 0.0) {
            return $explicitCommonFmv;
        }

        $preferredPostMoneyValuation = $this->number($snapshot['preferredPostMoneyValuation'] ?? null);
        if ($preferredPostMoneyValuation > 0.0 && $baseFullyDilutedShares > 0.0) {
            $commonDiscountPct = min(100.0, max(0.0, $this->number($snapshot['commonFmvDiscountPct'] ?? null)));

            return MoneyMath::multiply(MoneyMath::divide($preferredPostMoneyValuation, $baseFullyDilutedShares), 1.0 - ($commonDiscountPct / 100.0));
        }

        return $job->number('company.fourNineA');
    }

    /**
     * @param  list<array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float,source?:string}>  $vestingRows
     * @return array{rsuShares:float,optionShares:float,totalShares:float,exerciseCost:float,optionSharesByGrant:array<string, float>}
     */
    private function cumulativeShareTotals(JobSpec $job, array $vestingRows, int $year): array
    {
        $rsuShares = 0.0;
        $optionSharesByGrant = [];

        foreach ($vestingRows as $row) {
            if ((int) $row['year'] > $year) {
                continue;
            }

            $type = (string) $row['type'];
            if ($type === 'rsu') {
                $rsuShares += (float) $row['vestedShares'];

                continue;
            }

            $grantId = (string) $row['grantId'];
            $optionSharesByGrant[$grantId] = ($optionSharesByGrant[$grantId] ?? 0.0) + (float) $row['exercisableShares'];
        }

        $optionShares = array_sum($optionSharesByGrant);
        $exerciseCost = MoneyMath::sum(array_map(
            fn (string $grantId, float $shares): float => MoneyMath::multiply($this->strikeForGrant($job, $grantId), $shares),
            array_keys($optionSharesByGrant),
            array_values($optionSharesByGrant),
        ));

        return [
            'rsuShares' => round($rsuShares, 4),
            'optionShares' => round($optionShares, 4),
            'totalShares' => round($rsuShares + $optionShares, 4),
            'exerciseCost' => $exerciseCost,
            'optionSharesByGrant' => $optionSharesByGrant,
        ];
    }

    /**
     * @param  array<string, float>  $optionSharesByGrant
     * @return list<float>
     */
    private function optionIntrinsicValues(JobSpec $job, array $optionSharesByGrant, float $commonFmv): array
    {
        $values = [];
        foreach ($optionSharesByGrant as $grantId => $shares) {
            $intrinsicPerShare = max(0.0, MoneyMath::subtract($commonFmv, $this->strikeForGrant($job, $grantId)));
            $values[] = MoneyMath::multiply($intrinsicPerShare, $shares);
        }

        return $values;
    }

    private function strikeForGrant(JobSpec $job, string $grantId): float
    {
        foreach ($job->optionGrants() as $grant) {
            if ((string) ($grant['id'] ?? '') === $grantId) {
                return $this->number($grant['strike'] ?? null);
            }
        }

        return 0.0;
    }

    /**
     * @param  array<string, mixed>  $scenario
     */
    private function scenarioId(array $scenario, int $ordinal): string
    {
        $id = trim((string) ($scenario['id'] ?? ''));

        return $id !== '' ? $id : 'scenario-'.$ordinal;
    }

    /**
     * @param  array<string, mixed>  $scenario
     */
    private function scenarioLabel(array $scenario, int $ordinal): string
    {
        $label = trim((string) ($scenario['label'] ?? ''));

        return $label !== '' ? $label : 'Scenario '.$ordinal;
    }

    private function normalizeOutcome(string $outcome): string
    {
        return in_array($outcome, ['low', 'medium', 'high'], true) ? $outcome : 'medium';
    }

    private function number(mixed $value): float
    {
        return is_numeric($value) ? (float) $value : 0.0;
    }
}
