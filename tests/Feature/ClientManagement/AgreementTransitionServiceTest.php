<?php

namespace Tests\Feature\ClientManagement;

use App\Enums\ClientManagement\BillingCadence;
use App\Enums\ClientManagement\ChargeCadence;
use App\Enums\ClientManagement\InvoiceKind;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientAgreementRecurringItem;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientCompanyActivity;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\User;
use Carbon\Carbon;
use Tests\TestCase;

class AgreementTransitionServiceTest extends TestCase
{
    private User $admin;

    private ClientCompany $company;

    private ClientAgreement $agreement;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = $this->createAdminUser();
        $this->company = ClientCompany::factory()->create([
            'company_name' => 'Transition Co',
            'slug' => 'transition-co',
        ]);
        $this->agreement = ClientAgreement::factory()->for($this->company)->create([
            'agreement_text' => 'Quarterly terms',
            'active_date' => Carbon::parse('2026-01-01'),
            'monthly_retainer_hours' => 10,
            'monthly_retainer_fee' => 1000,
            'hourly_rate' => 150,
            'rollover_months' => 3,
            'catch_up_threshold_hours' => 1,
            'billing_cadence' => BillingCadence::Quarterly->value,
            'bill_overage_interim' => true,
        ]);
    }

    public function test_transition_preview_is_dry_run_and_reports_carried_rollover(): void
    {
        $this->createClosingInvoiceWithUnusedHours(4);

        $this->actingAs($this->admin)
            ->postJson($this->transitionUrl('/preview'), [
                'effective_date' => '2026-04-01',
                'billing_cadence' => BillingCadence::Monthly->value,
                'carry_rollover' => true,
                'recurring_item_handling' => 'clone',
            ])
            ->assertOk()
            ->assertJsonPath('preview.outgoing_termination_date', '2026-03-31')
            ->assertJsonPath('preview.successor_terms.billing_cadence', BillingCadence::Monthly->value)
            ->assertJsonPath('preview.carried_rollover_hours', 4);

        $this->assertSame(1, ClientAgreement::query()->where('client_company_id', $this->company->id)->count());
        $this->assertNull($this->agreement->fresh()->termination_date);
    }

    public function test_transition_terminates_outgoing_creates_successor_clones_items_and_logs_activity(): void
    {
        $this->createClosingInvoiceWithUnusedHours(4);
        ClientAgreementRecurringItem::create([
            'client_agreement_id' => $this->agreement->id,
            'description' => 'Web hosting',
            'amount' => 50,
            'charge_cadence' => ChargeCadence::Monthly->value,
            'anchor_day' => 1,
            'start_date' => '2026-01-01',
            'is_taxable' => false,
            'is_summarized' => false,
        ]);

        $this->actingAs($this->admin)
            ->postJson($this->transitionUrl(), [
                'effective_date' => '2026-04-01',
                'billing_cadence' => BillingCadence::Monthly->value,
                'carry_rollover' => true,
                'recurring_item_handling' => 'clone',
            ])
            ->assertCreated()
            ->assertJsonPath('successor_agreement.billing_cadence', BillingCadence::Monthly->value);

        $outgoing = $this->agreement->fresh();
        $successor = ClientAgreement::query()
            ->where('client_company_id', $this->company->id)
            ->where('id', '!=', $this->agreement->id)
            ->with('recurringItems')
            ->firstOrFail();

        $this->assertEquals('2026-03-31', $outgoing->termination_date->toDateString());
        $this->assertEquals('2026-04-01', $successor->active_date->toDateString());
        $this->assertEquals(4.0, (float) $successor->initial_rollover_hours);
        $this->assertSame(BillingCadence::Monthly, $successor->billing_cadence);
        $this->assertCount(1, $successor->recurringItems);
        $this->assertEquals('2026-04-01', $successor->recurringItems->first()->start_date->toDateString());

        $activity = ClientCompanyActivity::query()->where('action', 'agreement.transitioned')->firstOrFail();
        $this->assertSame($successor->id, $activity->subject_id);
        $this->assertSame($this->admin->id, $activity->actor_user_id);
        $this->assertSame(4.0, (float) $activity->payload['carried_rollover_hours']);
    }

    public function test_transition_end_mode_ends_outgoing_recurring_items_without_cloning(): void
    {
        $item = ClientAgreementRecurringItem::create([
            'client_agreement_id' => $this->agreement->id,
            'description' => 'License',
            'amount' => 100,
            'charge_cadence' => ChargeCadence::Monthly->value,
            'anchor_day' => 1,
            'start_date' => '2026-01-01',
            'is_taxable' => false,
            'is_summarized' => false,
        ]);

        $this->actingAs($this->admin)
            ->postJson($this->transitionUrl(), [
                'effective_date' => '2026-04-01',
                'billing_cadence' => BillingCadence::Annual->value,
                'carry_rollover' => false,
                'recurring_item_handling' => 'end',
            ])
            ->assertCreated();

        $successor = ClientAgreement::query()
            ->where('client_company_id', $this->company->id)
            ->where('id', '!=', $this->agreement->id)
            ->withCount('recurringItems')
            ->firstOrFail();

        $this->assertSame(0, $successor->recurring_items_count);
        $this->assertEquals('2026-03-31', $item->fresh()->end_date->toDateString());
    }

    private function createClosingInvoiceWithUnusedHours(float $unusedHours): ClientInvoice
    {
        return ClientInvoice::create([
            'client_company_id' => $this->company->id,
            'client_agreement_id' => $this->agreement->id,
            'period_start' => Carbon::parse('2026-01-01'),
            'period_end' => Carbon::parse('2026-03-31'),
            'cycle_start' => Carbon::parse('2026-01-01'),
            'cycle_end' => Carbon::parse('2026-03-31'),
            'invoice_number' => 'INV-CLOSING',
            'invoice_total' => 0,
            'retainer_hours_included' => 30,
            'hours_worked' => 26,
            'unused_hours_balance' => $unusedHours,
            'status' => 'issued',
            'invoice_kind' => InvoiceKind::CadencePeriod->value,
        ]);
    }

    private function transitionUrl(string $suffix = ''): string
    {
        return "/api/client/mgmt/companies/{$this->company->id}/agreements/{$this->agreement->id}/transition{$suffix}";
    }
}
