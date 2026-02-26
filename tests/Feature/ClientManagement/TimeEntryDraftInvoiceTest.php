<?php

namespace Tests\Feature\ClientManagement;

use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientInvoiceLine;
use App\Models\ClientManagement\ClientProject;
use App\Models\ClientManagement\ClientTimeEntry;
use App\Models\User;
use App\Services\ClientManagement\ClientInvoicingService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Tests for time entry interactions with draft (upcoming) invoices.
 *
 * Verifies:
 * - Entries on draft invoices can be edited/deleted
 * - Entries on issued/paid invoices cannot be edited/deleted
 * - Draft invoices are regenerated when time entries change
 * - Badge status distinguishes draft vs issued invoices
 * - Retainer line quantities are blank
 */
class TimeEntryDraftInvoiceTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private ClientCompany $company;
    private ClientAgreement $agreement;
    private ClientProject $project;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create(['user_role' => 'admin']);

        $this->company = ClientCompany::factory()->create([
            'company_name' => 'Test Company',
            'slug' => 'test-company',
        ]);

        $this->project = ClientProject::factory()->for($this->company)->create([
            'name' => 'Test Project',
            'slug' => 'test-project',
        ]);

        $this->agreement = ClientAgreement::factory()->for($this->company)->create([
            'agreement_text' => 'Standard Retainer',
            'monthly_retainer_fee' => 1000.00,
            'monthly_retainer_hours' => 10,
            'hourly_rate' => 150.00,
            'active_date' => Carbon::create(2024, 1, 1),
            'termination_date' => null,
            'rollover_months' => 3,
            'is_visible_to_client' => true,
        ]);

        $this->company->users()->attach($this->admin->id);
    }

    // ==========================================
    // Draft Invoice Editing Tests
    // ==========================================

    public function test_entry_on_draft_invoice_is_not_reported_as_invoiced(): void
    {
        // Create a time entry and an invoice
        $entry = ClientTimeEntry::create([
            'project_id' => $this->project->id,
            'client_company_id' => $this->company->id,
            'name' => 'Work item',
            'minutes_worked' => 90,
            'date_worked' => '2024-01-15',
            'user_id' => $this->admin->id,
            'creator_user_id' => $this->admin->id,
            'is_billable' => true,
            'job_type' => 'Software Development',
        ]);

        $invoicingService = app(ClientInvoicingService::class);
        $invoice = $invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $this->assertEquals('draft', $invoice->status);

        // Refresh entry
        $entry->refresh();

        // Entry should be linked to the invoice...
        $this->assertTrue($entry->isLinkedToInvoice());
        // ...but NOT reported as "invoiced" since the invoice is a draft
        $this->assertFalse($entry->isInvoiced());
        $this->assertFalse($entry->isOnIssuedInvoice());
    }

    public function test_entry_on_issued_invoice_is_reported_as_invoiced(): void
    {
        $entry = ClientTimeEntry::create([
            'project_id' => $this->project->id,
            'client_company_id' => $this->company->id,
            'name' => 'Work item',
            'minutes_worked' => 90,
            'date_worked' => '2024-01-15',
            'user_id' => $this->admin->id,
            'creator_user_id' => $this->admin->id,
            'is_billable' => true,
            'job_type' => 'Software Development',
        ]);

        $invoicingService = app(ClientInvoicingService::class);
        $invoice = $invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        // Issue the invoice
        $invoice->issue();

        $entry->refresh();

        $this->assertTrue($entry->isLinkedToInvoice());
        $this->assertTrue($entry->isInvoiced());
        $this->assertTrue($entry->isOnIssuedInvoice());
    }

    public function test_can_edit_time_entry_on_draft_invoice(): void
    {
        $this->actingAs($this->admin);

        $entry = ClientTimeEntry::create([
            'project_id' => $this->project->id,
            'client_company_id' => $this->company->id,
            'name' => 'Original work',
            'minutes_worked' => 90,
            'date_worked' => '2024-01-15',
            'user_id' => $this->admin->id,
            'creator_user_id' => $this->admin->id,
            'is_billable' => true,
            'job_type' => 'Software Development',
        ]);

        // Generate a draft invoice
        $invoicingService = app(ClientInvoicingService::class);
        $invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        // Verify entry is linked
        $entry->refresh();
        $this->assertTrue($entry->isLinkedToInvoice());

        // Should be able to update
        $response = $this->putJson("/api/client/portal/{$this->company->slug}/time-entries/{$entry->id}", [
            'name' => 'Updated work',
            'time' => '2:00',
        ]);

        $response->assertStatus(200);

        $entry->refresh();
        $this->assertEquals('Updated work', $entry->name);
        $this->assertEquals(120, $entry->minutes_worked);
    }

    public function test_cannot_edit_time_entry_on_issued_invoice(): void
    {
        $this->actingAs($this->admin);

        $entry = ClientTimeEntry::create([
            'project_id' => $this->project->id,
            'client_company_id' => $this->company->id,
            'name' => 'Original work',
            'minutes_worked' => 90,
            'date_worked' => '2024-01-15',
            'user_id' => $this->admin->id,
            'creator_user_id' => $this->admin->id,
            'is_billable' => true,
            'job_type' => 'Software Development',
        ]);

        $invoicingService = app(ClientInvoicingService::class);
        $invoice = $invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $invoice->issue();

        $response = $this->putJson("/api/client/portal/{$this->company->slug}/time-entries/{$entry->id}", [
            'name' => 'Updated work',
            'time' => '2:00',
        ]);

        $response->assertStatus(403);
    }

    public function test_can_delete_time_entry_on_draft_invoice(): void
    {
        $this->actingAs($this->admin);

        $entry = ClientTimeEntry::create([
            'project_id' => $this->project->id,
            'client_company_id' => $this->company->id,
            'name' => 'Work item',
            'minutes_worked' => 90,
            'date_worked' => '2024-01-15',
            'user_id' => $this->admin->id,
            'creator_user_id' => $this->admin->id,
            'is_billable' => true,
            'job_type' => 'Software Development',
        ]);

        $invoicingService = app(ClientInvoicingService::class);
        $invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $entry->refresh();
        $this->assertTrue($entry->isLinkedToInvoice());

        $response = $this->deleteJson("/api/client/portal/{$this->company->slug}/time-entries/{$entry->id}");
        $response->assertStatus(200);

        $this->assertSoftDeleted('client_time_entries', ['id' => $entry->id]);
    }

    public function test_cannot_delete_time_entry_on_issued_invoice(): void
    {
        $this->actingAs($this->admin);

        $entry = ClientTimeEntry::create([
            'project_id' => $this->project->id,
            'client_company_id' => $this->company->id,
            'name' => 'Work item',
            'minutes_worked' => 90,
            'date_worked' => '2024-01-15',
            'user_id' => $this->admin->id,
            'creator_user_id' => $this->admin->id,
            'is_billable' => true,
            'job_type' => 'Software Development',
        ]);

        $invoicingService = app(ClientInvoicingService::class);
        $invoice = $invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );
        $invoice->issue();

        $response = $this->deleteJson("/api/client/portal/{$this->company->slug}/time-entries/{$entry->id}");
        $response->assertStatus(403);
    }

    // ==========================================
    // Draft Invoice Regeneration Tests  
    // ==========================================

    public function test_draft_invoice_regenerated_on_time_entry_create(): void
    {
        $this->actingAs($this->admin);

        // First create a time entry and generate invoice
        ClientTimeEntry::create([
            'project_id' => $this->project->id,
            'client_company_id' => $this->company->id,
            'name' => 'First entry',
            'minutes_worked' => 60,
            'date_worked' => '2024-01-10',
            'user_id' => $this->admin->id,
            'creator_user_id' => $this->admin->id,
            'is_billable' => true,
            'job_type' => 'Software Development',
        ]);

        $invoicingService = app(ClientInvoicingService::class);
        $invoice = $invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $originalHoursWorked = $invoice->hours_worked;

        // Add another time entry via API (should trigger regeneration)
        $response = $this->postJson("/api/client/portal/{$this->company->slug}/time-entries", [
            'project_id' => $this->project->id,
            'time' => '2:00',
            'date_worked' => '2024-01-20',
            'name' => 'Second entry',
            'is_billable' => true,
            'job_type' => 'Software Development',
        ]);

        $response->assertStatus(201);

        // Invoice should have been regenerated with updated hours
        $invoice->refresh();
        $this->assertGreaterThan((float) $originalHoursWorked, (float) $invoice->hours_worked);
    }

    public function test_draft_invoice_regenerated_on_time_entry_update(): void
    {
        $this->actingAs($this->admin);

        $entry = ClientTimeEntry::create([
            'project_id' => $this->project->id,
            'client_company_id' => $this->company->id,
            'name' => 'Work item',
            'minutes_worked' => 60,
            'date_worked' => '2024-01-15',
            'user_id' => $this->admin->id,
            'creator_user_id' => $this->admin->id,
            'is_billable' => true,
            'job_type' => 'Software Development',
        ]);

        $invoicingService = app(ClientInvoicingService::class);
        $invoice = $invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $originalHoursWorked = $invoice->hours_worked;

        // Update time entry to more hours
        $response = $this->putJson("/api/client/portal/{$this->company->slug}/time-entries/{$entry->id}", [
            'time' => '5:00',
        ]);

        $response->assertStatus(200);

        $invoice->refresh();
        $this->assertGreaterThan((float) $originalHoursWorked, (float) $invoice->hours_worked);
    }

    public function test_draft_invoice_regenerated_on_time_entry_delete(): void
    {
        $this->actingAs($this->admin);

        $entry1 = ClientTimeEntry::create([
            'project_id' => $this->project->id,
            'client_company_id' => $this->company->id,
            'name' => 'First entry',
            'minutes_worked' => 120,
            'date_worked' => '2024-01-10',
            'user_id' => $this->admin->id,
            'creator_user_id' => $this->admin->id,
            'is_billable' => true,
            'job_type' => 'Software Development',
        ]);

        ClientTimeEntry::create([
            'project_id' => $this->project->id,
            'client_company_id' => $this->company->id,
            'name' => 'Second entry',
            'minutes_worked' => 60,
            'date_worked' => '2024-01-20',
            'user_id' => $this->admin->id,
            'creator_user_id' => $this->admin->id,
            'is_billable' => true,
            'job_type' => 'Software Development',
        ]);

        $invoicingService = app(ClientInvoicingService::class);
        $invoice = $invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $originalHoursWorked = (float) $invoice->hours_worked;

        // Delete one entry
        $response = $this->deleteJson("/api/client/portal/{$this->company->slug}/time-entries/{$entry1->id}");
        $response->assertStatus(200);

        $invoice->refresh();
        $this->assertLessThan($originalHoursWorked, (float) $invoice->hours_worked);
    }

    // ==========================================
    // Invoice Line Quantity Tests
    // ==========================================

    public function test_retainer_line_quantity_is_blank(): void
    {
        $entry = ClientTimeEntry::create([
            'project_id' => $this->project->id,
            'client_company_id' => $this->company->id,
            'name' => 'Work item',
            'minutes_worked' => 90,
            'date_worked' => '2024-01-15',
            'user_id' => $this->admin->id,
            'creator_user_id' => $this->admin->id,
            'is_billable' => true,
            'job_type' => 'Software Development',
        ]);

        $invoicingService = app(ClientInvoicingService::class);
        $invoice = $invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $retainerWorkLines = $invoice->lineItems->where('line_type', 'prior_month_retainer');
        foreach ($retainerWorkLines as $line) {
            $this->assertEquals('', $line->quantity, 'prior_month_retainer line quantity should be blank');
        }
    }

    // ==========================================
    // Time Entry API Response Tests
    // ==========================================

    public function test_time_entry_api_includes_invoice_status(): void
    {
        $this->actingAs($this->admin);

        ClientTimeEntry::create([
            'project_id' => $this->project->id,
            'client_company_id' => $this->company->id,
            'name' => 'Work item',
            'minutes_worked' => 90,
            'date_worked' => '2024-01-15',
            'user_id' => $this->admin->id,
            'creator_user_id' => $this->admin->id,
            'is_billable' => true,
            'job_type' => 'Software Development',
        ]);

        $invoicingService = app(ClientInvoicingService::class);
        $invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $response = $this->getJson("/api/client/portal/{$this->company->slug}/time-entries");
        $response->assertStatus(200);

        $entries = $response->json('entries');
        $invoicedEntry = collect($entries)->first(fn($e) => $e['client_invoice'] !== null);

        $this->assertNotNull($invoicedEntry, 'Should have an entry linked to invoice');
        $this->assertArrayHasKey('status', $invoicedEntry['client_invoice']);
        $this->assertEquals('draft', $invoicedEntry['client_invoice']['status']);

        // is_invoiced should be false for draft invoice
        $this->assertFalse($invoicedEntry['is_invoiced']);
    }
}
