<?php

namespace Tests\Feature\ClientManagement;

use App\Enums\ClientManagement\BillingCadence;
use App\Enums\ClientManagement\ChargeCadence;
use App\Enums\ClientManagement\FirstCycleProration;
use App\Enums\ClientManagement\InvoiceKind;
use App\Enums\ClientManagement\InvoiceLineType;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientAgreementRecurringItem;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientProject;
use App\Models\ClientManagement\ClientTimeEntry;
use App\Models\User;
use App\Services\ClientManagement\ClientInvoicingService;
use Carbon\Carbon;
use Tests\TestCase;

class ClientCadenceInvoicingTest extends TestCase
{
    private ClientInvoicingService $invoicingService;

    private User $admin;

    private ClientCompany $company;

    private ClientProject $project;

    protected function setUp(): void
    {
        parent::setUp();

        $this->invoicingService = app(ClientInvoicingService::class);
        $this->admin = $this->createAdminUser();
        $this->company = ClientCompany::factory()->create([
            'company_name' => 'Cadence Co',
            'slug' => 'cadence-co',
        ]);
        $this->project = ClientProject::factory()->for($this->company)->create([
            'name' => 'Cadence Project',
            'slug' => 'cadence-project',
        ]);
    }

    public function test_quarterly_agreement_generates_single_cadence_period_invoice(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-03-15'));

        try {
            $agreement = $this->createAgreement([
                'billing_cadence' => BillingCadence::Quarterly->value,
                'monthly_retainer_hours' => 10,
                'monthly_retainer_fee' => 1000,
                'active_date' => Carbon::parse('2026-01-01'),
            ]);

            $this->createTimeEntry('2026-01-10', 2);
            $this->createTimeEntry('2026-02-10', 3);
            $this->createTimeEntry('2026-03-10', 4);

            $results = $this->invoicingService->generateAllInvoices($this->company);

            $this->assertSame(1, $results['summary']['generated_count']);
            $this->assertSame(1, $results['summary']['cadence_period_invoices_created']);

            $invoice = ClientInvoice::query()
                ->where('client_agreement_id', $agreement->id)
                ->firstOrFail();

            $this->assertSame(InvoiceKind::CadencePeriod, $invoice->invoice_kind);
            $this->assertEquals('2026-01-01', $invoice->period_start->toDateString());
            $this->assertEquals('2026-03-31', $invoice->period_end->toDateString());
            $this->assertEquals('2026-01-01', $invoice->cycle_start->toDateString());
            $this->assertEquals('2026-03-31', $invoice->cycle_end->toDateString());
            $this->assertEquals(30.0, (float) $invoice->retainer_hours_included);
            $this->assertEquals(9.0, (float) $invoice->hours_worked);

            $invoice->load('lineItems');
            $retainerLine = $invoice->lineItems->firstWhere('line_type', InvoiceLineType::Retainer->value);
            $this->assertNotNull($retainerLine);
            $this->assertEquals(3000.0, (float) $retainerLine->line_total);
            $this->assertNull($invoice->lineItems->firstWhere('line_type', InvoiceLineType::AdditionalHours->value));

            $this->assertSame(0, ClientTimeEntry::query()->whereNull('client_invoice_line_id')->count());
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_annual_agreement_bills_cycle_overage_when_interim_is_disabled(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-15'));

        try {
            $agreement = $this->createAgreement([
                'billing_cadence' => BillingCadence::Annual->value,
                'bill_overage_interim' => false,
                'monthly_retainer_hours' => 10,
                'monthly_retainer_fee' => 1000,
                'hourly_rate' => 200,
                'active_date' => Carbon::parse('2026-01-01'),
            ]);

            $this->createTimeEntry('2026-07-10', 130);

            $this->invoicingService->generateAllInvoices($this->company);

            $invoice = ClientInvoice::query()
                ->where('client_agreement_id', $agreement->id)
                ->with('lineItems')
                ->firstOrFail();

            $this->assertEquals('2026-01-01', $invoice->period_start->toDateString());
            $this->assertEquals('2026-12-31', $invoice->period_end->toDateString());
            $this->assertEquals(120.0, (float) $invoice->retainer_hours_included);
            $this->assertEquals(10.0, (float) $invoice->hours_billed_at_rate);

            $retainerLine = $invoice->lineItems->firstWhere('line_type', InvoiceLineType::Retainer->value);
            $additionalHoursLine = $invoice->lineItems->firstWhere('line_type', InvoiceLineType::AdditionalHours->value);

            $this->assertNotNull($retainerLine);
            $this->assertNotNull($additionalHoursLine);
            $this->assertEquals(12000.0, (float) $retainerLine->line_total);
            $this->assertEquals(10.0, (float) $additionalHoursLine->hours);
            $this->assertEquals(2000.0, (float) $additionalHoursLine->line_total);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_prorated_first_cycle_scales_retainer_hours_and_fee_by_covered_days(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-03-15'));

        try {
            $agreement = $this->createAgreement([
                'billing_cadence' => BillingCadence::Quarterly->value,
                'first_cycle_proration' => FirstCycleProration::ProrateHours->value,
                'monthly_retainer_hours' => 10,
                'monthly_retainer_fee' => 1000,
                'active_date' => Carbon::parse('2026-02-15'),
            ]);

            $this->invoicingService->generateAllInvoices($this->company);

            $invoice = ClientInvoice::query()
                ->where('client_agreement_id', $agreement->id)
                ->with('lineItems')
                ->firstOrFail();

            $this->assertEquals('2026-02-15', $invoice->period_start->toDateString());
            $this->assertEquals('2026-03-31', $invoice->period_end->toDateString());
            $this->assertEquals(15.0, (float) $invoice->retainer_hours_included);

            $retainerLine = $invoice->lineItems->firstWhere('line_type', InvoiceLineType::Retainer->value);
            $this->assertNotNull($retainerLine);
            $this->assertEquals(1500.0, (float) $retainerLine->line_total);
            $this->assertEquals(15.0, (float) $retainerLine->hours);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_align_next_cycle_stub_scales_retainer_hours_and_fee_by_covered_days(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-03-15'));

        try {
            $agreement = $this->createAgreement([
                'billing_cadence' => BillingCadence::Quarterly->value,
                'first_cycle_proration' => FirstCycleProration::AlignNextCycle->value,
                'monthly_retainer_hours' => 10,
                'monthly_retainer_fee' => 1000,
                'active_date' => Carbon::parse('2026-02-15'),
            ]);

            $this->invoicingService->generateAllInvoices($this->company);

            $invoice = ClientInvoice::query()
                ->where('client_agreement_id', $agreement->id)
                ->with('lineItems')
                ->firstOrFail();

            $this->assertEquals('2026-02-15', $invoice->period_start->toDateString());
            $this->assertEquals('2026-03-31', $invoice->period_end->toDateString());
            $this->assertEquals(15.0, (float) $invoice->retainer_hours_included);

            $retainerLine = $invoice->lineItems->firstWhere('line_type', InvoiceLineType::Retainer->value);
            $this->assertNotNull($retainerLine);
            $this->assertEquals(1500.0, (float) $retainerLine->line_total);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_full_period_first_cycle_keeps_full_touched_month_retainer(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-03-15'));

        try {
            $agreement = $this->createAgreement([
                'billing_cadence' => BillingCadence::Quarterly->value,
                'first_cycle_proration' => FirstCycleProration::FullPeriod->value,
                'monthly_retainer_hours' => 10,
                'monthly_retainer_fee' => 1000,
                'active_date' => Carbon::parse('2026-02-15'),
            ]);

            $this->invoicingService->generateAllInvoices($this->company);

            $invoice = ClientInvoice::query()
                ->where('client_agreement_id', $agreement->id)
                ->with('lineItems')
                ->firstOrFail();

            $this->assertEquals('2026-02-15', $invoice->period_start->toDateString());
            $this->assertEquals('2026-03-31', $invoice->period_end->toDateString());
            $this->assertEquals(20.0, (float) $invoice->retainer_hours_included);

            $retainerLine = $invoice->lineItems->firstWhere('line_type', InvoiceLineType::Retainer->value);
            $this->assertNotNull($retainerLine);
            $this->assertEquals(2000.0, (float) $retainerLine->line_total);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_recurring_items_are_added_to_cadence_invoice_idempotently(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-03-15'));

        try {
            $agreement = $this->createAgreement([
                'billing_cadence' => BillingCadence::Quarterly->value,
                'monthly_retainer_fee' => 1000,
                'active_date' => Carbon::parse('2026-01-01'),
            ]);

            ClientAgreementRecurringItem::create([
                'client_agreement_id' => $agreement->id,
                'description' => 'Web hosting',
                'amount' => 50,
                'charge_cadence' => ChargeCadence::Monthly->value,
                'anchor_day' => 1,
                'start_date' => '2026-01-01',
                'is_taxable' => false,
                'is_summarized' => false,
            ]);

            $this->invoicingService->generateAllInvoices($this->company);
            $this->invoicingService->generateAllInvoices($this->company);

            $invoice = ClientInvoice::query()
                ->where('client_agreement_id', $agreement->id)
                ->with('lineItems')
                ->firstOrFail();

            $recurringLines = $invoice->lineItems
                ->where('line_type', InvoiceLineType::RecurringItem->value)
                ->values();

            $this->assertCount(3, $recurringLines);
            $this->assertEquals('2026-01-01', $recurringLines[0]->line_date->toDateString());
            $this->assertEquals('2026-02-01', $recurringLines[1]->line_date->toDateString());
            $this->assertEquals('2026-03-01', $recurringLines[2]->line_date->toDateString());
            $this->assertEquals(150.0, (float) $recurringLines->sum('line_total'));
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_manual_monthly_invoice_inside_quarterly_cycle_is_rejected(): void
    {
        $agreement = $this->createAgreement([
            'billing_cadence' => BillingCadence::Quarterly->value,
            'active_date' => Carbon::parse('2026-01-01'),
        ]);

        $this->expectException(\Exception::class);
        $this->expectExceptionMessage('Generate the full cadence cycle instead');

        $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::parse('2026-01-01'),
            Carbon::parse('2026-01-31'),
            $agreement,
        );
    }

    public function test_manual_exact_cycle_invoice_for_quarterly_agreement_is_allowed(): void
    {
        $agreement = $this->createAgreement([
            'billing_cadence' => BillingCadence::Quarterly->value,
            'active_date' => Carbon::parse('2026-01-01'),
        ]);

        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::parse('2026-01-01'),
            Carbon::parse('2026-03-31'),
            $agreement,
        );

        $this->assertSame(InvoiceKind::CadencePeriod, $invoice->invoice_kind);
        $this->assertEquals('2026-01-01', $invoice->period_start->toDateString());
        $this->assertEquals('2026-03-31', $invoice->period_end->toDateString());
    }

    public function test_invoice_store_accepts_exact_cycle_shorthand(): void
    {
        $agreement = $this->createAgreement([
            'billing_cadence' => BillingCadence::Quarterly->value,
            'active_date' => Carbon::parse('2026-01-01'),
        ]);

        $this->actingAs($this->admin)->postJson("/api/client/mgmt/companies/{$this->company->id}/invoices", [
            'cycle_start' => '2026-01-01',
            'cycle_end' => '2026-03-31',
        ])
            ->assertCreated()
            ->assertJsonPath('message', 'Invoice generated successfully');

        $invoice = ClientInvoice::query()
            ->where('client_agreement_id', $agreement->id)
            ->firstOrFail();

        $this->assertSame(InvoiceKind::CadencePeriod, $invoice->invoice_kind);
        $this->assertEquals('2026-01-01', $invoice->cycle_start->toDateString());
        $this->assertEquals('2026-03-31', $invoice->cycle_end->toDateString());
    }

    public function test_invoice_store_rejects_cycle_shorthand_that_does_not_match_cadence(): void
    {
        $this->createAgreement([
            'billing_cadence' => BillingCadence::Quarterly->value,
            'active_date' => Carbon::parse('2026-01-01'),
        ]);

        $this->actingAs($this->admin)->postJson("/api/client/mgmt/companies/{$this->company->id}/invoices", [
            'cycle_start' => '2026-01-01',
            'cycle_end' => '2026-01-31',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['cycle_start']);
    }

    public function test_issued_cadence_invoice_rejects_regeneration(): void
    {
        $agreement = $this->createAgreement([
            'billing_cadence' => BillingCadence::Quarterly->value,
            'active_date' => Carbon::parse('2026-01-01'),
        ]);

        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::parse('2026-01-01'),
            Carbon::parse('2026-03-31'),
            $agreement,
        );
        $invoice->issue();

        $this->expectException(\Exception::class);
        $this->expectExceptionMessage('already exists for this cadence cycle and cannot be modified');

        $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::parse('2026-01-01'),
            Carbon::parse('2026-03-31'),
            $agreement,
        );
    }

    public function test_overlapping_cadence_invoice_rejects_generation(): void
    {
        $agreement = $this->createAgreement([
            'billing_cadence' => BillingCadence::Quarterly->value,
            'active_date' => Carbon::parse('2026-01-01'),
        ]);

        ClientInvoice::create([
            'client_company_id' => $this->company->id,
            'client_agreement_id' => $agreement->id,
            'period_start' => Carbon::parse('2026-02-01'),
            'period_end' => Carbon::parse('2026-02-28'),
            'cycle_start' => Carbon::parse('2026-02-01'),
            'cycle_end' => Carbon::parse('2026-02-28'),
            'invoice_number' => 'INV-OVERLAP',
            'invoice_total' => 0,
            'status' => 'draft',
            'invoice_kind' => InvoiceKind::CadencePeriod->value,
        ]);

        $this->expectException(\Exception::class);
        $this->expectExceptionMessage('already exists for an overlapping period');

        $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::parse('2026-01-01'),
            Carbon::parse('2026-03-31'),
            $agreement,
        );
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createAgreement(array $overrides = []): ClientAgreement
    {
        return ClientAgreement::factory()->for($this->company)->create(array_merge([
            'agreement_text' => 'Cadence agreement',
            'monthly_retainer_fee' => 1000,
            'monthly_retainer_hours' => 10,
            'hourly_rate' => 150,
            'active_date' => Carbon::parse('2026-01-01'),
            'termination_date' => null,
            'rollover_months' => 3,
            'catch_up_threshold_hours' => 1,
            'is_visible_to_client' => true,
            'billing_cadence' => BillingCadence::Quarterly->value,
            'bill_overage_interim' => false,
            'first_cycle_proration' => 'prorate_hours',
        ], $overrides));
    }

    private function createTimeEntry(string $dateWorked, float $hours): ClientTimeEntry
    {
        return ClientTimeEntry::factory()->for($this->company)->for($this->project, 'project')->create([
            'user_id' => $this->admin->id,
            'creator_user_id' => $this->admin->id,
            'date_worked' => $dateWorked,
            'minutes_worked' => (int) round($hours * 60),
            'name' => 'Cadence work',
            'is_billable' => true,
            'is_deferred_billing' => false,
        ]);
    }
}
