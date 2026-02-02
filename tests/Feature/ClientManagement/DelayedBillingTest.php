<?php

namespace Tests\Feature\ClientManagement;

use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientProject;
use App\Models\ClientManagement\ClientTimeEntry;
use App\Models\User;
use App\Services\ClientManagement\ClientInvoicingService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Feature tests for delayed billing functionality.
 *
 * With the prior-month billing model:
 * - Invoice for month M bills work from month M-1
 * - Time entries from before the agreement are billed as "prior_month_billable" at hourly rate
 * - Once an agreement is active, prior month work is covered by retainer if within limits
 */
class DelayedBillingTest extends TestCase
{
    use RefreshDatabase;

    private ClientInvoicingService $invoicingService;

    private User $user;

    private ClientCompany $company;

    private ClientProject $project;

    protected function setUp(): void
    {
        parent::setUp();

        $this->invoicingService = app(ClientInvoicingService::class);

        // Create a user
        $this->user = User::factory()->create();

        // Create a company
        $this->company = ClientCompany::create([
            'company_name' => 'Test Company',
            'slug' => 'test-company',
        ]);

        // Create a project
        $this->project = ClientProject::create([
            'client_company_id' => $this->company->id,
            'name' => 'Test Project',
            'slug' => 'test-project',
        ]);
    }

    public function test_invoice_includes_delayed_billing_entries_from_periods_without_agreement(): void
    {
        // Create time entries in January 2024 (before agreement)
        ClientTimeEntry::create([
            'client_company_id' => $this->company->id,
            'project_id' => $this->project->id,
            'user_id' => $this->user->id,
            'date_worked' => Carbon::create(2024, 1, 15),
            'minutes_worked' => 120, // 2 hours
            'name' => 'Pre-agreement work 1',
            'is_billable' => true,
        ]);

        ClientTimeEntry::create([
            'client_company_id' => $this->company->id,
            'project_id' => $this->project->id,
            'user_id' => $this->user->id,
            'date_worked' => Carbon::create(2024, 1, 20),
            'minutes_worked' => 180, // 3 hours
            'name' => 'Pre-agreement work 2',
            'is_billable' => true,
        ]);

        // Create agreement starting February 2024
        $agreement = ClientAgreement::create([
            'client_company_id' => $this->company->id,
            'agreement_name' => 'Standard Retainer',
            'monthly_retainer_fee' => 1000.00,
            'monthly_retainer_hours' => 10,
            'hourly_rate' => 150.00,
            'active_date' => Carbon::create(2024, 2, 1),
            'termination_date' => null,
            'rollover_months' => 3,
            'is_active' => true,
        ]);

        // Generate invoice for February
        // With prior-month billing model (User Request Update):
        // - Prior month (January) had NO retainer (agreement started Feb)
        // - BUT January entries (5 hours) are retroactively covered by the agreement's logic
        // - They appear as "prior_month_retainer" at $0
        // - Retainer line for February = $1000
        // - Total = $1000
        $periodStart = Carbon::create(2024, 2, 1);
        $periodEnd = Carbon::create(2024, 2, 29);

        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            $periodStart,
            $periodEnd
        );

        // Assert invoice was created
        $this->assertNotNull($invoice);

        // Refresh to get line items
        $invoice->refresh();
        $lineItems = $invoice->lineItems;

        // Should NOT be billed as prior_month_billable
        $billableLine = $lineItems->firstWhere('line_type', 'prior_month_billable');
        $this->assertNull($billableLine, 'Should NOT have prior_month_billable line (retroactively covered)');

        // Should be covered by retainer logic (prior_month_retainer)
        $priorRetainerLine = $lineItems->firstWhere('line_type', 'prior_month_retainer');
        $this->assertNotNull($priorRetainerLine, 'Should have prior_month_retainer line');
        $this->assertEquals(5, (float) $priorRetainerLine->hours);
        $this->assertEquals(0, (float) $priorRetainerLine->line_total);

        $retainerLine = $lineItems->firstWhere('line_type', 'retainer');
        $this->assertNotNull($retainerLine);

        // Verify invoice totals
        $this->assertEquals(5, (float) $invoice->hours_worked);
        $this->assertEquals(1000.00, (float) $invoice->invoice_total); // Just retainer

