<?php

namespace App\Services\Planning\CareerComp;

use DateTimeImmutable;

/**
 * Shared time-based vesting schedule for RSU and option grants.
 *
 * Shares accrue linearly (shareCount / vestingMonths per month) and are released
 * on vest events. A vest event occurs at the cliff, then on the chosen cadence
 * (monthly / quarterly / annual) thereafter, with any remainder released in the
 * final month so the full grant always vests.
 *
 * The 'monthly' cadence reproduces the historical per-month release exactly
 * (each release is monthlyShares * monthsAccrued, never repeated addition), so
 * the frozen v1 projection contract and golden fixture stay byte-identical.
 */
final class VestingSchedule
{
    public const FREQUENCIES = ['monthly', 'quarterly', 'annual'];

    public static function normalizeFrequency(mixed $frequency): string
    {
        $value = is_string($frequency) ? strtolower(trim($frequency)) : '';

        return in_array($value, self::FREQUENCIES, true) ? $value : 'monthly';
    }

    public static function frequencyMonths(string $frequency): int
    {
        return match (self::normalizeFrequency($frequency)) {
            'quarterly' => 3,
            'annual' => 12,
            default => 1,
        };
    }

    /**
     * @return array<int, float> calendar year => shares vesting that year
     */
    public static function sharesByYear(
        float $shareCount,
        DateTimeImmutable $grantDate,
        int $vestingMonths,
        int $cliffMonths,
        string $frequency,
    ): array {
        if ($shareCount <= 0.0 || $vestingMonths <= 0 || $cliffMonths > $vestingMonths) {
            return [];
        }

        $frequencyMonths = self::frequencyMonths($frequency);
        $monthlyShares = $shareCount / $vestingMonths;
        $sharesByYear = [];
        $monthsAccrued = 0;

        for ($month = 1; $month <= $vestingMonths; $month++) {
            $monthsAccrued++;

            if ($month < $cliffMonths) {
                continue;
            }

            $isVestEvent = ($cliffMonths > 0 && $month === $cliffMonths)
                || ($month > $cliffMonths && ($month - $cliffMonths) % $frequencyMonths === 0)
                || $month === $vestingMonths;

            if (! $isVestEvent) {
                continue;
            }

            $year = (int) $grantDate->modify('+'.$month.' months')->format('Y');
            $sharesByYear[$year] = ($sharesByYear[$year] ?? 0.0) + $monthlyShares * $monthsAccrued;
            $monthsAccrued = 0;
        }

        return $sharesByYear;
    }
}
