<?php

namespace Tests\Unit\Models\ClientManagement;

use App\Enums\ClientManagement\BillingCadence;
use App\Models\ClientManagement\ClientAgreement;
use PHPUnit\Framework\TestCase;

class ClientAgreementRetainerTest extends TestCase
{
    public function test_period_retainer_fee_uses_override_when_set(): void
    {
        $agreement = $this->makeAgreement('semi_annual', 1000, null, 12000);

        $this->assertEquals(12000.0, $agreement->periodRetainerFee());
    }

    public function test_period_retainer_fee_falls_back_to_monthly_times_cycle(): void
    {
        $agreement = $this->makeAgreement('semi_annual', 1000, null, null);

        // 1000 * 6 months = 6000
        $this->assertEquals(6000.0, $agreement->periodRetainerFee());
    }

    public function test_period_retainer_fee_monthly_returns_monthly_fee(): void
    {
        $agreement = $this->makeAgreement('monthly', 2000, null, null);

        // 2000 * 1 month = 2000
        $this->assertEquals(2000.0, $agreement->periodRetainerFee());
    }

    public function test_period_retainer_hours_uses_override_when_set(): void
    {
        $agreement = $this->makeAgreement('quarterly', 1000, 40, null, 240);

        $this->assertEquals(240.0, $agreement->periodRetainerHours());
    }

    public function test_period_retainer_hours_falls_back_to_monthly_times_cycle(): void
    {
        $agreement = $this->makeAgreement('quarterly', 1000, 40, null, null);

        // 40 * 3 months = 120
        $this->assertEquals(120.0, $agreement->periodRetainerHours());
    }

    public function test_period_retainer_hours_monthly_returns_monthly_hours(): void
    {
        $agreement = $this->makeAgreement('monthly', 1000, 40, null, null);

        // 40 * 1 = 40
        $this->assertEquals(40.0, $agreement->periodRetainerHours());
    }

    private function makeAgreement(
        string $cadence,
        float $monthlyFee,
        ?float $monthlyHours = 10,
        ?float $retainerFee = null,
        ?float $retainerHours = null,
    ): ClientAgreement {
        $agreement = new ClientAgreement;
        $agreement->setRawAttributes([
            'billing_cadence' => $cadence,
            'monthly_retainer_fee' => $monthlyFee,
            'monthly_retainer_hours' => $monthlyHours ?? 10,
            'retainer_fee' => $retainerFee,
            'retainer_hours' => $retainerHours,
            'active_date' => '2024-01-01',
            'catch_up_threshold_hours' => 1,
            'rollover_months' => 1,
            'hourly_rate' => 100,
        ]);
        $agreement->syncOriginal();

        return $agreement;
    }
}
