<?php

namespace Tests\Unit\CareerComp;

use App\Services\Planning\CareerComp\VestingSchedule;
use DateTimeImmutable;
use PHPUnit\Framework\TestCase;

class VestingScheduleTest extends TestCase
{
    public function test_monthly_cadence_reproduces_per_month_release_with_cliff(): void
    {
        $byYear = VestingSchedule::sharesByYear(480.0, $this->date('2026-01-01'), 48, 12, 'monthly');

        // 12-month cliff lumps the first year of accrual, then one month per release thereafter.
        $this->assertSame([2027 => 230.0, 2028 => 120.0, 2029 => 120.0, 2030 => 10.0], $byYear);
        $this->assertEqualsWithDelta(480.0, array_sum($byYear), 0.0001);
    }

    public function test_quarterly_cadence_releases_every_three_months(): void
    {
        $byYear = VestingSchedule::sharesByYear(1200.0, $this->date('2026-01-01'), 12, 0, 'quarterly');

        $this->assertSame([2026 => 900.0, 2027 => 300.0], $byYear);
        $this->assertEqualsWithDelta(1200.0, array_sum($byYear), 0.0001);
    }

    public function test_annual_cadence_releases_once_per_year(): void
    {
        $byYear = VestingSchedule::sharesByYear(1200.0, $this->date('2026-01-01'), 24, 0, 'annual');

        $this->assertSame([2027 => 600.0, 2028 => 600.0], $byYear);
        $this->assertEqualsWithDelta(1200.0, array_sum($byYear), 0.0001);
    }

    public function test_final_month_releases_remainder_when_not_cadence_aligned(): void
    {
        // 14-month vest, quarterly, no cliff: events at 3, 6, 9, 12, then the 13th/14th remainder at month 14.
        $byYear = VestingSchedule::sharesByYear(1400.0, $this->date('2026-01-01'), 14, 0, 'quarterly');

        $this->assertEqualsWithDelta(1400.0, array_sum($byYear), 0.0001);
    }

    public function test_unknown_frequency_normalizes_to_monthly(): void
    {
        $this->assertSame('monthly', VestingSchedule::normalizeFrequency(null));
        $this->assertSame('monthly', VestingSchedule::normalizeFrequency('weekly'));
        $this->assertSame('quarterly', VestingSchedule::normalizeFrequency('QUARTERLY'));
        $this->assertSame(1, VestingSchedule::frequencyMonths('monthly'));
        $this->assertSame(3, VestingSchedule::frequencyMonths('quarterly'));
        $this->assertSame(12, VestingSchedule::frequencyMonths('annual'));
    }

    public function test_invalid_schedule_inputs_yield_no_vesting(): void
    {
        $this->assertSame([], VestingSchedule::sharesByYear(0.0, $this->date('2026-01-01'), 12, 0, 'monthly'));
        $this->assertSame([], VestingSchedule::sharesByYear(100.0, $this->date('2026-01-01'), 0, 0, 'monthly'));
        $this->assertSame([], VestingSchedule::sharesByYear(100.0, $this->date('2026-01-01'), 12, 24, 'monthly'));
    }

    private function date(string $value): DateTimeImmutable
    {
        return DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    }
}
