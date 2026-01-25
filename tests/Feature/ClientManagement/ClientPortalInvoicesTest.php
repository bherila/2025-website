<?php

namespace Tests\Feature\ClientManagement;

use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class ClientPortalInvoicesTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $client;
    private ClientCompany $company;
    private ClientAgreement $agreement;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create(['user_role' => 'admin']);
        $this->client = User::factory()->create(['user_role' => 'user']);
        
        $this->company = ClientCompany::factory()->create([
            'company_name' => 'Test Company',
            'slug' => 'test-company'
        ]);
        
        $this->company->users()->attach($this->client);

        $this->agreement = ClientAgreement::create([
            'client_company_id' => $this->company->id,
            'active_date' => Carbon::now()->subMonth(),
            'agreement_text' => 'Test Agreement',
            'monthly_retainer_hours' => 10,
            'hourly_rate' => 150
        ]);
    }

    public function test_admin_can_see_draft_invoices_in_portal()
    {
        // Create a draft invoice
        ClientInvoice::create([
            'client_company_id' => $this->company->id,
            'client_agreement_id' => $this->agreement->id,
            'period_start' => Carbon::now()->startOfMonth(),
            'period_end' => Carbon::now()->endOfMonth(),
            'status' => 'draft',
            'invoice_number' => 'INV-001',
            'invoice_total' => 100.00
        ]);

        $response = $this->actingAs($this->admin)
            ->getJson("/api/client/portal/{$this->company->slug}/invoices");

        $response->assertStatus(200);
        $response->assertJsonCount(1);
        $response->assertJsonFragment(['status' => 'draft']);
    }

    public function test_client_cannot_see_draft_invoices_in_portal()
    {
        // Create a draft invoice
        ClientInvoice::create([
            'client_company_id' => $this->company->id,
            'client_agreement_id' => $this->agreement->id,
            'period_start' => Carbon::now()->startOfMonth(),
            'period_end' => Carbon::now()->endOfMonth(),
            'status' => 'draft',
            'invoice_number' => 'INV-001',
            'invoice_total' => 100.00
        ]);

        $response = $this->actingAs($this->client)
            ->getJson("/api/client/portal/{$this->company->slug}/invoices");

        $response->assertStatus(200);
        $response->assertJsonCount(0);
    }

    public function test_cache_is_role_specific()
    {
        // Create a draft invoice
        ClientInvoice::create([
            'client_company_id' => $this->company->id,
            'client_agreement_id' => $this->agreement->id,
            'period_start' => Carbon::now()->startOfMonth(),
            'period_end' => Carbon::now()->endOfMonth(),
            'status' => 'draft',
            'invoice_number' => 'INV-001',
            'invoice_total' => 100.00
        ]);

        // 1. Client visits first (populates cache with empty list)
        $response = $this->actingAs($this->client)
            ->getJson("/api/client/portal/{$this->company->slug}/invoices");
        $response->assertJsonCount(0);

        // 2. Admin visits (should see the draft invoice, but might get cached empty list if bug exists)
        $response = $this->actingAs($this->admin)
            ->getJson("/api/client/portal/{$this->company->slug}/invoices");
        
        $response->assertJsonCount(1);
    }
}