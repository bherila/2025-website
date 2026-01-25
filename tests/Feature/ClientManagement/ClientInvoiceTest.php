<?php

namespace Tests\Feature\ClientManagement;

use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientProject;
use App\Models\ClientManagement\ClientTimeEntry;
use App\Models\User;
use App\Services\ClientManagement\ClientInvoicingService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Feature tests for invoice functionality.
 */
class ClientInvoiceTest extends TestCase
{
    use RefreshDatabase;

    private ClientInvoicingService $invoicingService;

    private User $admin;

    private ClientCompany $company;

    private ClientAgreement $agreement;

    protected function setUp(): void
    {
        parent::setUp();

        $this->invoicingService = app(ClientInvoicingService::class);

        // Create an admin user
        $this->admin = User::factory()->create([
            'user_role' => 'admin',
        ]);

        // Create a company
        $this->company = ClientCompany::create([
            'company_name' => 'Test Company',
            'slug' => 'test-company',
        ]);

        // Create an active agreement
        $this->agreement = ClientAgreement::create([
            'client_company_id' => $this->company->id,
            'agreement_text' => 'Standard Retainer',
            'monthly_retainer_fee' => 1000.00,
            'monthly_retainer_hours' => 10,
            'hourly_rate' => 150.00,
            'active_date' => Carbon::create(2024, 1, 1),
            'termination_date' => null,
            'rollover_months' => 3,
            'is_visible_to_client' => true,
        ]);
    }

    public function test_can_generate_invoice_for_period(): void
    {
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $this->assertNotNull($invoice);
        $this->assertEquals('draft', $invoice->status);
        $this->assertNotNull($invoice->invoice_number);
        $this->assertEquals($this->company->id, $invoice->client_company_id);
    }

