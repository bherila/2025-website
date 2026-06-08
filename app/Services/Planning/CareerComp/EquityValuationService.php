<?php

namespace App\Services\Planning\CareerComp;

use App\Services\Finance\MoneyMath;
use DateTimeImmutable;

final class EquityValuationService
{
    /**
     * @param  list<array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float}>  $vestingRows
     * @param  list<array{grantId:string,grantYearOffset:int,grantYear:int,value:float,vestingMonths:int,cliffMonths:int,frequency:string}>  $refresherDefs
     * @return array{annualEquity:array<int, float>,liquidity:array{low:list<array{year:int,cumulativeValue:float}>,medium:list<array{year:int,cumulativeValue:float}>,high:list<array{year:int,cumulativeValue:float}>},totals:array{low:float,medium:float,high:float},refresherRows:list<array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float,source:string}>}
     */
    public function value(JobSpec $job, array $vestingRows, array $refresherDefs, int $startYear, int $horizonYears, ?DateTimeImmutable $vestingThrough = null): array
    {
        // Refresher share counts are band-specific: the same dollar grant buys more shares at a
        // lower projected price, so each band gets its own vesting series.
        $refresherVestedByBand = $this->refresherVestedSharesByBand($job, $refresherDefs, $startYear, $horizonYears, $vestingThrough);

        $annualEquity = [];
        $liquidity = ['low' => [], 'medium' => [], 'high' => []];
        $totals = ['low' => 0.0, 'medium' => 0.0, 'high' => 0.0];

        foreach (['low', 'medium', 'high'] as $band) {
            $cumulativeShares = 0.0;
            $privateSharesAwaitingLiquidity = 0.0;

            for ($offset = 0; $offset < $horizonYears; $offset++) {
                $year = $startYear + $offset;
                $vestedSharesThisYear = $this->vestedSharesForYear($vestingRows, $year) + ($refresherVestedByBand[$band][$year] ?? 0.0);
                $realizedSharesThisYear = $vestedSharesThisYear;
                if ($job->isPrivate()) {
                    $privateSharesAwaitingLiquidity += $vestedSharesThisYear;
                    $realizedSharesThisYear = 0.0;
                    if ($this->isLiquid($job, $year)) {
                        $realizedSharesThisYear = $privateSharesAwaitingLiquidity;
                        $privateSharesAwaitingLiquidity = 0.0;
                    }
                }

                $cumulativeShares += $vestedSharesThisYear;
                $liquidity[$band][] = ['year' => $year, 'cumulativeValue' => $this->liquidValueForShares($job, $cumulativeShares, $offset, $year, $band)];
                $totals[$band] = MoneyMath::add($totals[$band], $this->liquidValueForShares($job, $realizedSharesThisYear, $offset, $year, $band));

                if ($band === 'medium') {
                    $annualEquity[$year] = $this->liquidValueForShares($job, $realizedSharesThisYear, $offset, $year, 'medium');
                }
            }
        }

        return [
            'annualEquity' => $annualEquity,
            'liquidity' => $liquidity,
            'totals' => $totals,
            // Representative (medium-band) refresher rows for the vesting breakdown + after-tax facts.
            'refresherRows' => $this->refresherRows($job, $refresherDefs, 'medium', $startYear, $horizonYears, $vestingThrough),
        ];
    }

    /**
     * @param  list<array{grantId:string,grantYearOffset:int,grantYear:int,value:float,vestingMonths:int,cliffMonths:int,frequency:string}>  $refresherDefs
     * @return array{low:array<int, float>,medium:array<int, float>,high:array<int, float>}
     */
    private function refresherVestedSharesByBand(JobSpec $job, array $refresherDefs, int $startYear, int $horizonYears, ?DateTimeImmutable $vestingThrough): array
    {
        $byBand = ['low' => [], 'medium' => [], 'high' => []];

        foreach (['low', 'medium', 'high'] as $band) {
            foreach ($this->refresherRows($job, $refresherDefs, $band, $startYear, $horizonYears, $vestingThrough) as $row) {
                $byBand[$band][$row['year']] = ($byBand[$band][$row['year']] ?? 0.0) + $row['vestedShares'];
            }
        }

        return $byBand;
    }

