<?php

namespace Tests\Feature\ClientManagement;

use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientInvoicePayment;
use App\Models\ClientManagement\ClientProject;
use App\Models\ClientManagement\ClientTask;
use App\Models\ClientManagement\ClientTimeEntry;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ClientCompanyApiControllerTest extends TestCase
{
    public function test_admin_can_fetch_company_list_with_billing_summary(): void
    {
        $admin = $this->createAdminUser();
        $clientUser = $this->createUser([
            'name' => 'Client User',
            'email' => 'client@example.com',
            'last_login_date' => Carbon::create(2026, 5, 1, 9, 30),
        ]);

        $company = ClientCompany::factory()->create([
            'company_name' => 'Acme Consulting',
            'slug' => 'acme-consulting',
            'is_active' => true,
        ]);
        $company->users()->attach($clientUser->id);

        $project = ClientProject::factory()->create([
            'client_company_id' => $company->id,
            'creator_user_id' => $admin->id,
            'slug' => 'acme-project',
        ]);

        ClientTimeEntry::factory()->create([
            'project_id' => $project->id,
            'client_company_id' => $company->id,
            'minutes_worked' => 90,
            'is_billable' => true,
            'client_invoice_line_id' => null,
            'user_id' => $admin->id,
            'creator_user_id' => $admin->id,
        ]);
        ClientTimeEntry::factory()->create([
            'project_id' => $project->id,
            'client_company_id' => $company->id,
            'minutes_worked' => 60,
            'is_billable' => false,
            'client_invoice_line_id' => null,
            'user_id' => $admin->id,
            'creator_user_id' => $admin->id,
        ]);

        ClientTask::create([
            'project_id' => $project->id,
            'name' => 'Completed milestone',
            'milestone_price' => 1000,
            'completed_at' => Carbon::create(2026, 5, 2),
            'creator_user_id' => $admin->id,
        ]);
        ClientTask::create([
            'project_id' => $project->id,
            'name' => 'Incomplete milestone',
            'milestone_price' => 250,
            'creator_user_id' => $admin->id,
        ]);
        ClientTask::create([
            'project_id' => $project->id,
            'name' => 'Zero dollar task',
            'milestone_price' => 0,
            'creator_user_id' => $admin->id,
        ]);

        $partiallyPaidInvoice = $this->createInvoice($company, [
            'invoice_number' => 'INV-001',
            'invoice_total' => 500,
            'status' => 'issued',
            'due_date' => Carbon::create(2026, 5, 10),
        ]);
        ClientInvoicePayment::create([
            'client_invoice_id' => $partiallyPaidInvoice->client_invoice_id,
            'amount' => 125,
            'payment_date' => Carbon::create(2026, 5, 4),
            'payment_method' => 'ACH',
        ]);

        $fullyPaidIssuedInvoice = $this->createInvoice($company, [
            'invoice_number' => 'INV-002',
            'invoice_total' => 100,
            'status' => 'issued',
        ]);
        ClientInvoicePayment::create([
            'client_invoice_id' => $fullyPaidIssuedInvoice->client_invoice_id,
            'amount' => 100,
            'payment_date' => Carbon::create(2026, 5, 5),
            'payment_method' => 'ACH',
        ]);

        $this->createInvoice($company, [
            'invoice_number' => 'INV-PAID',
            'invoice_total' => 800,
            'status' => 'paid',
        ]);
        $this->createInvoice($company, [
            'invoice_number' => 'INV-VOID',
            'invoice_total' => 600,
            'status' => 'void',
        ]);

        $response = $this
            ->actingAs($admin)
            ->getJson('/api/client/mgmt/companies');

        $response
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonStructure([
                [
                    'id',
                    'company_name',
                    'slug',
                    'is_active',
                    'stripe_billing_enabled',
                    'created_at',
                    'users' => [
                        [
                            'id',
                            'name',
                            'email',
                            'user_role',
                            'last_login_date',
                        ],
                    ],
                    'total_balance_due',
                    'uninvoiced_hours',
                    'uninvoiced_task_total',
                    'uninvoiced_task_complete_total',
                    'uninvoiced_task_incomplete_total',
                    'lifetime_value',
                    'unpaid_invoices' => [
                        [
                            'client_invoice_id',
                            'invoice_number',
                            'invoice_total',
                            'issue_date',
                            'due_date',
                            'status',
                            'remaining_balance',
                        ],
                    ],
                ],
            ]);

        $payload = $response->json();
        $companyPayload = $payload[0];

        $this->assertSame('Acme Consulting', $companyPayload['company_name']);
        $this->assertTrue($companyPayload['stripe_billing_enabled']);
        $this->assertSame('Client User', $companyPayload['users'][0]['name']);
        $this->assertArrayNotHasKey('password', $companyPayload['users'][0]);
        $this->assertEquals(375, $companyPayload['total_balance_due']);
        $this->assertEquals(1.5, $companyPayload['uninvoiced_hours']);
        $this->assertEquals(1250, $companyPayload['uninvoiced_task_total']);
        $this->assertEquals(1000, $companyPayload['uninvoiced_task_complete_total']);
        $this->assertEquals(250, $companyPayload['uninvoiced_task_incomplete_total']);
        $this->assertEquals(800, $companyPayload['lifetime_value']);
        $this->assertCount(1, $companyPayload['unpaid_invoices']);
        $this->assertSame('INV-001', $companyPayload['unpaid_invoices'][0]['invoice_number']);
        $this->assertEquals(375, $companyPayload['unpaid_invoices'][0]['remaining_balance']);
        $this->assertArrayNotHasKey('payments', $companyPayload['unpaid_invoices'][0]);
    }

    public function test_non_admin_cannot_fetch_company_list(): void
    {
        $this->createAdminUser();

        $this
            ->actingAs($this->createUser())
            ->getJson('/api/client/mgmt/companies')
            ->assertForbidden();
    }

    public function test_admin_can_fetch_company_list_when_agreement_has_quoted_legacy_semi_annual_value(): void
    {
        $admin = $this->createAdminUser();
        $company = ClientCompany::factory()->create();
        $agreement = ClientAgreement::factory()->for($company)->create([
            'billing_cadence' => 'monthly',
        ]);

        DB::table('client_agreements')
            ->where('id', $agreement->id)
            ->update([
                'billing_cadence' => '"semi_annual"',
            ]);

        $this
            ->actingAs($admin)
            ->getJson('/api/client/mgmt/companies')
            ->assertOk()
            ->assertJsonPath('0.current_billing_cadence', 'semi_annual');
    }

    public function test_admin_can_fetch_company_detail_with_agreements(): void
    {
        $admin = $this->createAdminUser();
        $clientUser = $this->createUser([
            'name' => 'Client User',
            'email' => 'client@example.com',
        ]);
        $company = ClientCompany::factory()->create([
            'company_name' => 'Acme Consulting',
            'slug' => 'acme-consulting',
            'stripe_billing_enabled' => false,
        ]);
        $company->users()->attach($clientUser->id);

        ClientAgreement::factory()->for($company)->create([
            'active_date' => Carbon::create(2026, 5, 1),
            'monthly_retainer_hours' => 10,
            'monthly_retainer_fee' => 1000,
        ]);

        $response = $this
            ->actingAs($admin)
            ->getJson("/api/client/mgmt/companies/{$company->id}");

        $response
            ->assertOk()
            ->assertJsonPath('company_name', 'Acme Consulting')
            ->assertJsonPath('stripe_billing_enabled', false)
            ->assertJsonPath('users.0.email', 'client@example.com')
            ->assertJsonCount(1, 'agreements')
            ->assertJsonPath('agreements.0.monthly_retainer_hours', '10.00')
            ->assertJsonPath('agreements.0.monthly_retainer_fee', '1000.00');

        $payload = $response->json();

        $this->assertArrayNotHasKey('password', $payload['users'][0]);
    }

    public function test_admin_can_update_company_and_receive_detail_payload(): void
    {
        $admin = $this->createAdminUser();
        $clientUser = $this->createUser([
            'name' => 'Client User',
            'email' => 'client@example.com',
        ]);
        $company = ClientCompany::factory()->create([
            'company_name' => 'Acme Consulting',
            'slug' => 'acme-consulting',
            'is_active' => true,
        ]);
        $company->users()->attach($clientUser->id);

        ClientAgreement::factory()->for($company)->create([
            'active_date' => Carbon::create(2026, 5, 1),
            'monthly_retainer_hours' => 10,
            'monthly_retainer_fee' => 1000,
        ]);

        $response = $this
            ->actingAs($admin)
            ->putJson("/api/client/mgmt/companies/{$company->id}", [
                'company_name' => 'Renamed Consulting',
                'slug' => 'renamed-consulting',
                'address' => '123 Main St',
                'website' => 'https://example.com',
                'phone_number' => '555-0100',
                'default_hourly_rate' => 150,
                'additional_notes' => 'Updated notes',
                'is_active' => true,
                'stripe_billing_enabled' => false,
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('company.company_name', 'Renamed Consulting')
            ->assertJsonPath('company.slug', 'renamed-consulting')
            ->assertJsonPath('company.stripe_billing_enabled', false)
            ->assertJsonPath('company.users.0.email', 'client@example.com')
            ->assertJsonCount(1, 'company.agreements')
            ->assertJsonPath('company.agreements.0.monthly_retainer_hours', '10.00')
            ->assertJsonPath('company.agreements.0.monthly_retainer_fee', '1000.00');

        $payload = $response->json();

        $this->assertArrayNotHasKey('password', $payload['company']['users'][0]);
        $this->assertDatabaseHas('client_companies', [
            'id' => $company->id,
            'company_name' => 'Renamed Consulting',
            'slug' => 'renamed-consulting',
            'stripe_billing_enabled' => false,
        ]);
        $this->assertNotNull($company->fresh()->last_activity);
    }

    public function test_admin_update_generates_slug_when_slug_is_blank(): void
    {
        $admin = $this->createAdminUser();
        $company = ClientCompany::factory()->create([
            'company_name' => 'Acme Consulting',
            'slug' => 'acme-consulting',
        ]);

        $response = $this
            ->actingAs($admin)
            ->putJson("/api/client/mgmt/companies/{$company->id}", [
                'company_name' => 'Renamed Consulting',
                'slug' => '',
                'address' => null,
                'website' => null,
                'phone_number' => null,
                'default_hourly_rate' => null,
                'additional_notes' => null,
                'is_active' => true,
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('company.slug', 'renamed-consulting');

        $this->assertDatabaseHas('client_companies', [
            'id' => $company->id,
            'slug' => 'renamed-consulting',
        ]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createInvoice(ClientCompany $company, array $overrides = []): ClientInvoice
    {
        return ClientInvoice::create(array_merge([
            'client_company_id' => $company->id,
            'period_start' => Carbon::create(2026, 5, 1),
            'period_end' => Carbon::create(2026, 5, 31),
            'invoice_number' => 'INV-TEST',
            'invoice_total' => 0,
            'status' => 'draft',
        ], $overrides));
    }
}
