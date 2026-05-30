<?php

namespace Tests\Feature\ClientManagement;

use App\Enums\ClientManagement\BillingCadence;
use App\Enums\ClientManagement\InvoiceKind;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientInvoiceLine;
use App\Services\ClientManagement\InvoiceActivityLogger;
use Carbon\Carbon;
use Tests\TestCase;

class InvoiceActivityLoggerTest extends TestCase
{
    private ClientCompany $company;

    private ClientAgreement $agreement;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = ClientCompany::factory()->create([
            'company_name' => 'Logger Test Co',
            'slug' => 'logger-test-co',
        ]);

        $this->agreement = ClientAgreement::factory()->for($this->company)->create([
            'active_date' => Carbon::parse('2026-01-01'),
            'monthly_retainer_hours' => 10,
            'monthly_retainer_fee' => 1000,
            'hourly_rate' => 150,
            'billing_cadence' => BillingCadence::Monthly->value,
        ]);
    }

    public function test_first_call_records_invoice_generated(): void
    {
        $invoice = $this->createDraftInvoice('LOG-001', 500.00);

        $logger = new InvoiceActivityLogger;
        $activity = $logger->recordGenerated($this->company, $invoice);

        $this->assertNotNull($activity);
        $this->assertSame('invoice.generated', $activity->action);
        $this->assertSame($this->company->id, $activity->client_company_id);
        $this->assertSame($invoice->getKey(), $activity->subject_id);
        $this->assertSame(ClientInvoice::class, $activity->subject_type);
        $this->assertArrayHasKey('fingerprint', $activity->payload);
        $this->assertEquals(500.0, $activity->payload['invoice_total']);

        $this->assertDatabaseCount('client_company_activity', 1);
    }

    public function test_repeated_call_with_unchanged_invoice_records_nothing(): void
    {
        $invoice = $this->createDraftInvoice('LOG-002', 750.00);

        $logger = new InvoiceActivityLogger;
        $logger->recordGenerated($this->company, $invoice);

        $this->assertDatabaseCount('client_company_activity', 1);

        $result = $logger->recordGenerated($this->company, $invoice);

        $this->assertNull($result);
        $this->assertDatabaseCount('client_company_activity', 1);
    }

    public function test_call_after_invoice_total_change_records_invoice_updated(): void
    {
        $invoice = $this->createDraftInvoice('LOG-003', 900.00);

        $logger = new InvoiceActivityLogger;
        $logger->recordGenerated($this->company, $invoice);

        $this->assertDatabaseCount('client_company_activity', 1);

        $invoice->update(['invoice_total' => 1200.00]);
        $invoice->refresh();

        $activity = $logger->recordGenerated($this->company, $invoice);

        $this->assertNotNull($activity);
        $this->assertSame('invoice.updated', $activity->action);
        $this->assertArrayHasKey('changes', $activity->payload);
        $this->assertArrayHasKey('invoice_total', $activity->payload['changes']);
        $this->assertEquals(900.0, $activity->payload['changes']['invoice_total']['old']);
        $this->assertEquals(1200.0, $activity->payload['changes']['invoice_total']['new']);
        $this->assertDatabaseCount('client_company_activity', 2);
    }

    public function test_call_after_line_item_added_records_invoice_updated(): void
    {
        $invoice = $this->createDraftInvoice('LOG-004', 500.00);

        ClientInvoiceLine::create([
            'client_invoice_id' => $invoice->client_invoice_id,
            'description' => 'Retainer fee',
            'quantity' => '1',
            'unit_price' => 500.00,
            'line_total' => 500.00,
            'line_type' => 'retainer_fee',
            'sort_order' => 1,
        ]);

        $invoice->refresh();

        $logger = new InvoiceActivityLogger;
        $logger->recordGenerated($this->company, $invoice);

        $this->assertDatabaseCount('client_company_activity', 1);

        ClientInvoiceLine::create([
            'client_invoice_id' => $invoice->client_invoice_id,
            'description' => 'Additional hours',
            'quantity' => '2',
            'unit_price' => 150.00,
            'line_total' => 300.00,
            'line_type' => 'additional_hours',
            'sort_order' => 2,
        ]);

        $invoice->update(['invoice_total' => 800.00]);
        $invoice->refresh();
        $invoice->unsetRelation('lineItems');

        $activity = $logger->recordGenerated($this->company, $invoice);

        $this->assertNotNull($activity);
        $this->assertSame('invoice.updated', $activity->action);
        $this->assertArrayHasKey('line_digest', $activity->payload['changes']);
        $this->assertDatabaseCount('client_company_activity', 2);
    }

    private function createDraftInvoice(string $invoiceNumber, float $total = 0.0): ClientInvoice
    {
        return ClientInvoice::create([
            'client_company_id' => $this->company->id,
            'client_agreement_id' => $this->agreement->id,
            'period_start' => Carbon::parse('2026-04-01'),
            'period_end' => Carbon::parse('2026-04-30'),
            'invoice_number' => $invoiceNumber,
            'invoice_total' => $total,
            'status' => 'draft',
            'invoice_kind' => InvoiceKind::CadencePeriod->value,
        ]);
    }
}
