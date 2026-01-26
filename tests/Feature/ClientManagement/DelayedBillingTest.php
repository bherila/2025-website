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
 * Delayed billing allows billable time entries created during periods
 * without an active agreement to be billed when an agreement becomes active.
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
            'start_date' => Carbon::create(2024, 2, 1),
            'end_date' => null,
            'rollover_months' => 3,
            'is_active' => true,
        ]);

        // Create time entry for February (during agreement)
        ClientTimeEntry::create([
            'client_company_id' => $this->company->id,
            'project_id' => $this->project->id,
            'user_id' => $this->user->id,
            'date_worked' => Carbon::create(2024, 2, 15),
            'minutes_worked' => 300, // 5 hours
            'name' => 'February work',
            'is_billable' => true,
        ]);

        // Generate invoice for February
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

        // With the merged logic:
        // Total billable hours = 5 (Feb) + 2 (Jan 15) + 3 (Jan 20) = 10 hours.
        // Retainer covers 10 hours.
        // So the Retainer line should cover everything. No separate line for delayed billing.
        
        $retainerLine = $lineItems->firstWhere('line_type', 'retainer');
        $this->assertNotNull($retainerLine);
        
        // Verify invoice totals
        $this->assertEquals(10, $invoice->hours_worked); // 5 current + 5 delayed
        $this->assertEquals(1000.00, $invoice->invoice_total); // Covered by retainer

        // Verify all time entries are now linked
        $unbilledEntries = ClientTimeEntry::where('client_company_id', $this->company->id)
            ->whereNull('client_invoice_line_id')
            ->count();
        $this->assertEquals(0, $unbilledEntries, 'All time entries should be linked to invoice lines');
        
        // Verify entries are linked to the retainer line
        $linkedToRetainer = ClientTimeEntry::where('client_invoice_line_id', $retainerLine->client_invoice_line_id)->count();
        $this->assertEquals(3, $linkedToRetainer, 'All 3 entries should be linked to retainer line');
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
            'start_date' => Carbon::create(2024, 2, 1),
            'end_date' => null,
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

        // With merged logic: 4 hours delayed work is absorbed by the 10h retainer.
        // No separate delayed billing line item.
        $delayedBillingLine = $invoice->lineItems()
            ->where('description', 'LIKE', '%Prior Period%')
            ->first();

        $this->assertNull($delayedBillingLine, 'Invoice should absorb delayed billing into retainer if space allows');

        // Check invoice total is just the retainer
        // Retainer: $1000 (covers the 4 hours)
        $this->assertEquals(1000.00, $invoice->invoice_total);
        $this->assertEquals(4, $invoice->hours_worked);
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
            'start_date' => Carbon::create(2024, 2, 1),
            'end_date' => null,
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
            'start_date' => Carbon::create(2024, 1, 1), // Earlier start
            'end_date' => null,
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
