<?php

namespace Tests\Feature\ClientManagement;

use App\Enums\ClientManagement\BillingCadence;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\User;
use Carbon\Carbon;
use Tests\TestCase;

class ClientAgreementApiControllerTest extends TestCase
{
    private User $admin;

    private ClientCompany $company;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = $this->createAdminUser();
        $this->company = ClientCompany::factory()->create([
            'company_name' => 'Retainer Co',
            'slug' => 'retainer-co',
        ]);
    }

    public function test_monthly_agreement_rejects_setting_retainer_fee(): void
    {
        $agreement = $this->makeAgreement(BillingCadence::Monthly, retainerFee: null, retainerHours: null);

        $this->actingAs($this->admin)
            ->putJson($this->updateUrl($agreement), [
                'retainer_fee' => 6000,
            ])
            ->assertStatus(422)
            ->assertJsonPath('error', 'Monthly agreements cannot set retainer_fee or retainer_hours.');
    }

    public function test_transitioning_to_monthly_clears_stale_period_retainer_overrides(): void
    {
        $agreement = $this->makeAgreement(
            BillingCadence::SemiAnnual,
            retainerFee: 12000,
            retainerHours: 240,
        );

        $this->actingAs($this->admin)
            ->putJson($this->updateUrl($agreement), [
                'billing_cadence' => BillingCadence::Monthly->value,
            ])
            ->assertOk();

        $agreement->refresh();
        $this->assertNull($agreement->retainer_fee, 'retainer_fee must be cleared on monthly transition');
        $this->assertNull($agreement->retainer_hours, 'retainer_hours must be cleared on monthly transition');
        $this->assertSame(BillingCadence::Monthly, $agreement->billing_cadence);
    }

    public function test_request_with_both_retainer_fee_and_monthly_retainer_fee_is_rejected(): void
    {
        $agreement = $this->makeAgreement(BillingCadence::SemiAnnual);

        $this->actingAs($this->admin)
            ->putJson($this->updateUrl($agreement), [
                'retainer_fee' => 6000,
                'monthly_retainer_fee' => 1000,
            ])
            ->assertStatus(422)
            ->assertJsonPath('error', 'Send either retainer_fee or monthly_retainer_fee in a single request, not both.');
    }

    public function test_request_with_both_retainer_hours_and_monthly_retainer_hours_is_rejected(): void
    {
        $agreement = $this->makeAgreement(BillingCadence::SemiAnnual);

        $this->actingAs($this->admin)
            ->putJson($this->updateUrl($agreement), [
                'retainer_hours' => 240,
                'monthly_retainer_hours' => 40,
            ])
            ->assertStatus(422)
            ->assertJsonPath('error', 'Send either retainer_hours or monthly_retainer_hours in a single request, not both.');
    }

    public function test_request_with_only_retainer_fee_is_accepted_on_non_monthly_cadence(): void
    {
        $agreement = $this->makeAgreement(BillingCadence::SemiAnnual);

        $this->actingAs($this->admin)
            ->putJson($this->updateUrl($agreement), [
                'retainer_fee' => 6000,
            ])
            ->assertOk();

        $this->assertEquals(6000, (float) $agreement->fresh()->retainer_fee);
    }

    public function test_catch_up_threshold_uses_existing_period_retainer_hours(): void
    {
        $agreement = $this->makeAgreement(
            BillingCadence::SemiAnnual,
            retainerFee: 262.50,
            retainerHours: 1,
            monthlyRetainerHours: 0,
        );

        $this->actingAs($this->admin)
            ->putJson($this->updateUrl($agreement), [
                'catch_up_threshold_hours' => 1,
            ])
            ->assertOk();

        $this->assertEquals(1, (float) $agreement->fresh()->catch_up_threshold_hours);
    }

    public function test_catch_up_threshold_uses_requested_period_retainer_hours(): void
    {
        $agreement = $this->makeAgreement(
            BillingCadence::SemiAnnual,
            retainerFee: 262.50,
            retainerHours: null,
            monthlyRetainerHours: 0,
            catchUpThresholdHours: 0,
        );

        $this->actingAs($this->admin)
            ->putJson($this->updateUrl($agreement), [
                'retainer_hours' => 1,
                'catch_up_threshold_hours' => 1,
            ])
            ->assertOk();

        $agreement->refresh();
        $this->assertEquals(1, (float) $agreement->retainer_hours);
        $this->assertEquals(1, (float) $agreement->catch_up_threshold_hours);
    }

    private function makeAgreement(
        BillingCadence $cadence,
        ?float $retainerFee = null,
        ?float $retainerHours = null,
        float $monthlyRetainerHours = 10,
        float $catchUpThresholdHours = 1,
    ): ClientAgreement {
        return ClientAgreement::factory()->for($this->company)->create([
            'active_date' => Carbon::parse('2026-01-01'),
            'monthly_retainer_hours' => $monthlyRetainerHours,
            'monthly_retainer_fee' => 1000,
            'hourly_rate' => 150,
            'rollover_months' => 3,
            'catch_up_threshold_hours' => $catchUpThresholdHours,
            'billing_cadence' => $cadence->value,
            'retainer_fee' => $retainerFee,
            'retainer_hours' => $retainerHours,
        ]);
    }

    private function updateUrl(ClientAgreement $agreement): string
    {
        return "/api/client/mgmt/agreements/{$agreement->id}";
    }
}
