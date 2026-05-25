<?php

namespace Tests\Unit\Services\ClientManagement;

use App\Enums\ClientManagement\BillingCadence;
use App\Enums\ClientManagement\FirstCycleProration;
use App\Models\ClientManagement\ClientAgreement;
use App\Services\ClientManagement\BillingCycleResolver;
use Carbon\Carbon;
use PHPUnit\Framework\TestCase;

/**
 * Unit tests for BillingCycleResolver.
 *
 * Covers:
 * - All three billing cadences (monthly, quarterly, annual)
 * - Calendar alignment of cycles
 * - Mid-cycle agreement starts under each FirstCycleProration policy
 * - Termination mid-cycle
 */
class BillingCycleResolverTest extends TestCase
{
    private BillingCycleResolver $resolver;

    protected function setUp(): void
    {
        parent::setUp();
        $this->resolver = new BillingCycleResolver;
    }

    // =========================================================================
    // BillingCadence helpers
    // =========================================================================

    public function test_monthly_cycle_start_returns_first_of_month(): void
    {
        $cadence = BillingCadence::Monthly;
        $this->assertEquals('2024-03-01', $cadence->cycleStart(Carbon::parse('2024-03-15'))->toDateString());
        $this->assertEquals('2024-03-01', $cadence->cycleStart(Carbon::parse('2024-03-01'))->toDateString());
        $this->assertEquals('2024-03-01', $cadence->cycleStart(Carbon::parse('2024-03-31'))->toDateString());
    }

    public function test_monthly_cycle_end_returns_last_of_month(): void
    {
        $cadence = BillingCadence::Monthly;
        $this->assertEquals('2024-02-29', $cadence->cycleEnd(Carbon::parse('2024-02-10'))->toDateString()); // leap year
        $this->assertEquals('2024-03-31', $cadence->cycleEnd(Carbon::parse('2024-03-01'))->toDateString());
    }

    public function test_quarterly_cycle_start_aligns_to_calendar_quarters(): void
    {
        $cadence = BillingCadence::Quarterly;
        $this->assertEquals('2024-01-01', $cadence->cycleStart(Carbon::parse('2024-01-15'))->toDateString()); // Q1
        $this->assertEquals('2024-01-01', $cadence->cycleStart(Carbon::parse('2024-03-31'))->toDateString()); // Q1 end
        $this->assertEquals('2024-04-01', $cadence->cycleStart(Carbon::parse('2024-04-01'))->toDateString()); // Q2 start
        $this->assertEquals('2024-04-01', $cadence->cycleStart(Carbon::parse('2024-05-20'))->toDateString()); // Q2 mid
        $this->assertEquals('2024-07-01', $cadence->cycleStart(Carbon::parse('2024-08-01'))->toDateString()); // Q3
        $this->assertEquals('2024-10-01', $cadence->cycleStart(Carbon::parse('2024-11-30'))->toDateString()); // Q4
    }

    public function test_quarterly_cycle_end_is_last_day_of_quarter(): void
    {
        $cadence = BillingCadence::Quarterly;
        $this->assertEquals('2024-03-31', $cadence->cycleEnd(Carbon::parse('2024-01-15'))->toDateString()); // Q1
        $this->assertEquals('2024-06-30', $cadence->cycleEnd(Carbon::parse('2024-04-01'))->toDateString()); // Q2
        $this->assertEquals('2024-09-30', $cadence->cycleEnd(Carbon::parse('2024-07-15'))->toDateString()); // Q3
        $this->assertEquals('2024-12-31', $cadence->cycleEnd(Carbon::parse('2024-10-01'))->toDateString()); // Q4
    }

    public function test_annual_cycle_start_is_jan_1(): void
    {
        $cadence = BillingCadence::Annual;
        $this->assertEquals('2024-01-01', $cadence->cycleStart(Carbon::parse('2024-06-15'))->toDateString());
        $this->assertEquals('2024-01-01', $cadence->cycleStart(Carbon::parse('2024-12-31'))->toDateString());
    }

    public function test_annual_cycle_end_is_dec_31(): void
    {
        $cadence = BillingCadence::Annual;
        $this->assertEquals('2024-12-31', $cadence->cycleEnd(Carbon::parse('2024-06-15'))->toDateString());
    }

    public function test_monthly_months_in_cycle(): void
    {
        $this->assertEquals(1, BillingCadence::Monthly->monthsInCycle());
        $this->assertEquals(3, BillingCadence::Quarterly->monthsInCycle());
        $this->assertEquals(12, BillingCadence::Annual->monthsInCycle());
    }