    /**
     * @param  list<array{grantId:string,grantYearOffset:int,grantYear:int,value:float,vestingMonths:int,cliffMonths:int,frequency:string}>  $refresherDefs
     * @return list<array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float,source:string}>
     */
    private function refresherRows(JobSpec $job, array $refresherDefs, string $band, int $startYear, int $horizonYears, ?DateTimeImmutable $vestingThrough): array
    {
        $rowsByGrantYear = [];

        foreach ($refresherDefs as $def) {
            $price = $this->sharePrice($job, $def['grantYearOffset'], $band);
            if ($price <= 0.0) {
                continue;
            }

            $shares = MoneyMath::divide($def['value'], $price);
            $grantDate = DateTimeImmutable::createFromFormat('!Y-m-d', sprintf('%04d-01-01', $def['grantYear']));
            if (! $grantDate instanceof DateTimeImmutable) {
                continue;
            }

            $vestingGrant = [
                'vestingYears' => $def['vestingMonths'] / 12,
                'vestingFrequency' => $def['frequency'],
                'cliffMonths' => $def['cliffMonths'],
            ];
            foreach (VestingSchedule::vestingEventsForGrant($shares, $grantDate, $vestingGrant) as $event) {
                if ($vestingThrough instanceof DateTimeImmutable && $event['date'] > $vestingThrough) {
                    continue;
                }

                $year = (int) $event['date']->format('Y');
                if ($year < $startYear || $year >= $startYear + $horizonYears) {
                    continue;
                }

                $key = $def['grantId'].'|'.$year;
                $rowsByGrantYear[$key] = MoneyMath::add((float) ($rowsByGrantYear[$key] ?? 0.0), $event['shares']);
            }
        }

        $rows = [];
        foreach ($rowsByGrantYear as $key => $vestedShares) {
            [$grantId, $year] = explode('|', (string) $key, 2);
            $rows[] = [
                'grantId' => $grantId,
                'type' => 'rsu',
                'year' => (int) $year,
                'vestedShares' => round($vestedShares, 4),
                'exercisableShares' => 0.0,
                'source' => 'projected_refresher',
            ];
        }

        usort($rows, fn (array $left, array $right): int => [$left['year'], $left['grantId']] <=> [$right['year'], $right['grantId']]);

        return $rows;
    }

    /**
     * @param  list<array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float}>  $vestingRows
     */
    private function vestedSharesForYear(array $vestingRows, int $year): float
    {
        $shares = 0.0;
        foreach ($vestingRows as $row) {
            if ((int) $row['year'] === $year) {
                $shares += (float) $row['vestedShares'];
            }
        }

        return $shares;
    }

    private function liquidValueForShares(JobSpec $job, float $shares, int $yearOffset, int $year, string $band): float
    {
        if ($shares <= 0.0) {
            return 0.0;
        }

        if ($job->isPrivate() && ! $this->isLiquid($job, $year)) {
            return 0.0;
        }

        $price = $this->sharePrice($job, $yearOffset, $band);

        return MoneyMath::multiply($price, $shares);
    }

    public function sharePrice(JobSpec $job, int $yearOffset, string $band): float
    {
        $basePrice = $job->number('company.currentSharePrice');
        if ($job->isPrivate() && $basePrice <= 0.0) {
            $basePrice = $job->number('company.fourNineA');
        }

        $growthPct = match ($band) {
            'low' => $job->number('growthBands.lowPct'),
            'high' => $job->number('growthBands.highPct'),
            default => $job->number('growthBands.mediumPct'),
        };
        $growthFactor = round((1.0 + ($growthPct / 100.0)) ** $yearOffset, 8);
        $growthPrice = MoneyMath::multiply($basePrice, $growthFactor);

        if (! $job->isPrivate()) {
            return $growthPrice;
        }

        $dilutionPct = max(0.0, $job->number('company.annualDilutionPct'));
        $dilutionFactor = round((1.0 - ($dilutionPct / 100.0)) ** $yearOffset, 8);

        return MoneyMath::multiply($growthPrice, $dilutionFactor);
    }

    private function isLiquid(JobSpec $job, int $year): bool
    {
        $liquidityDate = $job->value('company.liquidityDate');
        if (! is_string($liquidityDate) || $liquidityDate === '') {
            return false;
        }

        $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $liquidityDate);
        if (! $parsed instanceof DateTimeImmutable) {
            return false;
        }

        return (int) $parsed->format('Y') <= $year;
    }
}
