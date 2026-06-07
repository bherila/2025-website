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

    public const SCHEDULE_TYPES = ['linear', 'tranches'];

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
     * @param  array<string, mixed>  $grant
     * @return array<int, float> calendar year => shares vesting that year
     */
    public static function sharesByYearForGrant(
        float $shareCount,
        DateTimeImmutable $vestingStartDate,
        array $grant,
    ): array {
        $schedule = is_array($grant['vestingSchedule'] ?? null) ? $grant['vestingSchedule'] : null;

        if (($schedule['type'] ?? null) === 'tranches') {
            return self::trancheSharesByYear(
                $shareCount,
                $vestingStartDate,
                is_array($schedule['tranches'] ?? null) ? $schedule['tranches'] : [],
            );
        }

        return self::sharesByYear(
            $shareCount,
            $vestingStartDate,
            self::vestingMonths($grant, $schedule),
            self::cliffMonths($grant, $schedule),
            self::frequency($grant, $schedule),
        );
    }

    /**
     * @param  list<array<string, mixed>>  $tranches
     * @return array<int, float> calendar year => shares vesting that year
     */
    public static function trancheSharesByYear(float $shareCount, DateTimeImmutable $vestingStartDate, array $tranches): array
    {
        if ($shareCount <= 0.0 || $tranches === []) {
            return [];
        }

        $sharesByYear = [];

        foreach ($tranches as $tranche) {
            $month = max(0, (int) round((float) ($tranche['month'] ?? 0)));
            $percent = is_numeric($tranche['percent'] ?? null) ? (float) $tranche['percent'] : 0.0;

            if ($percent <= 0.0) {
                continue;
            }

            $year = (int) $vestingStartDate->modify('+'.$month.' months')->format('Y');
            $sharesByYear[$year] = ($sharesByYear[$year] ?? 0.0) + ($shareCount * ($percent / 100.0));
        }

        ksort($sharesByYear);

        return $sharesByYear;
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

    /**
     * @param  array<string, mixed>  $grant
     * @param  array<string, mixed>|null  $schedule
     */
    private static function vestingMonths(array $grant, ?array $schedule): int
    {
        if (is_numeric($schedule['durationMonths'] ?? null)) {
            return max(0, (int) round((float) $schedule['durationMonths']));
        }

        return max(0, (int) round((float) ($grant['vestingYears'] ?? 0) * 12));
    }

    /**
     * @param  array<string, mixed>  $grant
     * @param  array<string, mixed>|null  $schedule
     */
    private static function cliffMonths(array $grant, ?array $schedule): int
    {
        if (is_numeric($schedule['cliffMonths'] ?? null)) {
            return max(0, (int) round((float) $schedule['cliffMonths']));
        }

        return max(0, (int) round((float) ($grant['cliffMonths'] ?? 0)));
    }

    /**
     * @param  array<string, mixed>  $grant
     * @param  array<string, mixed>|null  $schedule
     */
    private static function frequency(array $grant, ?array $schedule): string
    {
        return self::normalizeFrequency($schedule['frequency'] ?? $grant['vestingFrequency'] ?? null);
    }
}