    public function test_cycle_starts_between_quarterly(): void
    {
        $cadence = BillingCadence::Quarterly;
        $starts = iterator_to_array($cadence->cycleStartsBetween(
            Carbon::parse('2024-01-01'),
            Carbon::parse('2024-12-31')
        ), false);

        $this->assertCount(4, $starts);
        $this->assertEquals('2024-01-01', $starts[0]->toDateString());
        $this->assertEquals('2024-04-01', $starts[1]->toDateString());
        $this->assertEquals('2024-07-01', $starts[2]->toDateString());
        $this->assertEquals('2024-10-01', $starts[3]->toDateString());
    }

    public function test_cycle_starts_between_excludes_containing_cycle_before_lower_bound(): void
    {
        $starts = iterator_to_array(BillingCadence::Quarterly->cycleStartsBetween(
            Carbon::parse('2024-02-15'),
            Carbon::parse('2024-12-31')
        ), false);

        $this->assertCount(3, $starts);
        $this->assertEquals('2024-04-01', $starts[0]->toDateString());
        $this->assertEquals('2024-07-01', $starts[1]->toDateString());
        $this->assertEquals('2024-10-01', $starts[2]->toDateString());
    }

    // =========================================================================
    // Monthly cadence cycles
    // =========================================================================

    public function test_monthly_cadence_generates_one_cycle_per_month(): void
    {
        $agreement = $this->makeAgreement(
            '2024-01-15',
            BillingCadence::Monthly,
            FirstCycleProration::ProrateHours
        );

        $cycles = iterator_to_array($this->resolver->cyclesForAgreement(
            $agreement,
            Carbon::parse('2024-03-31')), false);

        $this->assertCount(3, $cycles);
        $this->assertEquals('2024-01-15', $cycles[0]->start->toDateString());
        $this->assertEquals('2024-01-31', $cycles[0]->end->toDateString());
        $this->assertEquals('2024-02-01', $cycles[1]->start->toDateString());
        $this->assertEquals('2024-02-29', $cycles[1]->end->toDateString()); // leap year
        $this->assertEquals('2024-03-01', $cycles[2]->start->toDateString());
        $this->assertEquals('2024-03-31', $cycles[2]->end->toDateString());
    }

    // =========================================================================
    // Quarterly cadence + proration policies
    // =========================================================================

    public function test_quarterly_agreement_starting_on_cycle_boundary(): void
    {
        $agreement = $this->makeAgreement(
            '2024-01-01',
            BillingCadence::Quarterly,
            FirstCycleProration::ProrateHours
        );

        $cycles = iterator_to_array($this->resolver->cyclesForAgreement(
            $agreement,
            Carbon::parse('2024-06-30')), false);

        $this->assertCount(2, $cycles);
        $this->assertEquals('2024-01-01', $cycles[0]->start->toDateString());
        $this->assertEquals('2024-03-31', $cycles[0]->end->toDateString());
        $this->assertFalse($cycles[0]->isProrated);
        $this->assertEquals(3, $cycles[0]->monthCount);
        $this->assertEquals('2024-04-01', $cycles[1]->start->toDateString());
        $this->assertEquals('2024-06-30', $cycles[1]->end->toDateString());
    }

    public function test_quarterly_prorate_hours_mid_cycle_start(): void
    {
        $agreement = $this->makeAgreement(
            '2024-02-15',
            BillingCadence::Quarterly,
            FirstCycleProration::ProrateHours
        );

        $cycles = iterator_to_array($this->resolver->cyclesForAgreement(
            $agreement,
            Carbon::parse('2024-06-30')), false);

        // First cycle: Feb 15 – Mar 31 (prorated)
        $this->assertEquals('2024-02-15', $cycles[0]->start->toDateString());
        $this->assertEquals('2024-03-31', $cycles[0]->end->toDateString());
        $this->assertTrue($cycles[0]->isProrated);

        // Second cycle: Apr 1 – Jun 30 (full)
        $this->assertCount(2, $cycles);
        $this->assertEquals('2024-04-01', $cycles[1]->start->toDateString());
        $this->assertEquals('2024-06-30', $cycles[1]->end->toDateString());
        $this->assertFalse($cycles[1]->isProrated);
    }

    public function test_quarterly_full_period_mid_cycle_start_is_not_prorated(): void
    {
        $agreement = $this->makeAgreement(
            '2024-02-15',
            BillingCadence::Quarterly,
            FirstCycleProration::FullPeriod
        );

        $cycles = iterator_to_array($this->resolver->cyclesForAgreement(
            $agreement,
            Carbon::parse('2024-03-31')), false);

        $this->assertCount(1, $cycles);
        $this->assertEquals('2024-02-15', $cycles[0]->start->toDateString());
        $this->assertEquals('2024-03-31', $cycles[0]->end->toDateString());
        $this->assertFalse($cycles[0]->isProrated);
    }

