<?php

namespace App\Services\Planning\OpportunityCost;

use App\Services\Finance\MoneyMath;
use DateTimeImmutable;

final class EquityValuationService
{
    /**
     * @param  list<array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float}>  $vestingRows
     * @return array{annualEquity:array<int, float>,liquidity:array{low:list<array{year:int,cumulativeValue:float}>,medium:list<array{year:int,cumulativeValue:float}>,high:list<array{year:int,cumulativeValue:float}>},totals:array{low:float,medium:float,high:float}}
     */
    public function value(JobSpec $job, array $vestingRows, int $startYear, int $horizonYears): array
    {
        $annualEquity = [];
        $liquidity = ['low' => [], 'medium' => [], 'high' => []];
        $totals = ['low' => 0.0, 'medium' => 0.0, 'high' => 0.0];
        $cumulativeShares = [];

        for ($offset = 0; $offset < $horizonYears; $offset++) {
            $year = $startYear + $offset;
            $vestedSharesThisYear = $this->vestedSharesForYear($vestingRows, $year);
            $annualEquity[$year] = $this->liquidValueForShares($job, $vestedSharesThisYear, $offset, $year, 'medium');

            foreach (['low', 'medium', 'high'] as $band) {
                $cumulativeShares[$band] = ($cumulativeShares[$band] ?? 0.0) + $vestedSharesThisYear;
                $cumulativeValue = $this->liquidValueForShares($job, $cumulativeShares[$band], $offset, $year, $band);
                $liquidity[$band][] = ['year' => $year, 'cumulativeValue' => $cumulativeValue];
                $totals[$band] = MoneyMath::add($totals[$band], $this->liquidValueForShares($job, $vestedSharesThisYear, $offset, $year, $band));
            }
        }

        return ['annualEquity' => $annualEquity, 'liquidity' => $liquidity, 'totals' => $totals];
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

        return MoneyMath::multiply($shares, $price);
    }

    public function sharePrice(JobSpec $job, int $yearOffset, string $band): float
    {
        $basePrice = $job->isPrivate() ? $job->number('company.fourNineA') : $job->number('company.currentSharePrice');
        $growthPct = match ($band) {
            'low' => $job->number('growthBands.lowPct'),
            'high' => $job->number('growthBands.highPct'),
            default => $job->number('growthBands.mediumPct'),
        };
        $growthPrice = MoneyMath::multiply($basePrice, (1.0 + ($growthPct / 100.0)) ** $yearOffset);

        if (! $job->isPrivate()) {
            return $growthPrice;
        }

        $dilutionPct = max(0.0, $job->number('company.annualDilutionPct'));
        $dilutionFactor = (1.0 - ($dilutionPct / 100.0)) ** $yearOffset;

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
