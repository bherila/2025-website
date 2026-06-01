<?php

namespace Tests\Unit\Services\ClientManagement;

use App\Enums\ClientManagement\BillingCadence;
use App\Enums\ClientManagement\FirstCycleProration;
use App\Models\ClientManagement\ClientAgreement;
use App\Services\ClientManagement\BillingCycleResolver;
use App\Services\ClientManagement\RetainerCalculator;
use Carbon\Carbon;
use Tests\TestCase;

class RetainerCalculatorTest extends TestCase
{
    public function test_cycle_retainer_uses_period_terms_when_available(): void
    {
        $agreement = $this->agreement([
            'billing_cadence' => BillingCadence::Quarterly->value,
            'retainer_hours' => 30,
            'retainer_fee' => 3000,
        ]);
        $cycle = (new BillingCycleResolver)->cycleContaining($agreement, Carbon::parse('2026-02-01'));

        $calculator = new RetainerCalculator;

        $this->assertSame(30.0, $calculator->cycleRetainerHours($agreement, $cycle, [
            'retainer_hours' => 12.0,
        ]));
        $this->assertSame(3000.0, $calculator->cycleRetainerFee($agreement, $cycle, [
            'retainer_multiplier' => 1.5,
        ]));
    }

    public function test_cycle_retainer_falls_back_to_monthly_ledger_terms(): void
    {
        $agreement = $this->agreement([
            'retainer_hours' => null,
            'retainer_fee' => null,
            'monthly_retainer_fee' => 1500,
        ]);
        $cycle = (new BillingCycleResolver)->cycleContaining($agreement, Carbon::parse('2026-01-15'));

        $calculator = new RetainerCalculator;

        $this->assertSame(12.5, $calculator->cycleRetainerHours($agreement, $cycle, [
            'retainer_hours' => 12.5,
        ]));
        $this->assertSame(3750.0, $calculator->cycleRetainerFee($agreement, $cycle, [
            'retainer_multiplier' => 2.5,
        ]));
    }

    public function test_cycle_period_multiplier_respects_termination_date(): void
    {
        $agreement = $this->agreement([
            'active_date' => '2026-02-01',
            'termination_date' => '2026-02-28',
            'billing_cadence' => BillingCadence::Quarterly->value,
            'retainer_hours' => 89,
        ]);
        $cycle = (new BillingCycleResolver)->cycleContaining($agreement, Carbon::parse('2026-02-15'));

        $calculator = new RetainerCalculator;

        $this->assertEqualsWithDelta(28 / 89, $calculator->cyclePeriodRetainerMultiplier($agreement, $cycle), 0.000001);
        $this->assertSame(28.0, $calculator->cyclePeriodRetainerHours($agreement, $cycle));
    }

    public function test_month_retainer_multiplier_prorates_partial_months(): void
    {
        $agreement = $this->agreement([
            'active_date' => '2026-01-16',
        ]);

        $multiplier = (new RetainerCalculator)->monthRetainerMultiplier(
            $agreement,
            Carbon::parse('2026-01-01'),
            Carbon::parse('2026-01-31'),
        );

        $this->assertSame(0.5161, $multiplier);
    }

    public function test_month_retainer_multiplier_honors_full_period_first_cycle(): void
    {
        $agreement = $this->agreement([
            'active_date' => '2026-01-16',
            'first_cycle_proration' => FirstCycleProration::FullPeriod,
        ]);

        $multiplier = (new RetainerCalculator)->monthRetainerMultiplier(
            $agreement,
            Carbon::parse('2026-01-01'),
            Carbon::parse('2026-01-31'),
        );

        $this->assertSame(1.0, $multiplier);
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function agreement(array $attributes = []): ClientAgreement
    {
        return new ClientAgreement(array_merge([
            'active_date' => '2026-01-01',
            'termination_date' => null,
            'billing_cadence' => BillingCadence::Monthly->value,
            'first_cycle_proration' => FirstCycleProration::ProrateHours,
            'retainer_hours' => null,
            'retainer_fee' => null,
            'monthly_retainer_fee' => 1000,
        ], $attributes));
    }
}