        // Verify all time entries from January are now linked
        $linkedEntries = ClientTimeEntry::where('client_company_id', $this->company->id)
            ->whereBetween('date_worked', [Carbon::create(2024, 1, 1), Carbon::create(2024, 1, 31)])
            ->whereNotNull('client_invoice_line_id')
            ->count();
        $this->assertEquals(2, $linkedEntries, 'All 2 January entries should be linked to invoice lines');
    }

    public function test_invoice_includes_delayed_billing_information(): void
    {
        // Create pre-agreement time entry
        ClientTimeEntry::create([
            'client_company_id' => $this->company->id,
            'project_id' => $this->project->id,
            'user_id' => $this->user->id,
            'date_worked' => Carbon::create(2024, 1, 15),
            'minutes_worked' => 240, // 4 hours
            'name' => 'Pre-agreement work',
            'is_billable' => true,
        ]);

        // Create active agreement
        $agreement = ClientAgreement::create([
            'client_company_id' => $this->company->id,
            'agreement_name' => 'Standard Retainer',
            'monthly_retainer_fee' => 1000.00,
            'monthly_retainer_hours' => 10,
            'hourly_rate' => 100.00,
            'active_date' => Carbon::create(2024, 2, 1),
            'termination_date' => null,
            'rollover_months' => 3,
            'is_active' => true,
        ]);

        // Generate invoice for February
        // With prior-month billing (Revised):
        // - January (no retainer) has 4 hours
        // - These are retroactively covered by Feb agreement -> $0 line
        // - Retainer for February = $1000
        // - Total = $1000
        // - Balance logic should show negative balance carry forward?
        //   Dec/Jan: 4h worked. 0h available. -4h balance.
        //   Feb: 10h retainer. 0h worked. 10h available.
        //   Feb opening: applies -4h offset. 6h remaining.

        $periodStart = Carbon::create(2024, 2, 1);
        $periodEnd = Carbon::create(2024, 2, 29);

        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            $periodStart,
            $periodEnd
        );

        // Check for prior_month_billable line (Should NOT exist)
        $billableLine = $invoice->lineItems()
            ->where('line_type', 'prior_month_billable')
            ->first();

        $this->assertNull($billableLine, 'Should NOT have prior_month_billable line');

        // Should have prior_month_retainer
        $retainerWorkLine = $invoice->lineItems()
            ->where('line_type', 'prior_month_retainer')
            ->first();
        $this->assertNotNull($retainerWorkLine);
        $this->assertEquals(4, (float) $retainerWorkLine->hours);
        $this->assertEquals(0, (float) $retainerWorkLine->line_total);

        // Check invoice total
        $this->assertEquals(1000.00, (float) $invoice->invoice_total); // Just retainer
        $this->assertEquals(4, (float) $invoice->hours_worked);
    }

    public function test_non_billable_entries_are_not_included_in_delayed_billing(): void
    {
        // Create non-billable pre-agreement time entry
        ClientTimeEntry::create([
            'client_company_id' => $this->company->id,
            'project_id' => $this->project->id,
            'user_id' => $this->user->id,
            'date_worked' => Carbon::create(2024, 1, 15),
            'minutes_worked' => 120,
            'name' => 'Non-billable work',
            'is_billable' => false, // Not billable
        ]);

        // Create active agreement
        $agreement = ClientAgreement::create([
            'client_company_id' => $this->company->id,
            'agreement_name' => 'Standard Retainer',
            'monthly_retainer_fee' => 1000.00,
            'monthly_retainer_hours' => 10,
            'hourly_rate' => 100.00,
            'active_date' => Carbon::create(2024, 2, 1),
            'termination_date' => null,
            'rollover_months' => 3,
            'is_active' => true,
        ]);

        // Generate invoice
        $periodStart = Carbon::create(2024, 2, 1);
        $periodEnd = Carbon::create(2024, 2, 29);

        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            $periodStart,
            $periodEnd
        );

        // No delayed billing since entry is non-billable (check line items)
        $delayedBillingLine = $invoice->lineItems()
            ->where('description', 'LIKE', '%Prior Period%')
            ->first();

        $this->assertNull($delayedBillingLine, 'Invoice should not include delayed billing for non-billable entries');
        $this->assertEquals(1000.00, $invoice->invoice_total); // Just retainer
    }

    public function test_already_invoiced_entries_are_not_included_in_delayed_billing(): void
    {
        // Create active agreement (needs to exist first)
        $agreement = ClientAgreement::create([
            'client_company_id' => $this->company->id,
            'agreement_name' => 'Standard Retainer',
            'monthly_retainer_fee' => 1000.00,
            'monthly_retainer_hours' => 10,
            'hourly_rate' => 100.00,
            'active_date' => Carbon::create(2024, 1, 1), // Earlier start
            'termination_date' => null,
            'rollover_months' => 3,
            'is_active' => true,
        ]);

        // Create time entry for January
        ClientTimeEntry::create([
            'client_company_id' => $this->company->id,
            'project_id' => $this->project->id,
            'user_id' => $this->user->id,
            'date_worked' => Carbon::create(2024, 1, 15),
            'minutes_worked' => 120,
            'name' => 'January work',
            'is_billable' => true,
        ]);

        // Generate January invoice (this will link the time entry)
        $januaryInvoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        // Generate February invoice
        $februaryInvoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
        );

        // No delayed billing since January entry was already invoiced
        $delayedBillingLine = $februaryInvoice->lineItems()
            ->where('description', 'LIKE', '%Prior Period%')
            ->first();

        $this->assertNull($delayedBillingLine, 'Invoice should not include delayed billing for already-invoiced entries');
    }

    public function test_api_endpoint_shows_unbilled_hours_for_periods_without_agreement(): void
    {
        // Create time entry before agreement
        ClientTimeEntry::create([
            'client_company_id' => $this->company->id,
            'project_id' => $this->project->id,
            'user_id' => $this->user->id,
            'date_worked' => Carbon::create(2024, 1, 15),
            'minutes_worked' => 180, // 3 hours
            'name' => 'Pre-agreement work',
            'is_billable' => true,
        ]);

        // Add user as member of the company
        $this->company->users()->attach($this->user->id);

        // Login as user
        $this->actingAs($this->user);

        // Make API call to get time entries
        $response = $this->getJson("/api/client/portal/{$this->company->slug}/time-entries");

        $response->assertOk();

        $data = $response->json();

        // Should show total unbilled hours
        $this->assertArrayHasKey('total_unbilled_hours', $data);
        $this->assertEquals(3, $data['total_unbilled_hours']);

        // The monthly_data should show unbilled_hours for the period without agreement
        $this->assertNotEmpty($data['monthly_data']);
        $januaryMonth = collect($data['monthly_data'])->firstWhere('year_month', '2024-01');
        $this->assertNotNull($januaryMonth);
        $this->assertEquals(3, $januaryMonth['unbilled_hours']);
    }
}
