<?php

namespace Tests\Unit\Services\ClientManagement;

use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Services\ClientManagement\InvoicePdfRenderer;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InvoicePdfRendererTest extends TestCase
{
    use RefreshDatabase;

    public function test_render_returns_pdf_bytes(): void
    {
        $company = ClientCompany::factory()->create([
            'company_name' => 'Acme Widgets',
            'slug' => 'acme-widgets',
            'address' => '123 Main St, Springfield',
            'billing_email' => 'billing@acme.test',
        ]);

        $agreement = ClientAgreement::factory()->for($company)->create([
            'active_date' => Carbon::create(2024, 1, 1),
            'termination_date' => null,
        ]);

        $invoice = ClientInvoice::create([
            'client_company_id' => $company->id,
            'client_agreement_id' => $agreement->id,
            'period_start' => Carbon::create(2024, 1, 1),
            'period_end' => Carbon::create(2024, 1, 31),
            'invoice_number' => 'INV-202402-001',
            'invoice_total' => 1500.00,
            'issue_date' => Carbon::create(2024, 2, 1),
            'due_date' => Carbon::create(2024, 2, 15),
            'status' => 'issued',
            'notes' => 'Thank you for your business.',
        ]);

        $invoice->lineItems()->create([
            'client_agreement_id' => $agreement->id,
            'description' => 'Monthly retainer',
            'quantity' => 1,
            'unit_price' => 1500.00,
            'line_total' => 1500.00,
            'line_type' => 'retainer',
            'hours' => 0,
            'line_date' => Carbon::create(2024, 2, 1),
            'sort_order' => 1,
        ]);

        $pdf = (new InvoicePdfRenderer)->render($invoice->fresh());

        $this->assertNotEmpty($pdf);
        $this->assertStringStartsWith('%PDF', $pdf);
    }
}
