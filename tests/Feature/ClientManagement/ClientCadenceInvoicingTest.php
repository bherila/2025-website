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
use App\Models\ClientManagement\ClientExpense;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientProject;
use App\Models\ClientManagement\ClientTask;
use App\Models\ClientManagement\ClientTimeEntry;
use App\Models\User;
use App\Services\ClientManagement\ClientInvoicingService;
use App\Services\ClientManagement\RolloverCalculator;
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

            // Cadence retainers are billed in advance at the cycle start, so the number is
            // keyed to the cycle's first/issue month (2026-01), not the month after cycle_end.
            $this->assertSame('202601', explode('-', (string) $invoice->invoice_number)[1]);
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

    public function test_semiannual_agreement_uses_period_retainer_terms_for_anchored_cycle_invoice(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-05-26'));

        try {
            $agreement = $this->createAgreement([
                'billing_cadence' => BillingCadence::SemiAnnual->value,
                'active_date' => Carbon::parse('2025-11-01'),
                'monthly_retainer_hours' => 0,
                'monthly_retainer_fee' => 0,
                'retainer_hours' => 1,
                'retainer_fee' => 262.50,
                'hourly_rate' => 375,
                'rollover_months' => 0,
                'catch_up_threshold_hours' => 1,
            ]);

            $this->createTimeEntry('2025-12-10', 0.5);

            $this->invoicingService->generateAllInvoices($this->company);

            $invoice = ClientInvoice::query()
                ->where('client_agreement_id', $agreement->id)
                ->whereDate('period_start', '2025-11-01')
                ->with('lineItems')
                ->firstOrFail();

            $this->assertEquals('2026-04-30', $invoice->period_end->toDateString());
            $this->assertEquals(262.50, (float) $invoice->invoice_total);
            $this->assertEquals(1.0, (float) $invoice->retainer_hours_included);
            $this->assertEquals(0.5, (float) $invoice->hours_worked);
            $this->assertEquals(0.5, (float) $invoice->unused_hours_balance);

            $retainerLine = $invoice->lineItems->firstWhere('line_type', InvoiceLineType::Retainer->value);
            $this->assertNotNull($retainerLine);
            $this->assertStringStartsWith('Semiannual Retainer', (string) $retainerLine->description);
            $this->assertEquals(262.50, (float) $retainerLine->line_total);
            $this->assertEquals(1.0, (float) $retainerLine->hours);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_semiannual_period_retainer_bills_cycle_overage_at_hourly_rate(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-05-26'));

        try {
            $agreement = $this->createAgreement([
                'billing_cadence' => BillingCadence::SemiAnnual->value,
                'active_date' => Carbon::parse('2025-11-01'),
                'monthly_retainer_hours' => 0,
                'monthly_retainer_fee' => 0,
                'retainer_hours' => 1,
                'retainer_fee' => 262.50,
                'hourly_rate' => 375,
                'rollover_months' => 0,
                'catch_up_threshold_hours' => 1,
            ]);

            $this->createTimeEntry('2026-05-20', 1.5);

            $this->invoicingService->generateAllInvoices($this->company);

            $invoice = ClientInvoice::query()
                ->where('client_agreement_id', $agreement->id)
                ->whereDate('period_start', '2026-05-01')
                ->with('lineItems')
                ->firstOrFail();

            $this->assertEquals('2026-10-31', $invoice->period_end->toDateString());
            $this->assertEquals(1.0, (float) $invoice->retainer_hours_included);
            $this->assertEquals(1.5, (float) $invoice->hours_worked);
            $this->assertEquals(0.5, (float) $invoice->hours_billed_at_rate);
            $this->assertEquals(450.0, (float) $invoice->invoice_total);

            $additionalHoursLine = $invoice->lineItems->firstWhere('line_type', InvoiceLineType::AdditionalHours->value);
            $this->assertNotNull($additionalHoursLine);
            $this->assertEquals(0.5, (float) $additionalHoursLine->hours);
            $this->assertEquals(187.50, (float) $additionalHoursLine->line_total);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_semiannual_period_retainer_skips_interim_overage_when_work_fits_within_cycle_pool(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-03-15'));

        try {
            $agreement = $this->createAgreement([
                'billing_cadence' => BillingCadence::SemiAnnual->value,
                'active_date' => Carbon::parse('2025-11-01'),
                'monthly_retainer_hours' => 0,
                'monthly_retainer_fee' => 0,
                'retainer_hours' => 1,
                'retainer_fee' => 262.50,
                'hourly_rate' => 375,
                'rollover_months' => 0,
                'catch_up_threshold_hours' => 1,
                'bill_overage_interim' => true,
            ]);

            $this->createTimeEntry('2025-12-10', 0.5);

            $this->invoicingService->generateAllInvoices($this->company);

            $interimInvoices = ClientInvoice::query()
                ->where('client_agreement_id', $agreement->id)
                ->where('invoice_kind', InvoiceKind::InterimOverage->value)
                ->get();

            $this->assertCount(0, $interimInvoices, 'Interim overage invoice must not be generated when cycle-cumulative work is within the period retainer pool.');
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_semiannual_period_retainer_bills_interim_overage_only_for_cycle_excess(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-03-15'));

        try {
            $agreement = $this->createAgreement([
                'billing_cadence' => BillingCadence::SemiAnnual->value,
                'active_date' => Carbon::parse('2025-11-01'),
                'monthly_retainer_hours' => 0,
                'monthly_retainer_fee' => 0,
                'retainer_hours' => 1,
                'retainer_fee' => 262.50,
                'hourly_rate' => 375,
                'rollover_months' => 0,
                'catch_up_threshold_hours' => 1,
                'bill_overage_interim' => true,
            ]);

            $this->createTimeEntry('2025-12-10', 0.5);
            $this->createTimeEntry('2026-02-10', 2.0);

            $this->invoicingService->generateAllInvoices($this->company);

            $interimInvoices = ClientInvoice::query()
                ->where('client_agreement_id', $agreement->id)
                ->where('invoice_kind', InvoiceKind::InterimOverage->value)
                ->with('lineItems')
                ->get();

            $this->assertCount(1, $interimInvoices, 'Exactly one interim invoice for the cycle-cumulative excess crossing month.');

            $invoice = $interimInvoices->first();
            $this->assertEquals('2026-02-01', $invoice->period_start->toDateString());
            $this->assertEquals('2026-02-28', $invoice->period_end->toDateString());
            $this->assertEquals('2025-11-01', $invoice->cycle_start->toDateString());
            $this->assertEquals('2026-04-30', $invoice->cycle_end->toDateString());
            $this->assertEquals(1.5, (float) $invoice->hours_billed_at_rate);
            $this->assertEquals(562.50, (float) $invoice->invoice_total);

            $additionalHoursLine = $invoice->lineItems->firstWhere('line_type', InvoiceLineType::AdditionalHours->value);
            $this->assertNotNull($additionalHoursLine);
            $this->assertSame('1:30', $additionalHoursLine->quantity);
            $this->assertEquals(1.5, (float) $additionalHoursLine->hours);
            $this->assertEquals(562.50, (float) $additionalHoursLine->line_total);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_period_retainer_interim_compares_against_full_cycle_pool_when_built_mid_cycle(): void
    {
        Carbon::setTestNow(Carbon::parse('2025-12-15'));

        try {
            $agreement = $this->createAgreement([
                'billing_cadence' => BillingCadence::SemiAnnual->value,
                'active_date' => Carbon::parse('2025-11-01'),
                'monthly_retainer_hours' => 0,
                'monthly_retainer_fee' => 0,
                'retainer_hours' => 1,
                'retainer_fee' => 262.50,
                'hourly_rate' => 375,
                'rollover_months' => 0,
                'catch_up_threshold_hours' => 1,
                'bill_overage_interim' => true,
            ]);

            $this->createTimeEntry('2025-12-10', 0.5);

            // Call interim directly with periodStart inside an in-progress cycle.
            // Without the fix, the ledger gets built through Dec 31 and
            // cyclesForAgreement clips the active cycle to Nov 1 - Dec 31
            // (~33% multiplier), so 0.5h of work would exceed the shrunken
            // pool and bill as overage.
            $invoice = $this->invoicingService->generateInterimOverageInvoice(
                $this->company,
                Carbon::parse('2025-12-01'),
                $agreement,
            );

            $this->assertNull($invoice, 'Mid-cycle interim must compare against the full Nov-Apr pool, not the ledger-clipped partial cycle.');
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_semiannual_period_retainer_clips_boundary_month_hours_per_cycle(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-05-20'));

        try {
            $agreement = $this->createAgreement([
                'billing_cadence' => BillingCadence::SemiAnnual->value,
                'active_date' => Carbon::parse('2025-11-15'),
                'monthly_retainer_hours' => 0,
                'monthly_retainer_fee' => 0,
                'retainer_hours' => 2,
                'retainer_fee' => 500,
                'hourly_rate' => 375,
                'rollover_months' => 0,
                'catch_up_threshold_hours' => 1,
                'bill_overage_interim' => true,
            ]);

            // Cycle 1: 2025-11-15 → 2026-05-14
            $this->createTimeEntry('2025-11-20', 1.0);
            $this->createTimeEntry('2026-05-10', 0.5);

            // Cycle 2: 2026-05-15 → 2026-11-14 (shares calendar month 2026-05 with cycle 1)
            $this->createTimeEntry('2026-05-19', 0.7);

            $this->invoicingService->generateAllInvoices($this->company);

            $cycleOneInvoice = ClientInvoice::query()
                ->where('client_agreement_id', $agreement->id)
                ->where('invoice_kind', InvoiceKind::CadencePeriod->value)
                ->whereDate('cycle_start', '2025-11-15')
                ->whereDate('cycle_end', '2026-05-14')
                ->with('lineItems')
                ->firstOrFail();

            $this->assertEquals(1.5, (float) $cycleOneInvoice->hours_worked, 'Cycle 1 must only count hours within Nov 15 – May 14');
            $this->assertEquals(0.0, (float) $cycleOneInvoice->hours_billed_at_rate);
            $this->assertEquals(500.0, (float) $cycleOneInvoice->invoice_total);

            $cycleTwoInvoice = ClientInvoice::query()
                ->where('client_agreement_id', $agreement->id)
                ->where('invoice_kind', InvoiceKind::CadencePeriod->value)
                ->whereDate('cycle_start', '2026-05-15')
                ->whereDate('cycle_end', '2026-11-14')
                ->with('lineItems')
                ->firstOrFail();

            $this->assertEquals(0.7, (float) $cycleTwoInvoice->hours_worked, 'Cycle 2 must only count hours within May 15 – Nov 14');
            $this->assertEquals(0.0, (float) $cycleTwoInvoice->hours_billed_at_rate);
            $this->assertEquals(500.0, (float) $cycleTwoInvoice->invoice_total);

            $interimCount = ClientInvoice::query()
                ->where('client_agreement_id', $agreement->id)
                ->where('invoice_kind', InvoiceKind::InterimOverage->value)
                ->count();

            $this->assertSame(0, $interimCount, 'No interim overage should fire when each cycle stays within its own pool.');
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_semiannual_agreement_starting_next_month_generates_full_upcoming_cycle(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-05-26'));

        try {
            $agreement = $this->createAgreement([
                'billing_cadence' => BillingCadence::SemiAnnual->value,
                'active_date' => Carbon::parse('2026-06-01'),
                'monthly_retainer_hours' => 0,
                'monthly_retainer_fee' => 0,
                'retainer_hours' => 1,
                'retainer_fee' => 262.50,
                'hourly_rate' => 375,
                'rollover_months' => 0,
                'catch_up_threshold_hours' => 1,
            ]);

            $this->invoicingService->generateAllInvoices($this->company);

            $invoice = ClientInvoice::query()
                ->where('client_agreement_id', $agreement->id)
                ->with('lineItems')
                ->firstOrFail();

            $this->assertEquals('2026-06-01', $invoice->period_start->toDateString());
            $this->assertEquals('2026-11-30', $invoice->period_end->toDateString());
            $this->assertEquals(262.50, (float) $invoice->invoice_total);
            $this->assertEquals(1.0, (float) $invoice->retainer_hours_included);
            $this->assertEquals(1.0, (float) $invoice->unused_hours_balance);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_quarterly_agreement_aggregates_rollover_usage_across_cycle(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-03-15'));

        try {
            $agreement = $this->createAgreement([
                'billing_cadence' => BillingCadence::Quarterly->value,
                'monthly_retainer_hours' => 10,
                'monthly_retainer_fee' => 1000,
                'rollover_months' => 3,
                'active_date' => Carbon::parse('2026-01-01'),
            ]);

            $this->createTimeEntry('2026-01-10', 5);
            $this->createTimeEntry('2026-02-10', 14);

            $this->invoicingService->generateAllInvoices($this->company);

            $invoice = ClientInvoice::query()
                ->where('client_agreement_id', $agreement->id)
                ->with('lineItems')
                ->firstOrFail();

            $this->assertEquals(19.0, (float) $invoice->hours_worked);
            $this->assertEquals(4.0, (float) $invoice->rollover_hours_used);
            $this->assertEquals(0.0, (float) $invoice->hours_billed_at_rate);
            $this->assertNull($invoice->lineItems->firstWhere('line_type', InvoiceLineType::AdditionalHours->value));
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
            $this->assertEquals(40.0, (float) $invoice->hours_billed_at_rate);

            $retainerLine = $invoice->lineItems->firstWhere('line_type', InvoiceLineType::Retainer->value);
            $additionalHoursLine = $invoice->lineItems->firstWhere('line_type', InvoiceLineType::AdditionalHours->value);

            $this->assertNotNull($retainerLine);
            $this->assertNotNull($additionalHoursLine);
            $this->assertEquals(12000.0, (float) $retainerLine->line_total);
            $this->assertEquals(40.0, (float) $additionalHoursLine->hours);
            $this->assertEquals(8000.0, (float) $additionalHoursLine->line_total);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_quarterly_first_cycle_anchors_to_active_date_instead_of_calendar_quarter(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-03-15'));

        try {
            $agreement = $this->createAgreement([
                'billing_cadence' => BillingCadence::Quarterly->value,
                'first_cycle_proration' => FirstCycleProration::ProrateHours->value,
                'monthly_retainer_hours' => 10,
                'monthly_retainer_fee' => 1000,
                'active_date' => Carbon::parse('2026-02-01'),
            ]);

            $this->invoicingService->generateAllInvoices($this->company);

            $invoice = ClientInvoice::query()
                ->where('client_agreement_id', $agreement->id)
                ->with('lineItems')
                ->firstOrFail();

            $this->assertEquals('2026-02-01', $invoice->period_start->toDateString());
            $this->assertEquals('2026-04-30', $invoice->period_end->toDateString());
            $this->assertEquals(30.0, (float) $invoice->retainer_hours_included);

            $retainerLine = $invoice->lineItems->firstWhere('line_type', InvoiceLineType::Retainer->value);
            $this->assertNotNull($retainerLine);
            $this->assertEquals(3000.0, (float) $retainerLine->line_total);
            $this->assertEquals(30.0, (float) $retainerLine->hours);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_quarterly_active_date_anchor_ignores_align_next_cycle_policy(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-03-15'));

        try {
            $agreement = $this->createAgreement([
                'billing_cadence' => BillingCadence::Quarterly->value,
                'first_cycle_proration' => FirstCycleProration::AlignNextCycle->value,
                'monthly_retainer_hours' => 10,
                'monthly_retainer_fee' => 1000,
                'active_date' => Carbon::parse('2026-02-01'),
            ]);

            $this->invoicingService->generateAllInvoices($this->company);

            $invoice = ClientInvoice::query()
                ->where('client_agreement_id', $agreement->id)
                ->with('lineItems')
                ->firstOrFail();

            $this->assertEquals('2026-02-01', $invoice->period_start->toDateString());
            $this->assertEquals('2026-04-30', $invoice->period_end->toDateString());
            $this->assertEquals(30.0, (float) $invoice->retainer_hours_included);

            $retainerLine = $invoice->lineItems->firstWhere('line_type', InvoiceLineType::Retainer->value);
            $this->assertNotNull($retainerLine);
            $this->assertEquals(3000.0, (float) $retainerLine->line_total);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_quarterly_active_date_anchor_ignores_full_period_policy(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-03-15'));

        try {
            $agreement = $this->createAgreement([
                'billing_cadence' => BillingCadence::Quarterly->value,
                'first_cycle_proration' => FirstCycleProration::FullPeriod->value,
                'monthly_retainer_hours' => 10,
                'monthly_retainer_fee' => 1000,
                'active_date' => Carbon::parse('2026-02-01'),
            ]);

            $this->invoicingService->generateAllInvoices($this->company);

            $invoice = ClientInvoice::query()
                ->where('client_agreement_id', $agreement->id)
                ->with('lineItems')
                ->firstOrFail();

            $this->assertEquals('2026-02-01', $invoice->period_start->toDateString());
            $this->assertEquals('2026-04-30', $invoice->period_end->toDateString());
            $this->assertEquals(30.0, (float) $invoice->retainer_hours_included);

            $retainerLine = $invoice->lineItems->firstWhere('line_type', InvoiceLineType::Retainer->value);
            $this->assertNotNull($retainerLine);
            $this->assertEquals(3000.0, (float) $retainerLine->line_total);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_quarterly_active_date_anchor_keeps_period_retainer_override(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-03-15'));

        try {
            $agreement = $this->createAgreement([
                'billing_cadence' => BillingCadence::Quarterly->value,
                'first_cycle_proration' => FirstCycleProration::FullPeriod->value,
                'monthly_retainer_hours' => 0,
                'monthly_retainer_fee' => 0,
                'retainer_hours' => 30,
                'retainer_fee' => 3000,
                'active_date' => Carbon::parse('2026-02-01'),
            ]);

            $this->createTimeEntry('2026-02-20', 20);

            $this->invoicingService->generateAllInvoices($this->company);

            $invoice = ClientInvoice::query()
                ->where('client_agreement_id', $agreement->id)
                ->with('lineItems')
                ->firstOrFail();

            $this->assertEquals('2026-02-01', $invoice->period_start->toDateString());
            $this->assertEquals('2026-04-30', $invoice->period_end->toDateString());
            $this->assertEquals(30.0, (float) $invoice->retainer_hours_included);
            $this->assertEquals(20.0, (float) $invoice->hours_worked);
            $this->assertEquals(0.0, (float) $invoice->hours_billed_at_rate);

            $retainerLine = $invoice->lineItems->firstWhere('line_type', InvoiceLineType::Retainer->value);
            $this->assertNotNull($retainerLine);
            $this->assertEquals(3000.0, (float) $retainerLine->line_total);
            $this->assertEquals(30.0, (float) $retainerLine->hours);
            $this->assertNull($invoice->lineItems->firstWhere('line_type', InvoiceLineType::AdditionalHours->value));
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_mid_cycle_termination_prorates_final_cadence_cycle(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-02-20'));

        try {
            $agreement = $this->createAgreement([
                'billing_cadence' => BillingCadence::Quarterly->value,
                'first_cycle_proration' => FirstCycleProration::ProrateHours->value,
                'monthly_retainer_hours' => 10,
                'monthly_retainer_fee' => 1000,
                'active_date' => Carbon::parse('2026-01-01'),
                'termination_date' => Carbon::parse('2026-02-15'),
            ]);

            $this->invoicingService->generateAllInvoices($this->company);

            $invoice = ClientInvoice::query()
                ->where('client_agreement_id', $agreement->id)
                ->with('lineItems')
                ->firstOrFail();

            $this->assertEquals('2026-01-01', $invoice->period_start->toDateString());
            $this->assertEquals('2026-02-15', $invoice->period_end->toDateString());
            $this->assertEquals(15.357, (float) $invoice->retainer_hours_included);

            $retainerLine = $invoice->lineItems->firstWhere('line_type', InvoiceLineType::Retainer->value);
            $this->assertNotNull($retainerLine);
            $this->assertEquals(1535.70, (float) $retainerLine->line_total);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_generate_all_walks_agreement_transition_timeline(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-05-15'));

        try {
            $outgoing = $this->createAgreement([
                'billing_cadence' => BillingCadence::Quarterly->value,
                'active_date' => Carbon::parse('2026-01-01'),
                'termination_date' => Carbon::parse('2026-03-31'),
            ]);
            $successor = ClientAgreement::factory()->for($this->company)->create([
                'agreement_text' => 'Successor terms',
                'monthly_retainer_fee' => 2000,
                'monthly_retainer_hours' => 20,
                'hourly_rate' => 200,
                'active_date' => Carbon::parse('2026-04-01'),
                'termination_date' => null,
                'rollover_months' => 3,
                'catch_up_threshold_hours' => 1,
                'is_visible_to_client' => true,
                'billing_cadence' => BillingCadence::Quarterly->value,
                'bill_overage_interim' => false,
                'first_cycle_proration' => FirstCycleProration::ProrateHours->value,
            ]);

            $this->invoicingService->generateAllInvoices($this->company);

            $outgoingInvoice = ClientInvoice::query()
                ->where('client_agreement_id', $outgoing->id)
                ->firstOrFail();
            $successorInvoice = ClientInvoice::query()
                ->where('client_agreement_id', $successor->id)
                ->firstOrFail();

            $this->assertEquals('2026-01-01', $outgoingInvoice->period_start->toDateString());
            $this->assertEquals('2026-03-31', $outgoingInvoice->period_end->toDateString());
            $this->assertEquals('2026-04-01', $successorInvoice->period_start->toDateString());
            $this->assertEquals('2026-06-30', $successorInvoice->period_end->toDateString());
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

    public function test_generate_all_is_idempotent_across_cadence_lines_and_credits(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-03-15'));

        try {
            $agreement = $this->createAgreement([
                'billing_cadence' => BillingCadence::Quarterly->value,
                'monthly_retainer_hours' => 10,
                'monthly_retainer_fee' => 1000,
                'hourly_rate' => 100,
                'active_date' => Carbon::parse('2026-01-01'),
            ]);

            $creditSeed = ClientInvoice::create([
                'client_company_id' => $this->company->id,
                'client_agreement_id' => $agreement->id,
                'period_start' => Carbon::parse('2025-12-01'),
                'period_end' => Carbon::parse('2025-12-31'),
                'cycle_start' => Carbon::parse('2025-12-01'),
                'cycle_end' => Carbon::parse('2025-12-31'),
                'invoice_number' => 'INV-CADENCE-CREDIT',
                'invoice_total' => 100,
                'status' => 'issued',
                'invoice_kind' => InvoiceKind::CadencePeriod->value,
            ]);
            $creditSeed->payments()->create([
                'amount' => 350,
                'payment_date' => '2026-01-05',
                'payment_method' => 'Wire',
            ]);
            $creditSeed->markPaid('2026-01-05');

            $this->createTimeEntry('2026-01-10', 9);
            ClientExpense::create([
                'client_company_id' => $this->company->id,
                'description' => 'Software license',
                'amount' => 99.99,
                'expense_date' => Carbon::parse('2026-01-20'),
                'is_reimbursable' => true,
                'is_reimbursed' => false,
                'creator_user_id' => $this->admin->id,
            ]);
            ClientTask::create([
                'project_id' => $this->project->id,
                'name' => 'Launch milestone',
                'milestone_price' => 500,
                'completed_at' => Carbon::parse('2026-01-25'),
                'creator_user_id' => $this->admin->id,
            ]);
            ClientAgreementRecurringItem::create([
                'client_agreement_id' => $agreement->id,
                'description' => 'Managed hosting',
                'amount' => 50,
                'charge_cadence' => ChargeCadence::Monthly->value,
                'anchor_day' => 1,
                'start_date' => '2026-01-01',
                'is_taxable' => false,
                'is_summarized' => false,
            ]);

            $this->invoicingService->generateAllInvoices($this->company);
            $invoice = ClientInvoice::query()
                ->where('client_agreement_id', $agreement->id)
                ->whereDate('period_start', '2026-01-01')
                ->with('lineItems')
                ->firstOrFail();
            $firstCounts = $invoice->lineItems->countBy('line_type')->all();
            $firstTotal = (float) $invoice->invoice_total;

            $this->invoicingService->generateAllInvoices($this->company);
            $invoice = $invoice->fresh('lineItems');
            $secondCounts = $invoice->lineItems->countBy('line_type')->all();

            $this->assertSame($firstCounts, $secondCounts);
            $this->assertEquals($firstTotal, (float) $invoice->invoice_total);
            $this->assertSame(3, $secondCounts[InvoiceLineType::RecurringItem->value] ?? 0);
            $this->assertSame(1, $secondCounts[InvoiceLineType::Expense->value] ?? 0);
            $this->assertSame(1, $secondCounts[InvoiceLineType::Milestone->value] ?? 0);
            $this->assertSame(1, $secondCounts[InvoiceLineType::Credit->value] ?? 0);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_interim_overage_invoices_are_generated_and_reconciled_on_final_cycle_invoice(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-15'));

        try {
            $agreement = $this->createAgreement([
                'billing_cadence' => BillingCadence::Annual->value,
                'bill_overage_interim' => true,
                'monthly_retainer_hours' => 10,
                'monthly_retainer_fee' => 1000,
                'hourly_rate' => 100,
                'rollover_months' => 0,
                'active_date' => Carbon::parse('2026-01-01'),
            ]);

            $this->createTimeEntry('2026-01-10', 5);
            $this->createTimeEntry('2026-04-10', 20);
            $this->createTimeEntry('2026-09-10', 15);

            $results = $this->invoicingService->generateAllInvoices($this->company);

            $this->assertSame(2, $results['summary']['interim_invoices_created']);
            $this->assertSame(1, $results['summary']['cadence_period_invoices_created']);

            $interimInvoices = ClientInvoice::query()
                ->where('client_agreement_id', $agreement->id)
                ->where('invoice_kind', InvoiceKind::InterimOverage->value)
                ->with('lineItems')
                ->orderBy('period_start')
                ->get();

            $this->assertCount(2, $interimInvoices);
            $this->assertEquals('2026-04-01', $interimInvoices[0]->period_start->toDateString());
            $this->assertEquals(10.0, (float) $interimInvoices[0]->hours_billed_at_rate);
            $this->assertEquals(1000.0, (float) $interimInvoices[0]->invoice_total);
            $this->assertEquals('2026-09-01', $interimInvoices[1]->period_start->toDateString());
            $this->assertEquals(5.0, (float) $interimInvoices[1]->hours_billed_at_rate);
            $this->assertEquals(500.0, (float) $interimInvoices[1]->invoice_total);

            $cycleInvoice = ClientInvoice::query()
                ->where('client_agreement_id', $agreement->id)
                ->where('invoice_kind', InvoiceKind::CadencePeriod->value)
                ->with('lineItems')
                ->firstOrFail();

            $this->assertEquals(0.0, (float) $cycleInvoice->hours_billed_at_rate);

            $summaryLine = $cycleInvoice->lineItems->firstWhere(
                'description',
                'Already billed in this cycle via interim overage invoices',
            );
            $this->assertNotNull($summaryLine);
            $this->assertEquals(InvoiceLineType::Reconciliation->value, $summaryLine->line_type);
            $this->assertEquals(15.0, (float) $summaryLine->hours);
            $this->assertEquals(0.0, (float) $summaryLine->line_total);

            $this->assertSame(0, ClientTimeEntry::query()->whereNull('client_invoice_line_id')->count());
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_generate_interim_overage_endpoint_creates_overage_only_invoice(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-05-10'));

        try {
            $agreement = $this->createAgreement([
                'billing_cadence' => BillingCadence::Annual->value,
                'bill_overage_interim' => true,
                'monthly_retainer_hours' => 10,
                'hourly_rate' => 100,
                'rollover_months' => 0,
                'active_date' => Carbon::parse('2026-01-01'),
            ]);

            $this->createTimeEntry('2026-04-10', 20);

            $this->actingAs($this->admin)
                ->postJson("/api/client/mgmt/companies/{$this->company->id}/invoices/generate-interim/202604")
                ->assertCreated()
                ->assertJsonPath('invoice.invoice_kind', InvoiceKind::InterimOverage->value);

            $invoice = ClientInvoice::query()
                ->where('client_agreement_id', $agreement->id)
                ->where('invoice_kind', InvoiceKind::InterimOverage->value)
                ->firstOrFail();

            $this->assertEquals('2026-04-01', $invoice->period_start->toDateString());
            $this->assertEquals('2026-04-30', $invoice->period_end->toDateString());
            $this->assertEquals('2026-01-01', $invoice->cycle_start->toDateString());
            $this->assertEquals('2026-12-31', $invoice->cycle_end->toDateString());
            $this->assertEquals(10.0, (float) $invoice->hours_billed_at_rate);
            $this->assertEquals(1000.0, (float) $invoice->invoice_total);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_generate_interim_overage_rejects_non_immediate_excess_ledger(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-05-10'));

        try {
            $agreement = $this->createAgreement([
                'billing_cadence' => BillingCadence::Annual->value,
                'bill_overage_interim' => true,
                'monthly_retainer_hours' => 10,
                'hourly_rate' => 100,
                'rollover_months' => 0,
                'active_date' => Carbon::parse('2026-01-01'),
            ]);

            $this->createTimeEntry('2026-04-10', 20);

            $deferredExcessLedger = (new RolloverCalculator)->calculateMultipleMonths([
                [
                    'year_month' => '2026-04',
                    'retainer_hours' => 10.0,
                    'hours_worked' => 20.0,
                ],
            ], 0, false);

            $this->expectException(\LogicException::class);
            $this->expectExceptionMessage('Interim overage invoices require a ledger built with billExcessImmediately=true.');

            $this->invoicingService->generateInterimOverageInvoice(
                $this->company,
                Carbon::parse('2026-04-01'),
                $agreement,
                $deferredExcessLedger,
            );
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_voiding_interim_overage_invoice_releases_linked_time_entries(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-05-10'));

        try {
            $agreement = $this->createAgreement([
                'billing_cadence' => BillingCadence::Annual->value,
                'bill_overage_interim' => true,
                'monthly_retainer_hours' => 10,
                'hourly_rate' => 100,
                'rollover_months' => 0,
                'active_date' => Carbon::parse('2026-01-01'),
            ]);

            $this->createTimeEntry('2026-04-10', 20);

            $invoice = $this->invoicingService->generateInterimOverageInvoice(
                $this->company,
                Carbon::parse('2026-04-01'),
                $agreement,
            );

            $this->assertNotNull($invoice);
            $invoice->load('lineItems.timeEntries');
            $linkedIds = $invoice->lineItems->flatMap->timeEntries->pluck('id')->all();
            $this->assertNotEmpty($linkedIds);

            $invoice->void();

            $this->assertSame(
                count($linkedIds),
                ClientTimeEntry::query()
                    ->whereIn('id', $linkedIds)
                    ->whereNull('client_invoice_line_id')
                    ->count(),
            );
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_deferred_billing_entries_fit_into_cadence_period_remaining_capacity(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-03-15'));

        try {
            $agreement = $this->createAgreement([
                'billing_cadence' => BillingCadence::Quarterly->value,
                'monthly_retainer_hours' => 10,
                'monthly_retainer_fee' => 1000,
                'active_date' => Carbon::parse('2026-01-01'),
            ]);

            $deferred = $this->createTimeEntry('2026-02-10', 5);
            $deferred->update(['is_deferred_billing' => true]);

            $this->invoicingService->generateAllInvoices($this->company);

            $deferred->refresh();
            $this->assertNotNull($deferred->client_invoice_line_id);

            $invoice = ClientInvoice::query()
                ->where('client_agreement_id', $agreement->id)
                ->with('lineItems')
                ->firstOrFail();

            $deferredLine = $invoice->lineItems
                ->first(fn ($line): bool => str_starts_with((string) $line->description, 'Deferred work items applied to retainer'));

            $this->assertNotNull($deferredLine);
            $this->assertEquals(5.0, (float) $deferredLine->hours);
            $this->assertEquals(0.0, (float) $deferredLine->line_total);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_overpayment_credits_apply_to_interim_and_cadence_period_invoices(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-05-10'));

        try {
            $agreement = $this->createAgreement([
                'billing_cadence' => BillingCadence::Annual->value,
                'bill_overage_interim' => true,
                'monthly_retainer_hours' => 10,
                'monthly_retainer_fee' => 1000,
                'hourly_rate' => 100,
                'rollover_months' => 0,
                'active_date' => Carbon::parse('2026-01-01'),
            ]);

            $this->createPaidOverpaymentCredit(1500);
            $this->createTimeEntry('2026-04-10', 20);

            $interim = $this->invoicingService->generateInterimOverageInvoice(
                $this->company,
                Carbon::parse('2026-04-01'),
                $agreement,
            );
            $this->assertNotNull($interim);
            $interim->load('lineItems');

            $interimCreditLine = $interim->lineItems->firstWhere('line_type', InvoiceLineType::Credit->value);
            $this->assertNotNull($interimCreditLine);
            $this->assertEquals(-1000.0, (float) $interimCreditLine->line_total);
            $this->assertEquals(0.0, (float) $interim->invoice_total);
            $interim->issue();

            $cycleInvoice = $this->invoicingService->generateInvoice(
                $this->company,
                Carbon::parse('2026-01-01'),
                Carbon::parse('2026-12-31'),
                $agreement,
            );
            $cycleInvoice->load('lineItems');

            $cycleCreditLine = $cycleInvoice->lineItems->firstWhere('line_type', InvoiceLineType::Credit->value);
            $this->assertNotNull($cycleCreditLine);
            $this->assertEquals(-500.0, (float) $cycleCreditLine->line_total);
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

    public function test_ad_hoc_invoice_does_not_block_cadence_generation(): void
    {
        $agreement = $this->createAgreement([
            'billing_cadence' => BillingCadence::Quarterly->value,
            'active_date' => Carbon::parse('2026-01-01'),
        ]);

        // An ad-hoc invoice with dates fully inside the cadence cycle must not block cadence generation.
        ClientInvoice::create([
            'client_company_id' => $this->company->id,
            'client_agreement_id' => null,
            'period_start' => Carbon::parse('2026-02-01'),
            'period_end' => Carbon::parse('2026-02-28'),
            'invoice_number' => 'INV-ADHOC-OVERLAP',
            'invoice_total' => 190,
            'status' => 'issued',
            'invoice_kind' => InvoiceKind::AdHoc->value,
        ]);

        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::parse('2026-01-01'),
            Carbon::parse('2026-03-31'),
            $agreement,
        );

        $this->assertNotNull($invoice);
        $this->assertEquals(InvoiceKind::CadencePeriod, $invoice->invoice_kind);
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

    private function createPaidOverpaymentCredit(float $overpaidAmount): ClientInvoice
    {
        $invoice = ClientInvoice::create([
            'client_company_id' => $this->company->id,
            'client_agreement_id' => $this->createAgreement([
                'active_date' => Carbon::parse('2025-01-01'),
                'termination_date' => Carbon::parse('2025-12-31'),
            ])->id,
            'period_start' => Carbon::parse('2025-01-01'),
            'period_end' => Carbon::parse('2025-01-31'),
            'cycle_start' => Carbon::parse('2025-01-01'),
            'cycle_end' => Carbon::parse('2025-01-31'),
            'invoice_number' => 'INV-CREDIT-SEED',
            'invoice_total' => 100,
            'status' => 'issued',
            'invoice_kind' => InvoiceKind::CadencePeriod->value,
        ]);

        $invoice->payments()->create([
            'amount' => 100 + $overpaidAmount,
            'payment_date' => '2025-02-05',
            'payment_method' => 'Wire',
        ]);
        $invoice->markPaid('2025-02-05');

        return $invoice;
    }
}