    public function test_quarterly_align_next_cycle_emits_stub_then_full_cycles(): void
    {
        $agreement = $this->makeAgreement(
            '2024-02-15',
            BillingCadence::Quarterly,
            FirstCycleProration::AlignNextCycle
        );

        $cycles = iterator_to_array($this->resolver->cyclesForAgreement(
            $agreement,
            Carbon::parse('2024-09-30')), false);

        // Stub: Feb 15 – Mar 31
        $this->assertEquals('2024-02-15', $cycles[0]->start->toDateString());
        $this->assertEquals('2024-03-31', $cycles[0]->end->toDateString());
        $this->assertTrue($cycles[0]->isProrated);

        // Q2: Apr 1 – Jun 30
        $this->assertEquals('2024-04-01', $cycles[1]->start->toDateString());
        $this->assertEquals('2024-06-30', $cycles[1]->end->toDateString());

        // Q3: Jul 1 – Sep 30
        $this->assertEquals('2024-07-01', $cycles[2]->start->toDateString());
        $this->assertEquals('2024-09-30', $cycles[2]->end->toDateString());
    }

    public function test_quarterly_termination_mid_cycle_clips_last_cycle(): void
    {
        $agreement = $this->makeAgreement(
            '2024-01-01',
            BillingCadence::Quarterly,
            FirstCycleProration::ProrateHours,
            '2024-05-15'
        );

        $cycles = iterator_to_array($this->resolver->cyclesForAgreement(
            $agreement,
            Carbon::parse('2024-12-31')), false);

        $this->assertCount(2, $cycles);

        // First full cycle
        $this->assertEquals('2024-01-01', $cycles[0]->start->toDateString());
        $this->assertEquals('2024-03-31', $cycles[0]->end->toDateString());
        $this->assertFalse($cycles[0]->isProrated);

        // Second cycle clipped at termination
        $this->assertEquals('2024-04-01', $cycles[1]->start->toDateString());
        $this->assertEquals('2024-05-15', $cycles[1]->end->toDateString());
        $this->assertTrue($cycles[1]->isProrated);
    }

    // =========================================================================
    // Annual cadence
    // =========================================================================

    public function test_annual_agreement_starting_on_jan_1(): void
    {
        $agreement = $this->makeAgreement(
            '2024-01-01',
            BillingCadence::Annual,
            FirstCycleProration::ProrateHours
        );

        $cycles = iterator_to_array($this->resolver->cyclesForAgreement(
            $agreement,
            Carbon::parse('2025-12-31')), false);

        $this->assertCount(2, $cycles);
        $this->assertEquals('2024-01-01', $cycles[0]->start->toDateString());
        $this->assertEquals('2024-12-31', $cycles[0]->end->toDateString());
        $this->assertFalse($cycles[0]->isProrated);
        $this->assertEquals(12, $cycles[0]->monthCount);

        $this->assertEquals('2025-01-01', $cycles[1]->start->toDateString());
        $this->assertEquals('2025-12-31', $cycles[1]->end->toDateString());
    }

    public function test_annual_mid_year_start_prorate_hours(): void
    {
        $agreement = $this->makeAgreement(
            '2024-07-01',
            BillingCadence::Annual,
            FirstCycleProration::ProrateHours
        );

        $cycles = iterator_to_array($this->resolver->cyclesForAgreement(
            $agreement,
            Carbon::parse('2024-12-31')), false);

        $this->assertCount(1, $cycles);
        $this->assertEquals('2024-07-01', $cycles[0]->start->toDateString());
        $this->assertEquals('2024-12-31', $cycles[0]->end->toDateString());
        $this->assertTrue($cycles[0]->isProrated);
        $this->assertEquals(6, $cycles[0]->monthCount);
    }

    public function test_cycle_containing_delegates_to_cadence(): void
    {
        $agreement = $this->makeAgreement(
            '2024-01-01',
            BillingCadence::Quarterly,
            FirstCycleProration::ProrateHours
        );

        $cycle = $this->resolver->cycleContaining($agreement, Carbon::parse('2024-05-15'));

        $this->assertEquals('2024-04-01', $cycle->start->toDateString());
        $this->assertEquals('2024-06-30', $cycle->end->toDateString());
    }

    // =========================================================================
    // Semi-annual cadence
    // =========================================================================

