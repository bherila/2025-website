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

class InvoiceSummaryConsistencyTest extends TestCase
{
    use RefreshDatabase;

    public function test_toDetailedArray_includes_all_summary_fields()
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

    public function test_invoice_navigation_ids_are_present_in_controller_response()
    {
        $admin = User::factory()->create(['user_role' => 'admin']);
        $company = ClientCompany::factory()->create(['slug' => 'test-co']);
        
        $inv1 = ClientInvoice::create([
            'client_company_id' => $company->id,
            'period_start' => '2024-01-01',
            'period_end' => '2024-01-31',
            'status' => 'issued',
            'invoice_number' => 'INV-1'
        ]);

        $inv2 = ClientInvoice::create([
            'client_company_id' => $company->id,
            'period_start' => '2024-02-01',
            'period_end' => '2024-02-29',
            'status' => 'issued',
            'invoice_number' => 'INV-2'
        ]);

        $inv3 = ClientInvoice::create([
            'client_company_id' => $company->id,
            'period_start' => '2024-03-01',
            'period_end' => '2024-03-31',
            'status' => 'issued',
            'invoice_number' => 'INV-3'
        ]);

        $response = $this->actingAs($admin)->get("/client/portal/{$company->slug}/invoice/{$inv2->client_invoice_id}");
        $response->assertStatus(200);

        $content = $response->getContent();
        preg_match('/<script id="client-portal-initial-data" type="application\/json">\s*(.*?)\s*<\/script>/s', $content, $matches);
        $payload = json_decode($matches[1], true);
        
        $this->assertEquals($inv1->client_invoice_id, $payload['invoice']['previous_invoice_id']);
        $this->assertEquals($inv3->client_invoice_id, $payload['invoice']['next_invoice_id']);
    }
}