    public function test_cannot_generate_overlapping_invoice(): void
    {
        // Create first invoice
        $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        // Attempt to create an overlapping invoice
        $this->expectException(\Exception::class);
        $this->expectExceptionMessage('overlapping period');

        $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 15),
            Carbon::create(2024, 2, 15)
        );
    }

    public function test_can_generate_adjacent_invoices(): void
    {
        // Create January invoice
        $janInvoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        // Create February invoice (adjacent, not overlapping)
        $febInvoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
        );

        $this->assertNotNull($janInvoice);
        $this->assertNotNull($febInvoice);
        $this->assertNotEquals($janInvoice->client_invoice_id, $febInvoice->client_invoice_id);
    }

    public function test_voided_invoice_periods_can_be_reused(): void
    {
        // Create and void an invoice
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );
        $invoice->void();

        // Should be able to create a new invoice for the same period
        $newInvoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $this->assertNotNull($newInvoice);
        $this->assertEquals('draft', $newInvoice->status);
    }

    public function test_invoice_can_be_voided(): void
    {
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $invoice->void();

        $this->assertEquals('void', $invoice->fresh()->status);
    }

    public function test_invoice_can_be_unvoided(): void
    {
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $invoice->void();
        $invoice->unVoid('issued');

        $this->assertEquals('issued', $invoice->fresh()->status);
    }

    public function test_unvoid_validates_target_status(): void
    {
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $invoice->void();

        $this->expectException(\InvalidArgumentException::class);
        $invoice->unVoid('invalid_status');
    }

    public function test_invoice_mark_paid_uses_provided_date(): void
    {
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $paidDate = Carbon::create(2024, 2, 15);
        $invoice->markPaid($paidDate);

        $freshInvoice = $invoice->fresh();
        $this->assertEquals('paid', $freshInvoice->status);
        $this->assertEquals($paidDate->toDateString(), $freshInvoice->paid_date->toDateString());
    }

    public function test_invoice_mark_paid_uses_now_when_no_date_provided(): void
    {
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        Carbon::setTestNow(Carbon::create(2024, 3, 1, 10, 30));
        $invoice->markPaid();

        $freshInvoice = $invoice->fresh();
        $this->assertEquals('paid', $freshInvoice->status);
        $this->assertEquals('2024-03-01', $freshInvoice->paid_date->toDateString());

        Carbon::setTestNow();
    }

    public function test_payment_adds_correctly(): void
    {
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $payment = $invoice->payments()->create([
            'amount' => 500.00,
            'payment_date' => '2024-02-01',
            'payment_method' => 'Credit Card',
            'notes' => 'Partial payment',
        ]);

        $this->assertNotNull($payment->client_invoice_payment_id);
        $this->assertEquals(500.00, $payment->amount);
        $this->assertEquals('Credit Card', $payment->payment_method);
    }

    public function test_remaining_balance_calculated_correctly(): void
    {
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $initialTotal = (float) $invoice->invoice_total;

        // Add a partial payment
        $invoice->payments()->create([
            'amount' => 500.00,
            'payment_date' => '2024-02-01',
            'payment_method' => 'ACH',
        ]);

        $freshInvoice = $invoice->fresh();
        $this->assertEquals($initialTotal - 500.00, (float) $freshInvoice->remaining_balance);
    }

    public function test_payments_total_accessor(): void
    {
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $invoice->payments()->create([
            'amount' => 300.00,
            'payment_date' => '2024-02-01',
            'payment_method' => 'Check',
        ]);

        $invoice->payments()->create([
            'amount' => 200.00,
            'payment_date' => '2024-02-05',
            'payment_method' => 'Wire',
        ]);

        $freshInvoice = $invoice->fresh();
        $this->assertEquals(500.00, (float) $freshInvoice->payments_total);
    }

    public function test_invoice_api_requires_admin(): void
    {
        $regularUser = User::factory()->create([
            'user_role' => 'user',
        ]);

        $this->actingAs($regularUser)
            ->getJson("/api/client/mgmt/companies/{$this->company->id}/invoices")
            ->assertStatus(403);
    }

    public function test_invoice_api_void_rejects_invoice_with_payments(): void
    {
        $this->withoutMiddleware();
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );
        $invoice->issue();

        // Add a payment
        $invoice->payments()->create([
            'amount' => 500.00,
            'payment_date' => '2024-02-01',
            'payment_method' => 'Credit Card',
        ]);

        $this->actingAs($this->admin)
            ->postJson("/api/client/mgmt/companies/{$this->company->id}/invoices/{$invoice->client_invoice_id}/void")
            ->assertStatus(400)
            ->assertJson(['error' => 'Invoices with payments cannot be voided. Please delete all payments first.']);
    }

    public function test_invoice_api_unvoid_works(): void
    {
        $this->withoutMiddleware();
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );
        $invoice->void();

        // Sanity-check IDs before API call
        $this->assertEquals($this->company->id, $invoice->client_company_id, 'Invoice should belong to the company');

        $response = $this->actingAs($this->admin)
            ->postJson("/api/client/mgmt/companies/{$this->company->id}/invoices/{$invoice->client_invoice_id}/unvoid", [
                'status' => 'issued',
            ]);

        $this->assertEquals(200, $response->status(), $response->getContent());
        $this->assertJsonStringEqualsJsonString(json_encode(['message' => 'Invoice status reverted successfully']), $response->getContent());

        $this->assertEquals('issued', $invoice->fresh()->status);
    }

    public function test_regenerating_invoice_preserves_manual_line_items(): void
    {
        // Create a project for time entries
        $project = ClientProject::create([
            'client_company_id' => $this->company->id,
            'name' => 'Test Project',
            'slug' => 'test-project',
        ]);

        // Create time entries for January
        ClientTimeEntry::create([
            'client_company_id' => $this->company->id,
            'project_id' => $project->id,
            'user_id' => $this->admin->id,
            'date_worked' => Carbon::create(2024, 1, 15),
            'minutes_worked' => 120, // 2 hours
            'name' => 'Initial work',
            'is_billable' => true,
        ]);

        // Generate initial invoice
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        // Count initial system-generated line items
        $initialSystemLines = $invoice->lineItems()
            ->whereIn('line_type', ['retainer', 'additional_hours', 'credit'])
            ->count();

        // Add a manual line item (using 'expense' type)
        $manualLine = $invoice->lineItems()->create([
            'client_agreement_id' => $this->agreement->id,
            'description' => 'Manual consulting fee',
            'quantity' => 1,
            'unit_price' => 500.00,
            'line_total' => 500.00,
            'line_type' => 'expense', // Manual items use 'expense' or 'adjustment'
            'sort_order' => 999,
        ]);

        $manualLineId = $manualLine->client_invoice_line_id;

        // Recalculate total to include manual item
        $invoice->recalculateTotal();
        $originalTotal = $invoice->invoice_total;

        // Add more time entries
        ClientTimeEntry::create([
            'client_company_id' => $this->company->id,
            'project_id' => $project->id,
            'user_id' => $this->admin->id,
            'date_worked' => Carbon::create(2024, 1, 20),
            'minutes_worked' => 180, // 3 hours
            'name' => 'Additional work',
            'is_billable' => true,
        ]);

        // Regenerate the invoice (simulate re-running invoicing)
        $regeneratedInvoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        // Assert it's the same invoice (not a new one)
        $this->assertEquals($invoice->client_invoice_id, $regeneratedInvoice->client_invoice_id);

        // Assert manual line item still exists
        $this->assertDatabaseHas('client_invoice_lines', [
            'client_invoice_line_id' => $manualLineId,
            'client_invoice_id' => $invoice->client_invoice_id,
            'description' => 'Manual consulting fee',
            'line_total' => 500.00,
        ]);

        // Assert manual line is still in the collection
        $manualLineStillExists = $regeneratedInvoice->lineItems()
            ->where('client_invoice_line_id', $manualLineId)
            ->exists();
        $this->assertTrue($manualLineStillExists, 'Manual line item should be preserved');

        // Assert system-generated lines were regenerated (not duplicated)
        $finalSystemLines = $regeneratedInvoice->lineItems()
            ->whereIn('line_type', ['retainer', 'additional_hours', 'credit'])
            ->count();

        // Should have same number of system lines (regenerated, not duplicated)
        $this->assertEquals($initialSystemLines, $finalSystemLines);

        // Assert invoice total includes manual item
        $this->assertGreaterThan($originalTotal - 500, $regeneratedInvoice->invoice_total);
    }

    public function test_regenerating_invoice_does_not_duplicate_system_line_items(): void
    {
        // Create a project for time entries
        $project = ClientProject::create([
            'client_company_id' => $this->company->id,
            'name' => 'Test Project',
            'slug' => 'test-project',
        ]);

        // Create initial time entry
        ClientTimeEntry::create([
            'client_company_id' => $this->company->id,
            'project_id' => $project->id,
            'user_id' => $this->admin->id,
            'date_worked' => Carbon::create(2024, 1, 15),
            'minutes_worked' => 120,
            'name' => 'Initial work',
            'is_billable' => true,
        ]);

        // Generate initial invoice
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $initialLineCount = $invoice->lineItems()->count();
        $initialRetainerLines = $invoice->lineItems()->where('line_type', 'retainer')->count();

        // Regenerate without any changes
        $regeneratedInvoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        // Assert no duplication occurred
        $finalLineCount = $regeneratedInvoice->lineItems()->count();
        $finalRetainerLines = $regeneratedInvoice->lineItems()->where('line_type', 'retainer')->count();

        $this->assertEquals($initialLineCount, $finalLineCount, 'Line items should not be duplicated');
        $this->assertEquals(1, $finalRetainerLines, 'Should only have one retainer line');
        $this->assertEquals($initialRetainerLines, $finalRetainerLines);
    }
}
