<?php

namespace Tests\Feature\ClientManagement;

use App\Enums\ClientManagement\ChargeCadence;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientAgreementRecurringItem;
use App\Models\ClientManagement\ClientCompany;
use App\Models\User;
use Carbon\Carbon;
use Tests\TestCase;

class AgreementRecurringItemTest extends TestCase
{
    private User $admin;

    private ClientCompany $company;

    private ClientAgreement $agreement;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create([
            'user_role' => 'admin',
        ]);

        $this->company = ClientCompany::factory()->create([
            'company_name' => 'Recurring Co',
            'slug' => 'recurring-co',
        ]);

        $this->agreement = ClientAgreement::factory()->for($this->company)->create([
            'agreement_text' => 'Recurring agreement',
            'monthly_retainer_fee' => 1000,
            'monthly_retainer_hours' => 10,
            'hourly_rate' => 150,
            'active_date' => Carbon::parse('2026-01-01'),
            'termination_date' => Carbon::parse('2026-12-31'),
            'rollover_months' => 3,
            'is_visible_to_client' => true,
        ]);
    }

    public function test_admin_can_create_list_update_and_delete_recurring_items(): void
    {
        $createResponse = $this->actingAs($this->admin)->postJson($this->itemsUrl(), [
            'description' => 'Web hosting',
            'amount' => 50,
            'charge_cadence' => ChargeCadence::Monthly->value,
            'anchor_day' => 1,
            'start_date' => '2026-01-01',
            'is_taxable' => false,
            'is_summarized' => false,
            'notes' => 'Primary hosting plan',
        ]);

        $createResponse->assertCreated()
            ->assertJsonPath('recurring_item.description', 'Web hosting')
            ->assertJsonPath('recurring_item.amount', 50)
            ->assertJsonPath('recurring_item.charge_cadence', ChargeCadence::Monthly->value);

        $itemId = $createResponse->json('recurring_item.id');

        $this->actingAs($this->admin)->getJson($this->itemsUrl())
            ->assertOk()
            ->assertJsonCount(1, 'recurring_items')
            ->assertJsonPath('recurring_items.0.id', $itemId);

        $this->actingAs($this->admin)->putJson($this->itemUrl($itemId), [
            'description' => 'Managed web hosting',
            'amount' => 75,
            'notes' => null,
        ])
            ->assertOk()
            ->assertJsonPath('recurring_item.description', 'Managed web hosting')
            ->assertJsonPath('recurring_item.amount', 75);

        $this->actingAs($this->admin)->deleteJson($this->itemUrl($itemId))
            ->assertOk()
            ->assertJsonPath('message', 'Recurring item deleted successfully');

        $this->assertSoftDeleted('client_agreement_recurring_items', ['id' => $itemId]);
    }

    public function test_anchor_month_is_required_for_non_monthly_recurring_items(): void
    {
        $this->actingAs($this->admin)->postJson($this->itemsUrl(), [
            'description' => 'Quarterly platform fee',
            'amount' => 300,
            'charge_cadence' => ChargeCadence::Quarterly->value,
            'anchor_day' => 1,
            'start_date' => '2026-01-01',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['anchor_month']);
    }

    public function test_recurring_item_dates_must_stay_inside_agreement_window(): void
    {
        $this->actingAs($this->admin)->postJson($this->itemsUrl(), [
            'description' => 'Out of window fee',
            'amount' => 50,
            'charge_cadence' => ChargeCadence::Monthly->value,
            'anchor_day' => 1,
            'start_date' => '2025-12-31',
            'end_date' => '2027-01-01',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['start_date', 'end_date']);
    }

    public function test_duplicate_recurring_items_are_rejected(): void
    {
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

        $this->actingAs($this->admin)->postJson($this->itemsUrl(), [
            'description' => 'Web hosting',
            'amount' => 60,
            'charge_cadence' => ChargeCadence::Monthly->value,
            'anchor_day' => 1,
            'start_date' => '2026-01-01',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['description']);
    }

    private function itemsUrl(): string
    {
        return "/api/client/mgmt/companies/{$this->company->id}/agreements/{$this->agreement->id}/recurring-items";
    }

    private function itemUrl(int $itemId): string
    {
        return $this->itemsUrl()."/{$itemId}";
    }
}
