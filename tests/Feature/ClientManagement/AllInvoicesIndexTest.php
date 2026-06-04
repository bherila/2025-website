<?php

namespace Tests\Feature\ClientManagement;

use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\User;
use App\Services\ClientManagement\ClientInvoicingService;
use Carbon\Carbon;
use Tests\TestCase;

/**
 * Feature tests for the cross-company merged invoice index
 * (GET /api/client/mgmt/invoices).
 */
class AllInvoicesIndexTest extends TestCase
{
    private ClientInvoicingService $invoicingService;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->invoicingService = app(ClientInvoicingService::class);

        $this->admin = User::factory()->create([
            'user_role' => 'admin',
        ]);
    }

    private function makeCompanyWithInvoice(string $name, string $slug): array
    {
        $company = ClientCompany::factory()->create([
            'company_name' => $name,
            'slug' => $slug,
        ]);

        ClientAgreement::factory()->for($company)->create([
            'monthly_retainer_fee' => 1000.00,
            'monthly_retainer_hours' => 10,
            'hourly_rate' => 150.00,
            'active_date' => Carbon::create(2024, 1, 1),
            'termination_date' => null,
            'rollover_months' => 3,
            'is_visible_to_client' => true,
        ]);

        $invoice = $this->invoicingService->generateInvoice(
            $company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        return [$company, $invoice];
    }

    public function test_admin_sees_invoices_across_all_companies(): void
    {
        [$companyA] = $this->makeCompanyWithInvoice('Alpha Co', 'alpha-co');
        [$companyB] = $this->makeCompanyWithInvoice('Beta Co', 'beta-co');
        $companyA->update(['billing_email' => 'billing-alpha@example.com']);

        $response = $this->actingAs($this->admin)
            ->getJson('/api/client/mgmt/invoices');

        $response->assertStatus(200);

        $data = $response->json();
        $this->assertIsArray($data);
        $this->assertGreaterThanOrEqual(2, count($data));

        $companyNames = array_column($data, 'company_name');
        $this->assertContains('Alpha Co', $companyNames);
        $this->assertContains('Beta Co', $companyNames);

        $response->assertJsonStructure([
            '*' => ['id', 'company_name', 'invoice_number', 'status', 'invoice_total'],
        ]);

        $companyAInvoice = collect($data)->firstWhere('company_id', $companyA->id);
        $this->assertIsArray($companyAInvoice);
        $this->assertSame('billing-alpha@example.com', $companyAInvoice['billing_email']);
        $this->assertArrayNotHasKey('recipient_suggestions', $companyAInvoice);
    }

    public function test_non_admin_cannot_list_all_invoices(): void
    {
        $this->makeCompanyWithInvoice('Alpha Co', 'alpha-co');

        $regularUser = User::factory()->create([
            'user_role' => 'user',
        ]);

        $this->actingAs($regularUser)
            ->getJson('/api/client/mgmt/invoices')
            ->assertStatus(403);
    }

    public function test_pdf_endpoint_streams_a_pdf_for_an_issued_invoice(): void
    {
        [$company, $invoice] = $this->makeCompanyWithInvoice('Alpha Co', 'alpha-co');
        $invoice->issue();

        $response = $this->actingAs($this->admin)
            ->get("/api/client/mgmt/companies/{$company->id}/invoices/{$invoice->client_invoice_id}/pdf");

        $response->assertStatus(200);
        $this->assertEquals('application/pdf', $response->headers->get('Content-Type'));
        $this->assertStringStartsWith('%PDF', $response->getContent());
    }

    public function test_pdf_endpoint_rejects_a_draft_invoice(): void
    {
        [$company, $invoice] = $this->makeCompanyWithInvoice('Gamma Co', 'gamma-co');
        $this->assertEquals('draft', $invoice->status);

        $this->actingAs($this->admin)
            ->get("/api/client/mgmt/companies/{$company->id}/invoices/{$invoice->client_invoice_id}/pdf")
            ->assertStatus(422);
    }
}