    public function test_semi_annual_mid_year_start_multi_cycle(): void
    {
        $agreement = $this->makeAgreement(
            '2024-03-01',
            BillingCadence::SemiAnnual,
            FirstCycleProration::ProrateHours
        );

        $cycles = iterator_to_array($this->resolver->cyclesForAgreement(
            $agreement,
            Carbon::parse('2025-06-30')), false);

        // First cycle: Mar 1 – Aug 31 (6 months from active_date)
        $this->assertEquals('2024-03-01', $cycles[0]->start->toDateString());
        $this->assertEquals('2024-08-31', $cycles[0]->end->toDateString());

        // Second cycle: Sep 1 – Feb 28
        $this->assertEquals('2024-09-01', $cycles[1]->start->toDateString());
        $this->assertEquals('2025-02-28', $cycles[1]->end->toDateString());

        // Third cycle: Mar 1 – Jun 30 (clipped)
        $this->assertEquals('2025-03-01', $cycles[2]->start->toDateString());
        $this->assertEquals('2025-06-30', $cycles[2]->end->toDateString());
        $this->assertTrue($cycles[2]->isProrated);

        $this->assertCount(3, $cycles);
    }

    public function test_semi_annual_with_termination(): void
    {
        $agreement = $this->makeAgreement(
            '2024-01-01',
            BillingCadence::SemiAnnual,
            FirstCycleProration::ProrateHours,
            '2024-09-15'
        );

        $cycles = iterator_to_array($this->resolver->cyclesForAgreement(
            $agreement,
            Carbon::parse('2025-12-31')), false);

        $this->assertCount(2, $cycles);
        $this->assertEquals('2024-01-01', $cycles[0]->start->toDateString());
        $this->assertEquals('2024-06-30', $cycles[0]->end->toDateString());
        $this->assertFalse($cycles[0]->isProrated);

        // Second cycle clipped at termination
        $this->assertEquals('2024-07-01', $cycles[1]->start->toDateString());
        $this->assertEquals('2024-09-15', $cycles[1]->end->toDateString());
        $this->assertTrue($cycles[1]->isProrated);
    }

    public function test_semi_annual_cycle_containing_cycle_1(): void
    {
        $agreement = $this->makeAgreement(
            '2024-01-01',
            BillingCadence::SemiAnnual,
            FirstCycleProration::ProrateHours
        );

        $cycle = $this->resolver->cycleContaining($agreement, Carbon::parse('2024-03-15'));
        $this->assertEquals('2024-01-01', $cycle->start->toDateString());
        $this->assertEquals('2024-06-30', $cycle->end->toDateString());
    }

    public function test_semi_annual_cycle_containing_cycle_2(): void
    {
        $agreement = $this->makeAgreement(
            '2024-01-01',
            BillingCadence::SemiAnnual,
            FirstCycleProration::ProrateHours
        );

        $cycle = $this->resolver->cycleContaining($agreement, Carbon::parse('2024-09-15'));
        $this->assertEquals('2024-07-01', $cycle->start->toDateString());
        $this->assertEquals('2024-12-31', $cycle->end->toDateString());
    }

    public function test_semi_annual_cycle_containing_on_boundary(): void
    {
        $agreement = $this->makeAgreement(
            '2024-01-01',
            BillingCadence::SemiAnnual,
            FirstCycleProration::ProrateHours
        );

        $cycle = $this->resolver->cycleContaining($agreement, Carbon::parse('2024-07-01'));
        $this->assertEquals('2024-07-01', $cycle->start->toDateString());
        $this->assertEquals('2024-12-31', $cycle->end->toDateString());
    }

    public function test_semi_annual_cycle_containing_throws_for_date_before_active(): void
    {
        $agreement = $this->makeAgreement(
            '2024-07-01',
            BillingCadence::SemiAnnual,
            FirstCycleProration::ProrateHours
        );

        $this->expectException(\InvalidArgumentException::class);
        $this->resolver->cycleContaining($agreement, Carbon::parse('2024-01-15'));
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Build a stub ClientAgreement without touching the database.
     */
    private function makeAgreement(
        string $activeDate,
        BillingCadence $cadence,
        FirstCycleProration $proration,
        ?string $terminationDate = null
    ): ClientAgreement {
        $agreement = new ClientAgreement;
        $agreement->setRawAttributes([
            'active_date' => $activeDate,
            'billing_cadence' => $cadence->value,
            'first_cycle_proration' => $proration->value,
            'termination_date' => $terminationDate,
            'monthly_retainer_hours' => 10,
            'catch_up_threshold_hours' => 1,
            'rollover_months' => 1,
            'hourly_rate' => 100,
            'monthly_retainer_fee' => 1000,
        ]);
        // Force cast resolution without DB
        $agreement->syncOriginal();

        return $agreement;
    }
}
