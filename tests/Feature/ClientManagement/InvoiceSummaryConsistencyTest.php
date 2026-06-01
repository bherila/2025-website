<?php

namespace Tests\Feature\ClientManagement;

use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientInvoiceLine;
use App\Models\User;
use Carbon\Carbon;
use Tests\TestCase;

class InvoiceSummaryConsistencyTest extends TestCase
{
    public function test_to_detailed_array_includes_all_summary_fields(): void
    {
        $company = ClientCompany::factory()->create();
        $agreement = ClientAgreement::create([
            'client_company_id' => $company->id,
            'active_date' => Carbon::now()->subMonths(3),
            'monthly_retainer_hours' => 10,
            'hourly_rate' => 150,
        ]);

        $invoice = ClientInvoice::create([
            'client_company_id' => $company->id,
            'client_agreement_id' => $agreement->id,
            'period_start' => Carbon::now()->subMonth()->startOfMonth(),
            'period_end' => Carbon::now()->subMonth()->endOfMonth(),
            'status' => 'draft',
            'retainer_hours_included' => 10,
            'hours_worked' => 12,
            'negative_hours_balance' => 5, // 5 hours overage from previous months
            'starting_unused_hours' => 0,
            'starting_negative_hours' => 2,
        ]);

        $data = $invoice->toDetailedArray();

        $this->assertArrayHasKey('negative_offset', $data);
        $this->assertArrayHasKey('carried_in_hours', $data);
        $this->assertArrayHasKey('current_month_hours', $data);
        $this->assertArrayHasKey('starting_unused_hours', $data);
        $this->assertArrayHasKey('starting_negative_hours', $data);

        // negative_offset should be min(negative_hours_balance, retainer_hours_included)
        $this->assertEquals(5, $data['negative_offset']);
    }

    public function test_to_detailed_array_emits_complete_stable_invoice_shape(): void
    {
        $company = ClientCompany::factory()->create();

        $invoice = ClientInvoice::create([
            'client_company_id' => $company->id,
            'period_start' => '2024-01-01',
            'period_end' => '2024-01-31',
            'status' => 'draft',
            'invoice_total' => 125.5,
            'retainer_hours_included' => 10,
            'hours_worked' => 2,
        ]);

        ClientInvoiceLine::create([
            'client_invoice_id' => $invoice->client_invoice_id,
            'description' => 'Retainer work',
            'quantity' => '2',
            'unit_price' => 0,
            'line_total' => 0,
            'line_type' => 'prior_month_retainer',
            'hours' => 2,
            'line_date' => null,
        ]);

        $data = $invoice->fresh()->toDetailedArray();

        $this->assertArrayHasKey('invoice_number', $data);
        $this->assertArrayHasKey('issue_date', $data);
        $this->assertArrayHasKey('due_date', $data);
        $this->assertArrayHasKey('paid_date', $data);
        $this->assertArrayHasKey('cycle_start', $data);
        $this->assertArrayHasKey('cycle_end', $data);
        $this->assertArrayHasKey('notes', $data);
        $this->assertArrayHasKey('deferred_pending', $data);
        $this->assertNull($data['invoice_number']);
        $this->assertNull($data['issue_date']);
        $this->assertNull($data['due_date']);
        $this->assertNull($data['paid_date']);
        $this->assertNull($data['cycle_start']);
        $this->assertNull($data['cycle_end']);
        $this->assertNull($data['notes']);
        $this->assertSame([], $data['deferred_pending']);
        $this->assertSame('0.00', $data['payments_total']);
        $this->assertSame('125.50', $data['remaining_balance']);
        $this->assertIsFloat($data['negative_offset']);

        $line = $data['line_items'][0];
        $this->assertArrayHasKey('line_date', $line);
        $this->assertArrayHasKey('client_agreement_recurring_item_id', $line);
        $this->assertArrayHasKey('time_entries', $line);
        $this->assertNull($line['line_date']);
        $this->assertNull($line['client_agreement_recurring_item_id']);
        $this->assertSame([], $line['time_entries']);
    }

