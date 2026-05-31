<?php

namespace Tests\Feature\ClientManagement;

use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientInvoicePayment;
use App\Models\ClientManagement\ClientProject;
use App\Models\ClientManagement\ClientTask;
use App\Models\ClientManagement\ClientTimeEntry;
use App\Models\User;
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
            ->assertJsonCount(1, 'data')
            ->assertJsonStructure([
                'data' => [
                    [
                        'id',
                        'company_name',
                        'slug',
                        'is_active',
                        'stripe_billing_enabled',
                        'created_at',
                        'needs_attention',
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
                ],
                'meta' => [
                    'current_page',
                    'per_page',
                    'last_page',
                    'total',
                    'has_more',
                    'sort',
                    'status',
                    'search',
                    'needs_attention',
                    'stripe_disabled',
                ],
                'stats' => [
                    'active_clients',
                    'inactive_clients',
                    'open_balance',
                    'needs_attention',
                    'stripe_disabled',
                ],
            ]);

        $payload = $response->json();
        $companyPayload = $payload['data'][0];

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
        $this->assertTrue($companyPayload['needs_attention']);

        $this->assertSame(1, $payload['stats']['active_clients']);
        $this->assertEquals(375, $payload['stats']['open_balance']);
        $this->assertSame(1, $payload['stats']['needs_attention']);
        $this->assertSame(0, $payload['stats']['stripe_disabled']);
        $this->assertSame(1, $payload['meta']['total']);
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
            'monthly_retainer_hours' => 10,
            'retainer_hours' => null,
        ]);

        DB::table('client_agreements')
            ->where('id', $agreement->id)
            ->update([
                'billing_cadence' => '"semi_annual"',
            ]);

        // 20 uninvoiced hours against a semi-annual period retainer of 60 hours
        // (10 monthly x 6 months) => 33.3% and NOT needing attention. A SQL CASE
        // over the raw quoted column would mis-multiply; the PHP path must not.
        $this->seedUninvoicedMinutes($company, $admin, 1200);

        $companyPayload = $this
            ->actingAs($admin)
            ->getJson('/api/client/mgmt/companies')
            ->assertOk()
            ->json('data.0');

        $this->assertSame('semi_annual', $companyPayload['current_billing_cadence']);
        $this->assertEquals(60, $companyPayload['current_retainer_hours']);
        $this->assertEquals(33.3, $companyPayload['current_cycle_progress']);
        $this->assertFalse($companyPayload['needs_attention']);
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

    public function test_company_list_is_paginated(): void
    {
        $admin = $this->createAdminUser();
        ClientCompany::factory()->count(30)->create(['is_active' => true]);

        $firstPage = $this
            ->actingAs($admin)
            ->getJson('/api/client/mgmt/companies')
            ->assertOk();

        $this->assertCount(25, $firstPage->json('data'));
        $this->assertSame(30, $firstPage->json('meta.total'));
        $this->assertSame(2, $firstPage->json('meta.last_page'));
        $this->assertTrue($firstPage->json('meta.has_more'));

        $secondPage = $this
            ->actingAs($admin)
            ->getJson('/api/client/mgmt/companies?page=2')
            ->assertOk();

        $this->assertCount(5, $secondPage->json('data'));
        $this->assertFalse($secondPage->json('meta.has_more'));
    }

    public function test_company_list_search_matches_name_and_slug(): void
    {
        $admin = $this->createAdminUser();
        ClientCompany::factory()->create(['company_name' => 'Alpha Corp', 'slug' => 'alpha-corp']);
        ClientCompany::factory()->create(['company_name' => 'Beta Industries', 'slug' => 'beta-industries']);

        $byName = $this->actingAs($admin)->getJson('/api/client/mgmt/companies?search=alpha')->assertOk();
        $this->assertCount(1, $byName->json('data'));
        $this->assertSame('Alpha Corp', $byName->json('data.0.company_name'));

        $bySlug = $this->actingAs($admin)->getJson('/api/client/mgmt/companies?search=beta-ind')->assertOk();
        $this->assertCount(1, $bySlug->json('data'));
        $this->assertSame('Beta Industries', $bySlug->json('data.0.company_name'));
    }

    public function test_company_list_sorts_by_balance_due_descending(): void
    {
        $admin = $this->createAdminUser();
        $small = ClientCompany::factory()->create(['company_name' => 'Small Balance']);
        $large = ClientCompany::factory()->create(['company_name' => 'Large Balance']);
        $this->createInvoice($small, ['invoice_number' => 'SB-1', 'invoice_total' => 100, 'status' => 'issued']);
        $this->createInvoice($large, ['invoice_number' => 'LB-1', 'invoice_total' => 900, 'status' => 'issued']);

        $response = $this
            ->actingAs($admin)
            ->getJson('/api/client/mgmt/companies?sort=balance_due')
            ->assertOk();

        $this->assertSame('Large Balance', $response->json('data.0.company_name'));
        $this->assertSame('Small Balance', $response->json('data.1.company_name'));
    }

    public function test_company_list_sorts_by_last_activity_with_nulls_last(): void
    {
        $admin = $this->createAdminUser();
        ClientCompany::factory()->create(['company_name' => 'Stale', 'last_activity' => Carbon::create(2026, 1, 1)]);
        ClientCompany::factory()->create(['company_name' => 'Fresh', 'last_activity' => Carbon::create(2026, 5, 1)]);
        ClientCompany::factory()->create(['company_name' => 'Never', 'last_activity' => null]);

        $names = $this
            ->actingAs($admin)
            ->getJson('/api/client/mgmt/companies?sort=last_activity')
            ->assertOk()
            ->json('data.*.company_name');

        $this->assertSame(['Fresh', 'Stale', 'Never'], $names);
    }

    public function test_needs_attention_filter_and_sort(): void
    {
        $admin = $this->createAdminUser();
        $attention = ClientCompany::factory()->create(['company_name' => 'Owes Money']);
        $this->createInvoice($attention, ['invoice_number' => 'OM-1', 'invoice_total' => 250, 'status' => 'issued']);
        ClientCompany::factory()->create(['company_name' => 'All Clear']);

        $filtered = $this
            ->actingAs($admin)
            ->getJson('/api/client/mgmt/companies?needs_attention=1')
            ->assertOk();
        $this->assertCount(1, $filtered->json('data'));
        $this->assertSame('Owes Money', $filtered->json('data.0.company_name'));

        $sorted = $this
            ->actingAs($admin)
            ->getJson('/api/client/mgmt/companies?sort=needs_attention')
            ->assertOk();
        $this->assertSame('Owes Money', $sorted->json('data.0.company_name'));
    }

    public function test_cycle_progress_and_attention_use_period_retainer_for_quarterly(): void
    {
        $admin = $this->createAdminUser();
        $company = ClientCompany::factory()->create(['company_name' => 'Quarterly Co']);
        ClientAgreement::factory()->for($company)->create([
            'active_date' => Carbon::create(2026, 1, 1),
            'termination_date' => null,
            'billing_cadence' => 'quarterly',
            'monthly_retainer_hours' => 10,
            'retainer_hours' => null,
        ]);
        // 20 uninvoiced hours vs a 30-hour quarterly period retainer => 66.7%, not flagged.
        $this->seedUninvoicedMinutes($company, $admin, 1200);

        $payload = $this
            ->actingAs($admin)
            ->getJson('/api/client/mgmt/companies')
            ->assertOk()
            ->json('data.0');

        $this->assertEquals(30, $payload['current_retainer_hours']);
        $this->assertEquals(66.7, $payload['current_cycle_progress']);
        $this->assertFalse($payload['needs_attention']);
    }

    public function test_monthly_retainer_flags_attention_when_hours_exceed_monthly_period(): void
    {
        $admin = $this->createAdminUser();
        $company = ClientCompany::factory()->create(['company_name' => 'Monthly Co']);
        ClientAgreement::factory()->for($company)->create([
            'active_date' => Carbon::create(2026, 1, 1),
            'termination_date' => null,
            'billing_cadence' => 'monthly',
            'monthly_retainer_hours' => 10,
            'retainer_hours' => null,
        ]);
        // 20 uninvoiced hours vs a 10-hour monthly period retainer => over, flagged, capped at 100%.
        $this->seedUninvoicedMinutes($company, $admin, 1200);

        $payload = $this
            ->actingAs($admin)
            ->getJson('/api/client/mgmt/companies')
            ->assertOk()
            ->json('data.0');

        $this->assertEquals(10, $payload['current_retainer_hours']);
        $this->assertEquals(100, $payload['current_cycle_progress']);
        $this->assertTrue($payload['needs_attention']);
    }

    public function test_open_balance_stat_matches_sum_of_card_balances(): void
    {
        $admin = $this->createAdminUser();
        $a = ClientCompany::factory()->create();
        $b = ClientCompany::factory()->create();
        $this->createInvoice($a, ['invoice_number' => 'A-1', 'invoice_total' => 300, 'status' => 'issued']);
        $overpaid = $this->createInvoice($b, ['invoice_number' => 'B-1', 'invoice_total' => 100, 'status' => 'issued']);
        // Overpaid invoice must contribute 0, never a negative, to the open balance.
        ClientInvoicePayment::create([
            'client_invoice_id' => $overpaid->client_invoice_id,
            'amount' => 150,
            'payment_date' => Carbon::create(2026, 5, 4),
            'payment_method' => 'ACH',
        ]);

        $response = $this->actingAs($admin)->getJson('/api/client/mgmt/companies')->assertOk();

        $cardSum = array_sum(array_column($response->json('data'), 'total_balance_due'));
        $this->assertEquals(300, $cardSum);
        $this->assertEquals(300, $response->json('stats.open_balance'));
        $attentionCount = count(array_filter(array_column($response->json('data'), 'needs_attention')));
        $this->assertSame($attentionCount, $response->json('stats.needs_attention'));
    }

    public function test_stats_are_global_and_ignore_filters(): void
    {
        $admin = $this->createAdminUser();
        $attention = ClientCompany::factory()->create(['company_name' => 'Owes Money']);
        $this->createInvoice($attention, ['invoice_number' => 'OM-1', 'invoice_total' => 400, 'status' => 'issued']);
        ClientCompany::factory()->create(['company_name' => 'All Clear']);

        $response = $this
            ->actingAs($admin)
            ->getJson('/api/client/mgmt/companies?search=All+Clear')
            ->assertOk();

        $this->assertCount(1, $response->json('data'));
        $this->assertSame('All Clear', $response->json('data.0.company_name'));
        $this->assertSame(2, $response->json('stats.active_clients'));
        $this->assertSame(1, $response->json('stats.needs_attention'));
        $this->assertEquals(400, $response->json('stats.open_balance'));
    }

    public function test_status_filter_scopes_active_inactive_and_all(): void
    {
        $admin = $this->createAdminUser();
        ClientCompany::factory()->create(['company_name' => 'Active Co', 'is_active' => true]);
        ClientCompany::factory()->create(['company_name' => 'Inactive Co', 'is_active' => false]);

        $active = $this->actingAs($admin)->getJson('/api/client/mgmt/companies?status=active')->assertOk();
        $this->assertSame(['Active Co'], $active->json('data.*.company_name'));

        $inactive = $this->actingAs($admin)->getJson('/api/client/mgmt/companies?status=inactive')->assertOk();
        $this->assertSame(['Inactive Co'], $inactive->json('data.*.company_name'));

        $all = $this->actingAs($admin)->getJson('/api/client/mgmt/companies?status=all')->assertOk();
        $this->assertCount(2, $all->json('data'));
    }

    public function test_admin_can_fetch_company_options(): void
    {
        $admin = $this->createAdminUser();
        ClientCompany::factory()->create(['company_name' => 'Beta Co']);
        ClientCompany::factory()->create(['company_name' => 'Alpha Co']);

        $response = $this
            ->actingAs($admin)
            ->getJson('/api/client/mgmt/company-options')
            ->assertOk()
            ->assertJsonStructure([['id', 'company_name', 'slug']]);

        $this->assertSame(['Alpha Co', 'Beta Co'], $response->json('*.company_name'));
    }

    public function test_non_admin_cannot_fetch_company_options(): void
    {
        $this->createAdminUser();

        $this
            ->actingAs($this->createUser())
            ->getJson('/api/client/mgmt/company-options')
            ->assertForbidden();
    }

    private function seedUninvoicedMinutes(ClientCompany $company, User $actor, int $minutes): void
    {
        $project = ClientProject::factory()->create([
            'client_company_id' => $company->id,
            'creator_user_id' => $actor->id,
        ]);

        ClientTimeEntry::factory()->create([
            'project_id' => $project->id,
            'client_company_id' => $company->id,
            'minutes_worked' => $minutes,
            'is_billable' => true,
            'client_invoice_line_id' => null,
            'user_id' => $actor->id,
            'creator_user_id' => $actor->id,
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
