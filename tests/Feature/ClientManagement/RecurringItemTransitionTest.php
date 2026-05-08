<?php

namespace Tests\Feature\ClientManagement;

use App\Enums\ClientManagement\BillingCadence;
use App\Enums\ClientManagement\ChargeCadence;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientAgreementRecurringItem;
use App\Models\ClientManagement\ClientCompany;
use App\Models\User;
use App\Services\ClientManagement\RecurringItemBiller;
use Carbon\Carbon;
use Tests\TestCase;

class RecurringItemTransitionTest extends TestCase
{
    private User $admin;

    private ClientCompany $company;

    private RecurringItemBiller $recurringItemBiller;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = $this->createAdminUser();
        $this->company = ClientCompany::factory()->create([
            'company_name' => 'Recurring Transition Co',
            'slug' => 'recurring-transition-co',
        ]);
        $this->recurringItemBiller = app(RecurringItemBiller::class);
    }

    public function test_monthly_to_annual_migrate_moves_items_without_double_billing(): void
    {
        $outgoing = $this->createAgreement(BillingCadence::Monthly, '2026-01-01');
        $item = $this->createRecurringItem($outgoing, ChargeCadence::Monthly, '2026-01-01');

        $this->actingAs($this->admin)
            ->postJson($this->transitionUrl($outgoing), [
                'effective_date' => '2026-04-01',
                'billing_cadence' => BillingCadence::Annual->value,
                'carry_rollover' => false,
                'recurring_item_handling' => 'migrate',
            ])
            ->assertCreated();

        $successor = ClientAgreement::query()
            ->where('client_company_id', $this->company->id)
            ->whereKeyNot($outgoing->id)
            ->with('recurringItems')
            ->firstOrFail();

        $this->assertEquals('2026-03-31', $item->fresh()->end_date->toDateString());
        $this->assertCount(1, $successor->recurringItems);
        $this->assertEquals('2026-04-01', $successor->recurringItems->first()->start_date->toDateString());

        $dates = collect($this->recurringItemBiller->linesForCycle(
            $outgoing->fresh('recurringItems'),
            Carbon::parse('2026-03-01'),
            Carbon::parse('2026-03-31'),
        ))
            ->merge($this->recurringItemBiller->linesForCycle(
                $successor->fresh('recurringItems'),
                Carbon::parse('2026-01-01'),
                Carbon::parse('2026-12-31'),
            ))
            ->map(fn (array $line): string => $line['line_date']->toDateString())
            ->values()
            ->all();

        $this->assertSame([
            '2026-03-01',
            '2026-04-01',
            '2026-05-01',
            '2026-06-01',
            '2026-07-01',
            '2026-08-01',
            '2026-09-01',
            '2026-10-01',
            '2026-11-01',
            '2026-12-01',
        ], $dates);
        $this->assertSame(count($dates), count(array_unique($dates)));
    }

    public function test_annual_to_monthly_drop_ends_items_without_cloning(): void
    {
        $outgoing = $this->createAgreement(BillingCadence::Annual, '2026-01-01');
        $item = $this->createRecurringItem($outgoing, ChargeCadence::Annual, '2026-01-01', 5);

        $this->actingAs($this->admin)
            ->postJson($this->transitionUrl($outgoing), [
                'effective_date' => '2026-04-01',
                'billing_cadence' => BillingCadence::Monthly->value,
                'carry_rollover' => false,
                'recurring_item_handling' => 'drop',
            ])
            ->assertCreated();

        $successor = ClientAgreement::query()
            ->where('client_company_id', $this->company->id)
            ->whereKeyNot($outgoing->id)
            ->withCount('recurringItems')
            ->firstOrFail();

        $this->assertEquals('2026-03-31', $item->fresh()->end_date->toDateString());
        $this->assertSame(0, $successor->recurring_items_count);
    }

    private function createAgreement(BillingCadence $billingCadence, string $activeDate): ClientAgreement
    {
        return ClientAgreement::factory()->for($this->company)->create([
            'agreement_text' => 'Recurring transition terms',
            'active_date' => Carbon::parse($activeDate),
            'monthly_retainer_hours' => 10,
            'monthly_retainer_fee' => 1000,
            'hourly_rate' => 150,
            'rollover_months' => 3,
            'catch_up_threshold_hours' => 1,
            'billing_cadence' => $billingCadence->value,
            'bill_overage_interim' => false,
        ]);
    }

    private function createRecurringItem(
        ClientAgreement $agreement,
        ChargeCadence $chargeCadence,
        string $startDate,
        ?int $anchorMonth = null,
    ): ClientAgreementRecurringItem {
        return ClientAgreementRecurringItem::create([
            'client_agreement_id' => $agreement->id,
            'description' => 'Transition item',
            'amount' => 50,
            'charge_cadence' => $chargeCadence->value,
            'anchor_month' => $anchorMonth,
            'anchor_day' => 1,
            'start_date' => $startDate,
            'is_taxable' => false,
            'is_summarized' => false,
        ]);
    }

    private function transitionUrl(ClientAgreement $agreement): string
    {
        return "/api/client/mgmt/companies/{$this->company->id}/agreements/{$agreement->id}/transition";
    }
}
