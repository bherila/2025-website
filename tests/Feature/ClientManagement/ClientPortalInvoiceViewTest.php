<?php

namespace Tests\Feature\ClientManagement;

use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientInvoiceLine;
use App\Models\ClientManagement\ClientTimeEntry;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ClientPortalInvoiceViewTest extends TestCase
{
    use RefreshDatabase;

    public function test_invoice_page_hydrates_hourly_summary_fields()
    {
        $admin = User::factory()->create(['user_role' => 'admin']);
        $client = User::factory()->create(['user_role' => 'user']);

        $company = ClientCompany::factory()->create([
            'company_name' => 'Summary Co',
            'slug' => 'summary-co',
        ]);

        $company->users()->attach($client);

        $agreement = ClientAgreement::create([
            'client_company_id' => $company->id,
            'active_date' => Carbon::now()->subMonth(),
            'agreement_text' => 'Agreement',
            'monthly_retainer_hours' => 10,
            'hourly_rate' => 150,
        ]);

        $periodStart = Carbon::parse('2024-01-01');
        $periodEnd = Carbon::parse('2024-01-31');

        $invoice = ClientInvoice::create([
            'client_company_id' => $company->id,
            'client_agreement_id' => $agreement->id,
            'period_start' => $periodStart,
            'period_end' => $periodEnd,
            'status' => 'issued',
            'invoice_number' => 'INV-SUM-001',
            'invoice_total' => 200.00,
            'retainer_hours_included' => 10,
            'hours_worked' => 5,
        ]);

        // Create a line and two time entries: one before the period (carried-in) and one inside the period
        $line = ClientInvoiceLine::create([
            'client_invoice_id' => $invoice->client_invoice_id,
            'description' => 'Consulting hours',
            'quantity' => '1',
            'unit_price' => 100.00,
            'line_total' => 100.00,
            'line_type' => 'additional_hours',
            'hours' => 1.0,
        ]);

        // Create a project (project_id is not nullable in schema)
        $project = \App\Models\ClientManagement\ClientProject::factory()->create([
            'client_company_id' => $company->id,
        ]);

        ClientTimeEntry::create([
            'project_id' => $project->id,
            'client_company_id' => $company->id,
            'task_id' => null,
            'name' => 'Old work',
            'minutes_worked' => 30, // 0.5 hours carried in
            'date_worked' => $periodStart->copy()->subDay(),
            'user_id' => $admin->id,
            'creator_user_id' => $admin->id,
            'is_billable' => true,
            'job_type' => 'dev',
            'client_invoice_line_id' => $line->client_invoice_line_id,
        ]);

        ClientTimeEntry::create([
            'project_id' => $project->id,
            'client_company_id' => $company->id,
            'task_id' => null,
            'name' => 'This month work',
            'minutes_worked' => 90, // 1.5 hours in-period
            'date_worked' => $periodStart->copy()->addDays(2),
            'user_id' => $admin->id,
            'creator_user_id' => $admin->id,
            'is_billable' => true,
            'job_type' => 'dev',
            'client_invoice_line_id' => $line->client_invoice_line_id,
        ]);

        // Request the invoice page as the client (should be allowed for issued invoices)
        $response = $this->actingAs($client)->get("/client/portal/{$company->slug}/invoice/{$invoice->client_invoice_id}");
        $response->assertStatus(200);

        $content = $response->getContent();

        // Extract the JSON payload inside the script#client-portal-initial-data
        $this->assertMatchesRegularExpression('/<script id="client-portal-initial-data" type="application\/json">/s', $content);
        preg_match('/<script id="client-portal-initial-data" type="application\/json">\s*(.*?)\s*<\/script>/s', $content, $matches);
        $this->assertArrayHasKey(1, $matches, 'client-portal-initial-data script not found');

        $payload = json_decode($matches[1], true);
        $this->assertIsArray($payload);
        $this->assertArrayHasKey('invoice', $payload);

        $inv = $payload['invoice'];

        // Summary fields should be present and correctly derived from time entries
        $this->assertArrayHasKey('carried_in_hours', $inv);
        $this->assertArrayHasKey('current_month_hours', $inv);

        $this->assertEqualsWithDelta(0.5, (float) $inv['carried_in_hours'], 0.001);
        $this->assertEqualsWithDelta(1.5, (float) $inv['current_month_hours'], 0.001);

        // Starting balances were null and should be omitted from the payload (null -> undefined).
        $this->assertArrayNotHasKey('starting_unused_hours', $inv);
        $this->assertArrayNotHasKey('starting_negative_hours', $inv);

        // Monetary summary fields should still be present
        $this->assertArrayHasKey('remaining_balance', $inv);
        $this->assertArrayHasKey('payments_total', $inv);
    }
}