    public function test_invoice_navigation_ids_are_present_in_controller_response(): void
    {
        $admin = User::factory()->create(['user_role' => 'admin']);
        $company = ClientCompany::factory()->create(['slug' => 'test-co']);

        $inv1 = ClientInvoice::create([
            'client_company_id' => $company->id,
            'period_start' => '2024-01-01',
            'period_end' => '2024-01-31',
            'status' => 'issued',
            'invoice_number' => 'INV-1',
        ]);

        $inv2 = ClientInvoice::create([
            'client_company_id' => $company->id,
            'period_start' => '2024-02-01',
            'period_end' => '2024-02-29',
            'status' => 'issued',
            'invoice_number' => 'INV-2',
        ]);

        $inv3 = ClientInvoice::create([
            'client_company_id' => $company->id,
            'period_start' => '2024-03-01',
            'period_end' => '2024-03-31',
            'status' => 'issued',
            'invoice_number' => 'INV-3',
        ]);

        $response = $this->actingAs($admin)->get("/client/portal/{$company->slug}/invoice/{$inv2->client_invoice_id}");
        $response->assertStatus(200);

        $content = $response->getContent();
        preg_match('/<script id="client-portal-initial-data" type="application\/json">\s*(.*?)\s*<\/script>/s', $content, $matches);
        $this->assertArrayHasKey(1, $matches);

        $payload = json_decode($matches[1], true);

        $this->assertEquals($inv1->client_invoice_id, $payload['invoice']['previous_invoice_id']);
        $this->assertEquals($inv3->client_invoice_id, $payload['invoice']['next_invoice_id']);
        $this->assertArrayHasKey('due_date', $payload['invoice']);
        $this->assertArrayHasKey('notes', $payload['invoice']);
        $this->assertArrayHasKey('cycle_start', $payload['invoice']);
        $this->assertArrayHasKey('deferred_pending', $payload['invoice']);
        $this->assertNull($payload['invoice']['due_date']);
        $this->assertNull($payload['invoice']['notes']);
        $this->assertNull($payload['invoice']['cycle_start']);
    }

    public function test_portal_navigation_ids_can_include_or_exclude_draft_invoices(): void
    {
        $company = ClientCompany::factory()->create();

        $januaryInvoice = ClientInvoice::create([
            'client_company_id' => $company->id,
            'period_start' => '2024-01-01',
            'period_end' => '2024-01-31',
            'status' => 'issued',
            'invoice_number' => 'INV-1',
        ]);

        $februaryDraft = ClientInvoice::create([
            'client_company_id' => $company->id,
            'period_start' => '2024-02-01',
            'period_end' => '2024-02-29',
            'status' => 'draft',
            'invoice_number' => 'INV-2',
        ]);

        $marchInvoice = ClientInvoice::create([
            'client_company_id' => $company->id,
            'period_start' => '2024-03-01',
            'period_end' => '2024-03-31',
            'status' => 'issued',
            'invoice_number' => 'INV-3',
        ]);

        $clientVisibleNavigation = $januaryInvoice->portalNavigationIds();
        $adminNavigation = $januaryInvoice->portalNavigationIds(includeDrafts: true);

        $this->assertSame($marchInvoice->client_invoice_id, $clientVisibleNavigation['next_invoice_id']);
        $this->assertSame($februaryDraft->client_invoice_id, $adminNavigation['next_invoice_id']);

        $clientVisibleNavigation = $marchInvoice->portalNavigationIds();
        $adminNavigation = $marchInvoice->portalNavigationIds(includeDrafts: true);

        $this->assertSame($januaryInvoice->client_invoice_id, $clientVisibleNavigation['previous_invoice_id']);
        $this->assertSame($februaryDraft->client_invoice_id, $adminNavigation['previous_invoice_id']);
    }
}
