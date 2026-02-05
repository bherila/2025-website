<?php

namespace Tests\Unit\Services\ClientManagement;

use App\Models\ClientManagement\ClientTimeEntry;
use App\Services\ClientManagement\AllocationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AllocationServiceTest extends TestCase
{
    use RefreshDatabase;

    protected AllocationService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new AllocationService();
    }

    public function test_recombine_unlinked_fragments_merges_matching_entries(): void
    {
        $user = $this->createUser();
        $company = $this->createClientCompany();
        $project = $this->createClientProject($company->id);

        // Create three fragments with same merge keys, all unlinked
        ClientTimeEntry::create([
            'project_id' => $project->id,
            'client_company_id' => $company->id,
            'user_id' => $user->id,
            'name' => 'Task A',
            'minutes_worked' => 60,
            'date_worked' => '2024-01-15',
            'creator_user_id' => $user->id,
            'is_billable' => true,
            'client_invoice_line_id' => null,
        ]);

        ClientTimeEntry::create([
            'project_id' => $project->id,
            'client_company_id' => $company->id,
            'user_id' => $user->id,
            'name' => 'Task A',
            'minutes_worked' => 30,
            'date_worked' => '2024-01-15',
            'creator_user_id' => $user->id,
            'is_billable' => true,
            'client_invoice_line_id' => null,
        ]);

        ClientTimeEntry::create([
            'project_id' => $project->id,
            'client_company_id' => $company->id,
            'user_id' => $user->id,
            'name' => 'Task A',
            'minutes_worked' => 45,
            'date_worked' => '2024-01-15',
            'creator_user_id' => $user->id,
            'is_billable' => true,
            'client_invoice_line_id' => null,
        ]);

        $recombined = $this->service->recombineUnlinkedFragments($company->id);

        $this->assertEquals(2, $recombined); // 3 entries -> 1 entry (2 merged)
        $this->assertEquals(1, ClientTimeEntry::where('client_company_id', $company->id)->count());
        
        $merged = ClientTimeEntry::where('client_company_id', $company->id)->first();
        $this->assertEquals(135, $merged->minutes_worked); // 60 + 30 + 45
    }

    public function test_recombine_does_not_merge_linked_entries(): void
    {
        $user = $this->createUser();
        $company = $this->createClientCompany();
        $project = $this->createClientProject($company->id);

        // Create an invoice with a line for linking
        $invoice = \App\Models\ClientManagement\ClientInvoice::create([
            'client_company_id' => $company->id,
            'invoice_number' => 'TEST-001',
            'period_start' => '2024-01-01',
            'period_end' => '2024-01-31',
            'total' => 1000.00,
            'status' => 'draft',
        ]);
        $invoiceLine = \App\Models\ClientManagement\ClientInvoiceLine::create([
            'client_invoice_id' => $invoice->client_invoice_id,
            'line_type' => 'prior_month_retainer',
            'description' => 'Test line',
            'quantity' => 1.0,
            'unit_price' => 100.00,
            'line_total' => 100.00,
            'line_date' => '2024-01-15',
        ]);

        // Create two fragments, one linked
        ClientTimeEntry::create([
            'project_id' => $project->id,
            'client_company_id' => $company->id,
            'user_id' => $user->id,
            'name' => 'Task A',
            'minutes_worked' => 60,
            'date_worked' => '2024-01-15',
            'creator_user_id' => $user->id,
            'is_billable' => true,
            'client_invoice_line_id' => $invoiceLine->client_invoice_line_id,
        ]);

        ClientTimeEntry::create([
            'project_id' => $project->id,
            'client_company_id' => $company->id,
            'user_id' => $user->id,
            'name' => 'Task A',
            'minutes_worked' => 30,
            'date_worked' => '2024-01-15',
            'creator_user_id' => $user->id,
            'is_billable' => true,
            'client_invoice_line_id' => null,
        ]);

        $recombined = $this->service->recombineUnlinkedFragments($company->id);

        $this->assertEquals(0, $recombined);
        $this->assertEquals(2, ClientTimeEntry::where('client_company_id', $company->id)->count());
    }

    public function test_recombine_does_not_merge_different_dates(): void
    {
        $user = $this->createUser();
        $company = $this->createClientCompany();
        $project = $this->createClientProject($company->id);

        ClientTimeEntry::create([
            'project_id' => $project->id,
            'client_company_id' => $company->id,
            'user_id' => $user->id,
            'name' => 'Task A',
            'minutes_worked' => 60,
            'date_worked' => '2024-01-15',
            'creator_user_id' => $user->id,
            'is_billable' => true,
            'client_invoice_line_id' => null,
        ]);

        ClientTimeEntry::create([
            'project_id' => $project->id,
            'client_company_id' => $company->id,
            'user_id' => $user->id,
            'name' => 'Task A',
            'minutes_worked' => 30,
            'date_worked' => '2024-01-16', // Different date
            'creator_user_id' => $user->id,
            'is_billable' => true,
            'client_invoice_line_id' => null,
        ]);

        $recombined = $this->service->recombineUnlinkedFragments($company->id);

        $this->assertEquals(0, $recombined);
        $this->assertEquals(2, ClientTimeEntry::where('client_company_id', $company->id)->count());
    }

    public function test_recombine_does_not_merge_different_users(): void
    {
        $user1 = $this->createUser();
        $user2 = $this->createUser();
        $company = $this->createClientCompany();
        $project = $this->createClientProject($company->id);

        ClientTimeEntry::create([
            'project_id' => $project->id,
            'client_company_id' => $company->id,
            'user_id' => $user1->id,
            'name' => 'Task A',
            'minutes_worked' => 60,
            'date_worked' => '2024-01-15',
            'creator_user_id' => $user1->id,
            'is_billable' => true,
            'client_invoice_line_id' => null,
        ]);

        ClientTimeEntry::create([
            'project_id' => $project->id,
            'client_company_id' => $company->id,
            'user_id' => $user2->id, // Different user
            'name' => 'Task A',
            'minutes_worked' => 30,
            'date_worked' => '2024-01-15',
            'creator_user_id' => $user2->id,
            'is_billable' => true,
            'client_invoice_line_id' => null,
        ]);

        $recombined = $this->service->recombineUnlinkedFragments($company->id);

        $this->assertEquals(0, $recombined);
        $this->assertEquals(2, ClientTimeEntry::where('client_company_id', $company->id)->count());
    }

    public function test_recombine_does_not_merge_different_descriptions(): void
    {
        $user = $this->createUser();
        $company = $this->createClientCompany();
        $project = $this->createClientProject($company->id);

        ClientTimeEntry::create([
            'project_id' => $project->id,
            'client_company_id' => $company->id,
            'user_id' => $user->id,
            'name' => 'Task A',
            'minutes_worked' => 60,
            'date_worked' => '2024-01-15',
            'creator_user_id' => $user->id,
            'is_billable' => true,
            'client_invoice_line_id' => null,
        ]);

        ClientTimeEntry::create([
            'project_id' => $project->id,
            'client_company_id' => $company->id,
            'user_id' => $user->id,
            'name' => 'Task B', // Different description
            'minutes_worked' => 30,
            'date_worked' => '2024-01-15',
            'creator_user_id' => $user->id,
            'is_billable' => true,
            'client_invoice_line_id' => null,
        ]);

        $recombined = $this->service->recombineUnlinkedFragments($company->id);

        $this->assertEquals(0, $recombined);
        $this->assertEquals(2, ClientTimeEntry::where('client_company_id', $company->id)->count());
    }

    public function test_recombine_handles_multiple_groups(): void
    {
        $user = $this->createUser();
        $company = $this->createClientCompany();
        $project = $this->createClientProject($company->id);

        // Group 1: Task A on 2024-01-15
        ClientTimeEntry::create([
            'project_id' => $project->id,
            'client_company_id' => $company->id,
            'user_id' => $user->id,
            'name' => 'Task A',
            'minutes_worked' => 60,
            'date_worked' => '2024-01-15',
            'creator_user_id' => $user->id,
            'is_billable' => true,
            'client_invoice_line_id' => null,
        ]);

        ClientTimeEntry::create([
            'project_id' => $project->id,
            'client_company_id' => $company->id,
            'user_id' => $user->id,
            'name' => 'Task A',
            'minutes_worked' => 30,
            'date_worked' => '2024-01-15',
            'creator_user_id' => $user->id,
            'is_billable' => true,
            'client_invoice_line_id' => null,
        ]);

        // Group 2: Task B on 2024-01-16
        ClientTimeEntry::create([
            'project_id' => $project->id,
            'client_company_id' => $company->id,
            'user_id' => $user->id,
            'name' => 'Task B',
            'minutes_worked' => 45,
            'date_worked' => '2024-01-16',
            'creator_user_id' => $user->id,
            'is_billable' => true,
            'client_invoice_line_id' => null,
        ]);

        ClientTimeEntry::create([
            'project_id' => $project->id,
            'client_company_id' => $company->id,
            'user_id' => $user->id,
            'name' => 'Task B',
            'minutes_worked' => 15,
            'date_worked' => '2024-01-16',
            'creator_user_id' => $user->id,
            'is_billable' => true,
            'client_invoice_line_id' => null,
        ]);

        $recombined = $this->service->recombineUnlinkedFragments($company->id);

        $this->assertEquals(2, $recombined); // 4 entries -> 2 entries (2 merges)
        $this->assertEquals(2, ClientTimeEntry::where('client_company_id', $company->id)->count());
        
        $taskA = ClientTimeEntry::where('client_company_id', $company->id)
            ->where('name', 'Task A')
            ->first();
        $this->assertEquals(90, $taskA->minutes_worked);
        
        $taskB = ClientTimeEntry::where('client_company_id', $company->id)
            ->where('name', 'Task B')
            ->first();
        $this->assertEquals(60, $taskB->minutes_worked);
    }

    public function test_recombine_keeps_lowest_id(): void
    {
        $user = $this->createUser();
        $company = $this->createClientCompany();
        $project = $this->createClientProject($company->id);

        $entry1 = ClientTimeEntry::create([
            'project_id' => $project->id,
            'client_company_id' => $company->id,
            'user_id' => $user->id,
            'name' => 'Task A',
            'minutes_worked' => 60,
            'date_worked' => '2024-01-15',
            'creator_user_id' => $user->id,
            'is_billable' => true,
            'client_invoice_line_id' => null,
        ]);

        ClientTimeEntry::create([
            'project_id' => $project->id,
            'client_company_id' => $company->id,
            'user_id' => $user->id,
            'name' => 'Task A',
            'minutes_worked' => 30,
            'date_worked' => '2024-01-15',
            'creator_user_id' => $user->id,
            'is_billable' => true,
            'client_invoice_line_id' => null,
        ]);

        $this->service->recombineUnlinkedFragments($company->id);

        $merged = ClientTimeEntry::where('client_company_id', $company->id)->first();
        $this->assertEquals($entry1->id, $merged->id);
    }

    public function test_recombine_only_affects_specified_company(): void
    {
        $user = $this->createUser();
        $company1 = $this->createClientCompany();
        $project1 = $this->createClientProject($company1->id);
        $company2 = $this->createClientCompany();
        $project2 = $this->createClientProject($company2->id);

        // Company 1: Two matching entries
        ClientTimeEntry::create([
            'project_id' => $project1->id,
            'client_company_id' => $company1->id,
            'user_id' => $user->id,
            'name' => 'Task A',
            'minutes_worked' => 60,
            'date_worked' => '2024-01-15',
            'creator_user_id' => $user->id,
            'is_billable' => true,
            'client_invoice_line_id' => null,
        ]);

        ClientTimeEntry::create([
            'project_id' => $project1->id,
            'client_company_id' => $company1->id,
            'user_id' => $user->id,
            'name' => 'Task A',
            'minutes_worked' => 30,
            'date_worked' => '2024-01-15',
            'creator_user_id' => $user->id,
            'is_billable' => true,
            'client_invoice_line_id' => null,
        ]);

        // Company 2: One entry
        ClientTimeEntry::create([
            'project_id' => $project2->id,
            'client_company_id' => $company2->id,
            'user_id' => $user->id,
            'name' => 'Task A',
            'minutes_worked' => 45,
            'date_worked' => '2024-01-15',
            'creator_user_id' => $user->id,
            'is_billable' => true,
            'client_invoice_line_id' => null,
        ]);

        $recombined = $this->service->recombineUnlinkedFragments($company1->id);

        $this->assertEquals(1, $recombined);
        $this->assertEquals(1, ClientTimeEntry::where('client_company_id', $company1->id)->count());
        $this->assertEquals(1, ClientTimeEntry::where('client_company_id', $company2->id)->count());
    }

    protected function createClientCompany()
    {
        return \App\Models\ClientManagement\ClientCompany::factory()->create();
    }

    protected function createClientProject(int $companyId)
    {
        return \App\Models\ClientManagement\ClientProject::factory()->create([
            'client_company_id' => $companyId,
        ]);
    }
}
