<?php

namespace App\Services\Planning\CareerComp;

use App\Services\Finance\MoneyMath;
use DateTimeImmutable;

final class RsuVestingExpander
{
    /**
     * @return list<array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float}>
     */
    public function expand(JobSpec $job, int $startYear, int $horizonYears, ?DateTimeImmutable $vestingThrough = null): array
    {
        $rows = [];

        foreach ($job->rsuGrants() as $grant) {
            foreach ($this->sharesByYear($grant, $vestingThrough) as $year => $shares) {
                if (! $this->inHorizon($year, $startYear, $horizonYears)) {
                    continue;
                }

                $rows[] = [
                    'grantId' => (string) ($grant['id'] ?? 'rsu'),
                    'type' => 'rsu',
                    'year' => $year,
                    'vestedShares' => round($shares, 4),
                    'exercisableShares' => 0.0,
                ];
            }
        }

        return $rows;
    }

    /**
     * @param  array<string, mixed>  $grant
     * @return array<int, float>
     */
    private function sharesByYear(array $grant, ?DateTimeImmutable $vestingThrough): array
    {
        $grantDate = $this->date((string) ($grant['grantDate'] ?? ''));
        if (! $grantDate instanceof DateTimeImmutable) {
            return [];
        }

        $sharesByYear = [];
        foreach (VestingSchedule::vestingEventsForGrant(
            $this->grantShareCount($grant),
            $this->date((string) ($grant['vestingStartDate'] ?? '')) ?? $grantDate,
            $grant,
        ) as $event) {
            if ($vestingThrough instanceof DateTimeImmutable && $event['date'] > $vestingThrough) {
                continue;
            }

            $year = (int) $event['date']->format('Y');
            $sharesByYear[$year] = ($sharesByYear[$year] ?? 0.0) + $event['shares'];
        }

        ksort($sharesByYear);

        return $sharesByYear;
    }

    /** @param array<string, mixed> $grant */
    private function grantShareCount(array $grant): float
    {
        if (is_numeric($grant['shareCount'] ?? null) && (float) $grant['shareCount'] > 0.0) {
            return (float) $grant['shareCount'];
        }

        $grantValue = is_numeric($grant['grantValue'] ?? null) ? (float) $grant['grantValue'] : 0.0;
        $grantPrice = is_numeric($grant['grantPrice'] ?? null) ? (float) $grant['grantPrice'] : 0.0;
        if ($grantValue <= 0.0 || $grantPrice <= 0.0) {
            return 0.0;
        }

        return MoneyMath::divide($grantValue, $grantPrice);
    }

    private function date(string $date): ?DateTimeImmutable
    {
        if ($date === '') {
            return null;
        }

        $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $date);

        return $parsed instanceof DateTimeImmutable ? $parsed : null;
    }

    private function inHorizon(int $year, int $startYear, int $horizonYears): bool
    {
        return $year >= $startYear && $year < $startYear + $horizonYears;
    }
}
