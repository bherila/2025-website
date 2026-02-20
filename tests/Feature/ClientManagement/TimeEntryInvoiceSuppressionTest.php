<?php

namespace Tests\Feature\ClientManagement;

use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientProject;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TimeEntryInvoiceSuppressionTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private ClientCompany $company;
    private ClientProject $project;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create(['user_role' => 'admin']);
        
        $this->company = ClientCompany::create([
            'company_name' => 'Test Company',
            'slug' => 'test-company',
        ]);

        $this->project = ClientProject::create([
            'client_company_id' => $this->company->id,
            'name' => 'Test Project',
            'slug' => 'test-project',
        ]);

        // Create an agreement
        ClientAgreement::create([
            'client_company_id' => $this->company->id,
            'agreement_name' => 'Standard Retainer',
            'monthly_retainer_fee' => 1000.00,
            'monthly_retainer_hours' => 10,
            'hourly_rate' => 150.00,
            'active_date' => Carbon::create(2024, 1, 1),
            'is_active' => true,
        ]);
        
        // Add admin to company users
        $this->company->users()->attach($this->admin->id);
    }

    /**
     * Test that recording a time entry does not automatically create an invoice.
     */
    public function test_creating_time_entry_does_not_generate_invoice(): void
    {
        $this->actingAs($this->admin);

        // Ensure no invoices exist
        $this->assertEquals(0, ClientInvoice::count());

        $dateWorked = '2024-01-15';
        
        $response = $this->postJson("/api/client/portal/{$this->company->slug}/time-entries", [
            'project_id' => $this->project->id,
            'time' => '1:30',
            'date_worked' => $dateWorked,
            'name' => 'Work entry',
            'is_billable' => true,
            'job_type' => 'Software Development',
        ]);

        $response->assertStatus(201);

        // Verify time entry was created
        $this->assertDatabaseHas('client_time_entries', [
            'client_company_id' => $this->company->id,
            'date_worked' => $dateWorked . ' 00:00:00',
        ]);

        // CRITICAL: Verify NO invoice was created
        $this->assertEquals(0, ClientInvoice::count(), 'An invoice was automatically created when it should not have been.');
    }
}
