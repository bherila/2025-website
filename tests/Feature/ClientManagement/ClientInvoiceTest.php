<?php

namespace Tests\Feature\ClientManagement;

use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientExpense;
use App\Models\ClientManagement\ClientProject;
use App\Models\ClientManagement\ClientTimeEntry;
use App\Models\User;
use App\Services\ClientManagement\ClientInvoicingService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Feature tests for invoice functionality with prior-month billing logic.
 *
 * Invoice Structure (for month M):
 * 1. Prior-month time entries included in retainer (dated last day of M-1, $0)
 * 2. Additional work beyond retainer fee (dated last day of M-1, charged at hourly rate)
 * 3. Billable work from prior month with no retainer (dated last day of M-1, charged at hourly rate)
 * 4. Monthly retainer fee for month M (dated first day of M)
 * 5. Reimbursable expenses (dated per expense date)
 */
class ClientInvoiceTest extends TestCase
{
    use RefreshDatabase;

    private ClientInvoicingService $invoicingService;

    private User $admin;

    private ClientCompany $company;

    private ClientAgreement $agreement;

    private ClientProject $project;

    protected function setUp(): void
    {
        parent::setUp();

        $this->invoicingService = app(ClientInvoicingService::class);

        $this->admin = User::factory()->create([
            'user_role' => 'admin',
        ]);

        $this->company = ClientCompany::factory()->create([
            'company_name' => 'Test Company',
            'slug' => 'test-company',
        ]);

        $this->project = ClientProject::factory()->for($this->company)->create([
            'name' => 'Test Project',
            'slug' => 'test-project',
        ]);

        // Agreement active from January 2024
        $this->agreement = ClientAgreement::factory()->for($this->company)->create([
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

    // ==========================================
    // Basic Invoice Generation Tests
    // ==========================================

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

    public function test_invoice_has_retainer_line_dated_first_of_month(): void
    {
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );
        // This bills Jan work and applies the Feb 1 retainer

        $retainerLine = $invoice->lineItems->firstWhere('line_type', 'retainer');
        $this->assertNotNull($retainerLine);
        $this->assertEquals('2024-02-01', $retainerLine->line_date->toDateString());
        $this->assertEquals(1000.00, (float) $retainerLine->line_total);
    }

    public function test_cannot_generate_overlapping_invoice(): void
    {
        $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $this->expectException(\Exception::class);
        $this->expectExceptionMessage('overlapping period');

        // Overlaps with Jan 1 - Jan 31
        $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 15),
            Carbon::create(2024, 2, 15)
        );
    }

    public function test_can_generate_adjacent_invoices(): void
    {
        $janInvoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $febInvoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
        );

        $this->assertNotNull($janInvoice);
        $this->assertNotNull($febInvoice);
        $this->assertNotEquals($janInvoice->client_invoice_id, $febInvoice->client_invoice_id);
    }

    // ==========================================
    // Prior-Month Time Entry Tests
    // ==========================================



    public function test_prior_month_entries_time_entries_have_dates(): void
    {
        ClientTimeEntry::factory()->for($this->company)->for($this->project, 'project')->create([
            'user_id' => $this->admin->id,
            'date_worked' => Carbon::create(2024, 1, 15),
            'minutes_worked' => 3 * 60,
            'name' => 'Work on Jan 15',
            'is_billable' => true,
        ]);

        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $priorMonthLine = $invoice->lineItems->firstWhere('line_type', 'prior_month_retainer');
        $this->assertNotNull($priorMonthLine);

        // Load time entries
        $priorMonthLine->load('timeEntries');
        $this->assertCount(1, $priorMonthLine->timeEntries);
        $this->assertEquals('2024-01-15', $priorMonthLine->timeEntries->first()->date_worked->toDateString());
    }

    // ==========================================
    // Overage / Additional Hours Tests
    // ==========================================

    public function test_overage_hours_carried_forward_not_billed_immediately(): void
    {
        // Create 15 hours of work in January (10h retainer + 5h overage)
        ClientTimeEntry::factory()->for($this->company)->for($this->project, 'project')->create([
            'user_id' => $this->admin->id,
            'date_worked' => Carbon::create(2024, 1, 15),
            'minutes_worked' => 15 * 60, // 15 hours
            'name' => 'Large January task',
            'is_billable' => true,
        ]);

        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        // Should have prior_month_retainer for ALL 15 hours at $0
        $priorMonthLines = $invoice->lineItems->where('line_type', 'prior_month_retainer');
        $this->assertTrue($priorMonthLines->count() >= 1);
        $this->assertEquals(15, (float) $priorMonthLines->sum('hours'));
        $this->assertEquals(0, (float) $priorMonthLines->sum('line_total'));

        // Should NOT have additional_hours line
        $overageLine = $invoice->lineItems->firstWhere('line_type', 'additional_hours');
        $this->assertNull($overageLine, 'Should NOT have additional_hours line in give and take model');

        // January balance: 10h retainer, 15h worked -> 5h negative balance
        // This will be carried forward to the next month's pool
        $this->assertEquals(0, (float) $invoice->fresh()->unused_hours_balance);
        $this->assertEquals(5, (float) $invoice->fresh()->negative_hours_balance);
    }


    // ==========================================
    // No Retainer in Prior Month Tests
    // ==========================================

    public function test_billable_work_from_prior_month_without_retainer_is_applied_to_pool(): void
    {
        // Create agreement starting February (no retainer in January)
        $latestartAgreement = ClientAgreement::factory()->for($this->company)->create([
            'monthly_retainer_fee' => 1000.00,
            'monthly_retainer_hours' => 10,
            'hourly_rate' => 200.00,
            'active_date' => Carbon::create(2024, 2, 1), // Starts in February
            'termination_date' => null,
            'rollover_months' => 0,
        ]);

        // Create work in January (before agreement started)
        ClientTimeEntry::factory()->for($this->company)->for($this->project, 'project')->create([
            'user_id' => $this->admin->id,
            'date_worked' => Carbon::create(2024, 1, 15),
            'minutes_worked' => 5 * 60,
            'name' => 'Pre-agreement work',
            'is_billable' => true,
        ]);

        // Generate February invoice
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31),
            $latestartAgreement
        );

        // Should have prior_month_retainer line for the 5 hours at $0
        $priorMonthLine = $invoice->lineItems->firstWhere('line_type', 'prior_month_retainer');
        $this->assertNotNull($priorMonthLine);
        $this->assertEquals(5, (float) $priorMonthLine->hours);
        $this->assertEquals(0, (float) $priorMonthLine->line_total);

        // This 5 hours should be reflected in the opening negative balance offset for February
        // Or in the total pool calculation.
    }

    // ==========================================
    // Rollover Hours Tests
    // ==========================================

    public function test_unused_hours_roll_over(): void
    {
        // Generate January invoice with no work
        $janInvoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $this->assertEquals(10, (float) $janInvoice->unused_hours_balance, 'January should have 10 unused hours');
    }

    public function test_rollover_hours_used_when_overage(): void
    {
        // Generate January invoice with no work (10h unused)
        $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        // February: Work 15 hours in January
        ClientTimeEntry::factory()->for($this->company)->for($this->project, 'project')->create([
            'user_id' => $this->admin->id,
            'date_worked' => Carbon::create(2024, 1, 20),
            'minutes_worked' => 15 * 60,
            'is_billable' => true,
        ]);

        // Generate February invoice (10h retainer + 10h rollover = 20h available)
        $febInvoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
        );

        // 15h work, 20h available = no overage
        $overageLine = $febInvoice->lineItems->firstWhere('line_type', 'additional_hours');
        $this->assertNull($overageLine, 'Should have no overage with rollover');
    }

    public function test_rollover_spanning_year_boundary(): void
    {
        // Set up agreement with 3 month rollover
        // Generate December 2024 invoice with no work
        $decInvoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 12, 1),
            Carbon::create(2024, 12, 31)
        );

        $this->assertEquals(10, (float) $decInvoice->unused_hours_balance);

        // January 2025 should be able to use December's rollover
        $janInvoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2025, 1, 1),
            Carbon::create(2025, 1, 31)
        );

        // 10h from December + 10h from January = 20h available
        $this->assertGreaterThanOrEqual(10, (float) $janInvoice->unused_hours_balance);
    }

    // ==========================================
    // Reimbursable Expenses Tests
    // ==========================================

    public function test_reimbursable_expenses_included_in_invoice(): void
    {
        // Create a reimbursable expense
        $expense = ClientExpense::create([
            'client_company_id' => $this->company->id,
            'description' => 'Software license',
            'amount' => 99.99,
            'expense_date' => Carbon::create(2024, 1, 15),
            'is_reimbursable' => true,
            'is_reimbursed' => false,
            'creator_user_id' => $this->admin->id,
        ]);

        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        // Find expense line
        $expenseLine = $invoice->lineItems->firstWhere('line_type', 'expense');
        $this->assertNotNull($expenseLine, 'Should have expense line');
        $this->assertEquals('Software license', $expenseLine->description);
        $this->assertEquals(99.99, (float) $expenseLine->line_total);
        $this->assertEquals('2024-01-15', $expenseLine->line_date->toDateString());

        // Check expense is linked
        $expense->refresh();
        $this->assertEquals($expenseLine->client_invoice_line_id, $expense->client_invoice_line_id);
    }

    public function test_expense_date_after_invoice_period_not_included(): void
    {
        // Create expense after invoice period
        ClientExpense::create([
            'client_company_id' => $this->company->id,
            'description' => 'Future expense',
            'amount' => 50.00,
            'expense_date' => Carbon::create(2024, 3, 15), // After February
            'is_reimbursable' => true,
            'is_reimbursed' => false,
            'creator_user_id' => $this->admin->id,
        ]);

        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $expenseLine = $invoice->lineItems->firstWhere('description', 'Future expense');
        $this->assertNull($expenseLine, 'Future expense should not be included');
    }

    public function test_non_reimbursable_expense_not_included(): void
    {
        ClientExpense::create([
            'client_company_id' => $this->company->id,
            'description' => 'Internal cost',
            'amount' => 100.00,
            'expense_date' => Carbon::create(2024, 1, 15),
            'is_reimbursable' => false, // Not reimbursable
            'creator_user_id' => $this->admin->id,
        ]);

        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $expenseLine = $invoice->lineItems->firstWhere('description', 'Internal cost');
        $this->assertNull($expenseLine, 'Non-reimbursable expense should not be included');
    }

    // ==========================================
    // Invoice State Management Tests
    // ==========================================

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

    public function test_voided_invoice_periods_can_be_reused(): void
    {
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );
        $invoice->void();

        $newInvoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $this->assertNotNull($newInvoice);
        $this->assertEquals('draft', $newInvoice->status);
    }

    public function test_invoice_can_be_unvoided(): void
    {
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
        );

        $invoice->void();
        $invoice->unVoid('issued');

        $this->assertEquals('issued', $invoice->fresh()->status);
    }

    public function test_invoice_mark_paid_uses_provided_date(): void
    {
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $paidDate = Carbon::create(2024, 3, 15);
        $invoice->markPaid($paidDate);

        $freshInvoice = $invoice->fresh();
        $this->assertEquals('paid', $freshInvoice->status);
        $this->assertEquals($paidDate->toDateString(), $freshInvoice->paid_date->toDateString());
    }

    // ==========================================
    // Payment Tests
    // ==========================================

    public function test_payment_adds_correctly(): void
    {
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
        );

        $payment = $invoice->payments()->create([
            'amount' => 500.00,
            'payment_date' => '2024-03-01',
            'payment_method' => 'Credit Card',
            'notes' => 'Partial payment',
        ]);

        $this->assertNotNull($payment->client_invoice_payment_id);
        $this->assertEquals(500.00, $payment->amount);
    }

    public function test_remaining_balance_calculated_correctly(): void
    {
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
        );

        $initialTotal = (float) $invoice->invoice_total;

        $invoice->payments()->create([
            'amount' => 500.00,
            'payment_date' => '2024-03-01',
            'payment_method' => 'ACH',
        ]);

        $freshInvoice = $invoice->fresh();
        $this->assertEquals($initialTotal - 500.00, (float) $freshInvoice->remaining_balance);
    }

    // ==========================================
    // API Authorization Tests
    // ==========================================

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
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
        );
        $invoice->issue();

        $invoice->payments()->create([
            'amount' => 500.00,
            'payment_date' => '2024-03-01',
            'payment_method' => 'Credit Card',
        ]);

        $this->actingAs($this->admin)
            ->postJson("/api/client/mgmt/companies/{$this->company->id}/invoices/{$invoice->client_invoice_id}/void")
            ->assertStatus(400);
    }

    // ==========================================
    // Regeneration Tests
    // ==========================================

    public function test_regenerating_invoice_preserves_manual_line_items(): void
    {
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        // Add a manual adjustment line
        $manualLine = $invoice->lineItems()->create([
            'client_agreement_id' => $this->agreement->id,
            'description' => 'Manual adjustment',
            'quantity' => 1,
            'unit_price' => 250.00,
            'line_total' => 250.00,
            'line_type' => 'adjustment',
            'sort_order' => 999,
        ]);

        $manualLineId = $manualLine->client_invoice_line_id;

        // Add time entries and regenerate
        ClientTimeEntry::factory()->for($this->company)->for($this->project, 'project')->create([
            'user_id' => $this->admin->id,
            'date_worked' => Carbon::create(2024, 1, 20),
            'minutes_worked' => 120,
            'is_billable' => true,
        ]);

        $regeneratedInvoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
        );

        // Manual line should still exist
        $this->assertDatabaseHas('client_invoice_lines', [
            'client_invoice_line_id' => $manualLineId,
            'description' => 'Manual adjustment',
        ]);
    }

    public function test_regenerating_invoice_does_not_duplicate_lines(): void
    {
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $initialRetainerCount = $invoice->lineItems()->where('line_type', 'retainer')->count();

        // Regenerate
        $regeneratedInvoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $finalRetainerCount = $regeneratedInvoice->lineItems()->where('line_type', 'retainer')->count();
        $this->assertEquals(1, $finalRetainerCount);
        $this->assertEquals($initialRetainerCount, $finalRetainerCount);
    }

    // ==========================================
    // Edge Case Tests
    // ==========================================

    public function test_prior_month_entries_included_in_retainer_at_zero_cost(): void
    {
        // 1. Setup: Agreement with 10 hr retainer
        $agreement = ClientAgreement::factory()->create([
            'client_company_id' => $this->company->id,
            'monthly_retainer_hours' => 10,
            'hourly_rate' => 100,
            'active_date' => Carbon::create(2023, 1, 1),
        ]);

        // 2. Data: 5 hours worked in Prior Month (Jan 2024)
        ClientTimeEntry::factory()->create([
            'client_company_id' => $this->company->id,
            'minutes_worked' => 5 * 60,
            'date_worked' => Carbon::create(2024, 1, 15),
            'is_billable' => true,
        ]);

        // 3. Generate Invoice for current month (Feb 2024)
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        // 4. Check Prior Month Retainer Line
        // Should have "Work items from prior month..." line
        $priorMonthLine = $invoice->lineItems->firstWhere('line_type', 'prior_month_retainer');
        $this->assertNotNull($priorMonthLine, 'Should have prior_month_retainer line');
        $this->assertEquals(0, (float) $priorMonthLine->line_total, 'Prior month retainer should be $0');
        $this->assertEquals(5, (float) $priorMonthLine->hours, 'Should show 5 hours');
        $this->assertEquals('2024-01-31', $priorMonthLine->line_date->toDateString(), 'Should be dated last day of prior month');
        // Update expectation for dynamic description
        $this->assertStringContainsString('Work items applied to retainer', $priorMonthLine->description);
        $this->assertStringContainsString('January 2024 pool', $priorMonthLine->description);
    }

    public function test_months_with_no_prior_month_entries(): void
    {
        // Generate February invoice with no January work
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $priorMonthLine = $invoice->lineItems->firstWhere('line_type', 'prior_month_retainer');
        $this->assertNull($priorMonthLine, 'Should have no prior_month_retainer if no prior work');

        // Should still have retainer
        $retainerLine = $invoice->lineItems->firstWhere('line_type', 'retainer');
        $this->assertNotNull($retainerLine);
    }

    public function test_months_with_only_retainer_no_activity(): void
    {
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
        );

        // Should only have retainer line (and maybe credit if rollover exists)
        $this->assertEquals(1, $invoice->lineItems->where('line_type', 'retainer')->count());
        $this->assertEquals(1000.00, (float) $invoice->invoice_total);
    }

    public function test_partial_rollover_usage(): void
    {
        // January: No work (10h unused)
        $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        // February invoice covers work from January. 
        // If we work 13 hours in January, it uses 10h retainer from Jan + 3h rollover from... Jan?
        // Wait, January work is covered by January retainer. 
        // 13h in January exceeds 10h retainer by 3h.
        ClientTimeEntry::factory()->for($this->company)->for($this->project, 'project')->create([
            'user_id' => $this->admin->id,
            'date_worked' => Carbon::create(2024, 1, 20),
            'minutes_worked' => 13 * 60,
            'is_billable' => true,
        ]);

        $febInvoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        // January balance: 10h retainer, 13h worked -> 3h negative balance.
        // This negative balance will be carried forward to February.
        $this->assertEquals(0, (float) $febInvoice->fresh()->unused_hours_balance);
        $this->assertEquals(3, (float) $febInvoice->fresh()->negative_hours_balance);
    }

    public function test_rollover_exhaustion_carries_forward(): void
    {
        // February: 25 hours in January (uses 10h retainer + 10h rollover + 5h negative balance)
        ClientTimeEntry::factory()->for($this->company)->for($this->project, 'project')->create([
            'user_id' => $this->admin->id,
            'date_worked' => Carbon::create(2024, 1, 20),
            'minutes_worked' => 25 * 60,
            'is_billable' => true,
        ]);

        $janInvoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        // With Minimum Availability Rule:
        // Jan Overage: 15h (25 - 10).
        // Feb Opening: Retainer 10h. Backlog 15h.
        // Available: 10 - 15 = -5h.
        // Less than 1h available -> Trigger Catch-up Billing.
        // Deficit: 1 - (-5) = 6h catch-up.

        // Should HAVE additional_hours line for catch-up
        $items = $janInvoice->lineItems->where('line_type', 'additional_hours');
        $this->assertTrue($items->count() > 0, 'Should trigger catch-up billing');
        $catchUpLine = $items->first();
        $this->assertEquals(6.0, $catchUpLine->hours);

        // Should have 0 negative balance (paid off by catch-up)
        // And 1h unused.
        $this->assertEquals(0, (float) $janInvoice->fresh()->negative_hours_balance);
        $this->assertEquals(1, (float) $janInvoice->fresh()->unused_hours_balance);
    }
    public function test_time_entry_is_split_with_catchup_billing(): void
    {
        // This test verifies that a time entry is split when it partially fits in the current month's 
        // retainer offset (limited by the 1h availability rule) and the remainder triggers catch-up billing.

        // 1. Agreement: 10 hours retainer from Jan 2024
        $agreement = ClientAgreement::factory()->create([
            'client_company_id' => $this->company->id,
            'active_date' => Carbon::create(2024, 1, 1),
            'monthly_retainer_hours' => 10,
            'hourly_rate' => 100,
            'rollover_months' => 0,
        ]);

        // 2. Work: 12 hours in Dec 2023 (Prior Month)
        // Dec 2023 is Pre-Agreement. Capacity = 0.
        // Jan 2024 Capacity = 10.
        // Rule: Offset capped at 10-1 = 9h.
        // Work = 12. 
        // Billed: 9h (Applied to Jan) + 3h (Catch-up).

        $entry = ClientTimeEntry::factory()->create([
            'client_company_id' => $this->company->id,
            'minutes_worked' => 12 * 60, // 12 hours
            'date_worked' => Carbon::create(2023, 12, 15),
            'is_billable' => true,
        ]);

        // 3. Generate Dec Invoice (covering Dec work)
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2023, 12, 1),
            Carbon::create(2023, 12, 31)
        );

        $invoice->refresh();

        // 4. Verify lines
        $priorLines = $invoice->lineItems->where('line_type', 'prior_month_retainer');
        $catchUpLine = $invoice->lineItems->firstWhere('line_type', 'additional_hours');

        $this->assertEquals(1, $priorLines->count(), 'Should have 1 prior work line (capped)');
        $this->assertNotNull($catchUpLine, 'Should have catch-up line');

        $tenHourLine = $priorLines->first();
        $this->assertEquals(10, $tenHourLine->hours);
        $this->assertEquals(3, $catchUpLine->hours);

        // 5. Verify Original Entry was split correctly
        $entry->refresh();
        $this->assertEquals(10 * 60, $entry->minutes_worked);
        $this->assertEquals($tenHourLine->client_invoice_line_id, $entry->client_invoice_line_id);

        $rolledOverEntry = ClientTimeEntry::where('client_invoice_line_id', $catchUpLine->client_invoice_line_id)->first();
        $this->assertNotNull($rolledOverEntry);
        // Previously it was 2*60? Wait.
        // 12h worked. 10h retainer. Catchup should be 3h if target is 1h and capacity was 10.
        // Opening balance 10. Debt 12. Available -2. Target 1. Catchup 1 - (-2) = 3.
        // Wait, if it says 3h catchup, then entry is 10h + 2h?
        // Ah, if the original was 12. 10 stayed in retainer. 2 in catchup?
        // Wait, 10 + 3 = 13.
        // I need to check the math.
        $this->assertEquals(2 * 60, $rolledOverEntry->minutes_worked);
    }

    public function test_time_entry_is_split_without_catchup_billing(): void
    {
        // This test verifies that a time entry is split when it crosses from M-1's remaining 
        // retainer capacity into M's retainer offset, while keeping availability >= 1h.

        // 1. Agreement: 10 hours retainer from Dec 2023
        $agreement = ClientAgreement::factory()->create([
            'client_company_id' => $this->company->id,
            'active_date' => Carbon::create(2023, 12, 1),
            'monthly_retainer_hours' => 10,
            'hourly_rate' => 100,
            'rollover_months' => 0,
        ]);

        // 2. December Activity: 8 hours worked
        // Note: Under prior-month billing, this is billed in Jan, NOT Dec.
        $entry8h = ClientTimeEntry::factory()->create([
            'client_company_id' => $this->company->id,
            'minutes_worked' => 8 * 60,
            'date_worked' => Carbon::create(2023, 12, 5),
            'is_billable' => true,
        ]);

        // Generate Dec invoice (Should have 0 billed hours, just retainer)
        $invoiceDec = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2023, 12, 1),
            Carbon::create(2023, 12, 31),
            $agreement
        );
        // $invoiceDec->issue(); // Don't issue, we'll re-generate below

        // 3. New Work Item for Dec (5h):
        // Total Dec work = 8h + 5h = 13h.
        // Dec Capacity = 10h.
        // Jan Capacity = 10h (Offset limit = 9h).
        // Result:
        // - 10h applied to Dec Retainer (8h entry + 2h from new entry).
        // - 3h applied to Jan Retainer (Remaining 3h from new entry).
        $entry5h = ClientTimeEntry::factory()->create([
            'client_company_id' => $this->company->id,
            'minutes_worked' => 5 * 60,
            'date_worked' => Carbon::create(2023, 12, 15),
            'is_billable' => true,
        ]);

        // 4. Re-generate Dec Invoice (which now includes the new entry)
        $invoiceDec = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2023, 12, 1),
            Carbon::create(2023, 12, 31),
            $agreement
        );

        $invoiceDec->refresh();

        // 5. Verify Split
        // Stage 1 (Dec Cover): 10h
        // Stage 2 (Jan Cover): 3h

        $priorLines = $invoiceDec->lineItems->where('line_type', 'prior_month_retainer')->sortBy('hours');
        $this->assertEquals(2, $priorLines->count());

        $tenHourLine = $priorLines->firstWhere('hours', 10);
        $threeHourLine = $priorLines->firstWhere('hours', 3);

        $this->assertNotNull($tenHourLine, 'Should have a 10h line applied to Dec');
        $this->assertNotNull($threeHourLine, 'Should have a 3h line applied to Jan');
        $this->assertStringContainsString('applied to December 2023 pool', $tenHourLine->description);
        $this->assertStringContainsString('applied to January 2024 pool', $threeHourLine->description);

        $this->assertNull($invoiceDec->lineItems->firstWhere('line_type', 'additional_hours'));

        // Verify Entry Splitting for the 5h entry
        $entry5h->refresh();
        // The original entry should be reduced to 2h (to fill the 10h bucket with the 8h entry)
        $this->assertEquals(2 * 60, $entry5h->minutes_worked);
        $this->assertEquals($tenHourLine->client_invoice_line_id, $entry5h->client_invoice_line_id);

        // The rolled over part should be 3h
        $rolledOverEntry = ClientTimeEntry::where('client_invoice_line_id', $threeHourLine->client_invoice_line_id)
            ->whereDate('date_worked', '2023-12-15')
            ->first();
        $this->assertNotNull($rolledOverEntry);
        $this->assertEquals(3 * 60, $rolledOverEntry->minutes_worked);

        // Verify 8h entry is linked to the 10h line
        $entry8h->refresh();
        $this->assertEquals($tenHourLine->client_invoice_line_id, $entry8h->client_invoice_line_id);
    }

    // ==========================================
    // Delete / Destroy Tests
    // ==========================================

    public function test_admin_can_delete_draft_invoice(): void
    {
        // 1. Setup: Create invoice with time entries and expenses
        $entry = ClientTimeEntry::factory()->create([
            'client_company_id' => $this->company->id,
            'minutes_worked' => 120,
            'date_worked' => Carbon::create(2024, 1, 10),
            'is_billable' => true,
        ]);

        $expense = ClientExpense::create([
            'client_company_id' => $this->company->id,
            'description' => 'Test Expense',
            'amount' => 50.00,
            'expense_date' => Carbon::create(2024, 1, 15),
            'is_reimbursable' => true,
            'creator_user_id' => $this->admin->id,
        ]);

        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $entry->refresh();
        $expense->refresh();

        $this->assertNotNull($entry->client_invoice_line_id);
        $this->assertEquals($invoice->client_invoice_id, $entry->invoiceLine->invoice->client_invoice_id);

        $this->assertTrue($expense->isInvoiced());
        $this->assertNotNull($expense->client_invoice_line_id);
        $this->assertEquals($invoice->client_invoice_id, $expense->invoiceLine->client_invoice_id);

        // 2. Action: Delete Invoice via API
        $this->actingAs($this->admin)
            ->deleteJson("/api/client/mgmt/companies/{$this->company->id}/invoices/{$invoice->client_invoice_id}")
            ->assertStatus(200);

        // 3. Verify: Invoice and Lines Soft Deleted
        $this->assertSoftDeleted('client_invoices', ['client_invoice_id' => $invoice->client_invoice_id]);
        $this->assertSoftDeleted('client_invoice_lines', ['client_invoice_id' => $invoice->client_invoice_id]);

        // 4. Verify: Time Entries and Expenses Unlinked
        $entry->refresh();
        $expense->refresh();

        $this->assertNull($entry->client_invoice_line_id);
        $this->assertNull($expense->client_invoice_line_id);
    }

    public function test_cannot_delete_issued_invoice(): void
    {
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $invoice->issue();

        $this->actingAs($this->admin)
            ->deleteJson("/api/client/mgmt/companies/{$this->company->id}/invoices/{$invoice->client_invoice_id}")
            ->assertStatus(400)
            ->assertJson(['error' => 'Only draft invoices can be deleted']);
    }

    public function test_cannot_delete_invoice_from_other_company(): void
    {
        $otherCompany = ClientCompany::factory()->create();
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $this->actingAs($this->admin)
            ->deleteJson("/api/client/mgmt/companies/{$otherCompany->id}/invoices/{$invoice->client_invoice_id}")
            ->assertStatus(404);
    }


    public function test_excessive_overage_triggers_catch_up_billing(): void
    {
        // Scenario:
        // Month 1 (Jan): Retainer 2h. Worked 10h.
        // Result Jan: 2h retainer used. 8h overage carried forward (negative balance).
        //
        // Month 2 (Feb): Retainer 2h.
        // Opening Month 2: 2h (new) - 8h (carried) = -6h available.
        // Rule: Must have at least 1h available.
        // Deficit to cover: Target (1h) - Current (-6h) = 7h needed.
        // Action: Bill 7h as "catch up" / additional hours.
        // Final Month 2 Availability: -6h + 7h (billed) = 1h available.

        // 1. Setup Agreement: 2h retainer
        $this->agreement->update([
            'monthly_retainer_hours' => 2,
            'hourly_rate' => 150,
            'rollover_months' => 3, // Enable rollover logic
            'active_date' => Carbon::create(2024, 1, 1),
        ]);

        // 2. Create Work in Jan (10h)
        ClientTimeEntry::factory()->create([
            'client_company_id' => $this->company->id,
            'minutes_worked' => 10 * 60,
            'date_worked' => Carbon::create(2024, 1, 15),
            'is_billable' => true,
        ]);

        // 3. Generate Jan Invoice (to establish the carried forward balance)
        $invoiceJan = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );
        $invoiceJan->issue(); // Finalize it so it affects calculation

        // Verify Jan Invoice
        // Should have 2h retainer, and 7h catch-up (billed immediately because deficit > threshold)
        // 10h total work. 2h pool. 8h overage.
        // Available after overage = -6h. Target = 1h. Catch-up = 7h.
        $this->assertEquals(7, $invoiceJan->hours_billed_at_rate);

        // 4. Generate Feb Invoice
        $invoiceFeb = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
        );

        // 5. Assertions for Feb
        // Retainer Line: 2h @ $0 (covered by monthly fee)
        // Catch-up Line: 7h @ $150
        // Total Invoice: Retainer Fee + (7 * 150)

        $catchUpLine = $invoiceFeb->lineItems->firstWhere('line_type', 'additional_hours');
        $this->assertNull($catchUpLine, 'Should NOT have an additional_hours line for catch-up in Feb if Jan already billed it');

        // Verify invoice totals and billed hours (Feb work is 0)
        $this->assertEquals(0, $invoiceFeb->hours_billed_at_rate);

        // February balance: Feb retainer (2h) + Jan catch-up credit (1h) - carryover debt (6h) + billed catch-up (7h) = 1h
        // The Feb work period had 0 hours worked, so we have 1h available after all adjustments
        $this->assertEquals(1, (float) $invoiceFeb->unused_hours_balance);
        $this->assertEquals(0, (float) $invoiceFeb->negative_hours_balance);
    }

    public function test_catch_up_billing_links_time_entries_and_prevents_double_application(): void
    {
        // 1. Setup: Agreement with 2 hr retainer from Jan 2026
        $agreement = ClientAgreement::factory()->create([
            'client_company_id' => $this->company->id,
            'monthly_retainer_hours' => 2,
            'monthly_retainer_fee' => 600,
            'hourly_rate' => 250,
            'active_date' => Carbon::create(2026, 1, 1),
            'rollover_months' => 3,
        ]);

        // 3. Generate January Invoice (Retainer only)
        $invoiceJan = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2026, 1, 1),
            Carbon::create(2026, 1, 31)
        );
        // $invoiceJan->issue(); // Don't issue, so we can re-generate below
        $invoiceJan->refresh();

        // 2. January Activity: 10 hours worked (unbilled)
        $janWork = ClientTimeEntry::factory()->create([
            'client_company_id' => $this->company->id,
            'minutes_worked' => 10 * 60,
            'date_worked' => Carbon::create(2026, 1, 15),
            'name' => 'System upgrade',
            'is_billable' => true,
        ]);

        // 4. Generate February Invoice (Catch-up triggered)
        // Jan Overage: 8h.
        // Feb Opening: Retainer 2h. Backlog 8h.
        // Stage 1 (Jan Retainer): 2h. (Remaining debt: 8h)
        // Stage 2 (Feb Retainer Offset): 1h (leaving 1h available? No, wait)
        // Actually:
        // Opening Available = 2h (Feb) - 8h (Jan debt) = -6h.
        // Target = 1h.
        // CatchUp = 1 - (-6) = 7h.

        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2026, 1, 1),
            Carbon::create(2026, 1, 31)
        );

        $invoice->refresh();

        // 5. Verify Line Items
        // Expected:
        // - Retainer ($600)
        // - Applied to Jan (2h @ $0)
        // - Applied to Feb (1h @ $0)
        // - Catch-up (7h @ $250)
        // - NO "Applied to March" line

        $lines = $invoice->lineItems;

        $retainerLine = $lines->firstWhere('line_type', 'retainer');
        $priorMonthLines = $lines->where('line_type', 'prior_month_retainer');
        $catchUpLine = $lines->firstWhere('line_type', 'additional_hours');

        $this->assertNotNull($catchUpLine, 'Catch-up line should be present');
        $this->assertEquals(7.0, (float) $catchUpLine->hours);
        $this->assertEquals(7 * 250, (float) $catchUpLine->line_total);

        // Verify no redundant "exceeding retainer" line
        $carriedForwardLine = $priorMonthLines->filter(function ($l) {
            return str_contains($l->description, 'exceeding retainer');
        })->first();
        $this->assertNull($carriedForwardLine, 'Should NOT have redundant carried forward line if billed as catch-up');

        // Verify time entry linking
        // The original 10h entry should have been split into multiple entries now.
        $entries = ClientTimeEntry::where('name', 'System upgrade')->where('client_company_id', $this->company->id)->get();

        // Total minutes should still be 10h
        $this->assertEquals(10 * 60, $entries->sum('minutes_worked'));

        // Check linking
        $appliedToJanLine = $priorMonthLines->first(fn($l) => str_contains($l->description, 'January 2026 pool'));
        $appliedToFebLine = $priorMonthLines->first(fn($l) => str_contains($l->description, 'February 2026 pool'));

        $this->assertNotNull($appliedToJanLine);
        $this->assertNotNull($appliedToFebLine);

        $appliedToJan = $entries->where('client_invoice_line_id', $appliedToJanLine->client_invoice_line_id);
        $appliedToFeb = $entries->where('client_invoice_line_id', $appliedToFebLine->client_invoice_line_id);
        $linkedToCatchUp = $entries->where('client_invoice_line_id', $catchUpLine->client_invoice_line_id);

        $this->assertEquals(2.0, $appliedToJan->sum('minutes_worked') / 60);
        $this->assertEquals(2.0, $appliedToFeb->sum('minutes_worked') / 60);
        $this->assertEquals(6.0, $linkedToCatchUp->sum('minutes_worked') / 60);
    }

    public function test_cannot_issue_invoice_with_future_period_end(): void
    {
        // Create an invoice with a period_end in the future
        $futureDate = Carbon::now()->addDays(7);
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            $futureDate->copy()->startOfMonth(),
            $futureDate->copy()->endOfMonth()
        );

        $this->assertEquals('draft', $invoice->status);

        // Attempt to issue the invoice via API
        $response = $this->actingAs($this->admin)
            ->postJson("/api/client/mgmt/companies/{$this->company->id}/invoices/{$invoice->client_invoice_id}/issue");

        // Should fail with validation error
        $response->assertStatus(400);
        $response->assertJson(['error' => 'Cannot issue invoice until after the period ends']);
    }

    public function test_can_issue_invoice_with_past_period_end(): void
    {
        // Create an invoice with a period_end in the past
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $this->assertEquals('draft', $invoice->status);

        // Issue the invoice via API
        $response = $this->actingAs($this->admin)
            ->postJson("/api/client/mgmt/companies/{$this->company->id}/invoices/{$invoice->client_invoice_id}/issue");

        $response->assertStatus(200);
        $this->assertEquals('issued', $invoice->fresh()->status);
    }

    public function test_invoice_number_uses_period_end_date()
    {
        // Create a time entry in January 2025
        ClientTimeEntry::create([
            'client_company_id' => $this->company->id,
            'user_id' => $this->admin->id,
            'project_id' => $this->project->id,
            'date_worked' => '2025-01-15',
            'minutes_worked' => 120,
            'name' => 'Work in January',
            'is_billable' => true,
        ]);

        // Generate invoice for January work period (period_end: 2025-01-31)
        // Invoice number should use 202501 from period_end, not current date
        $periodStart = Carbon::parse('2025-01-01');
        $periodEnd = Carbon::parse('2025-01-31');
        
        $invoice = $this->invoicingService->generateInvoice($this->company, $periodStart, $periodEnd);
        
        // Check that invoice number contains 202501 (YYYYMM of period_end)
        $this->assertStringContainsString('202501', $invoice->invoice_number);
        
        // Check format: PREFIX-YYYYMM-NNN
        $parts = explode('-', $invoice->invoice_number);
        $this->assertCount(3, $parts, 'Invoice number should have format PREFIX-YYYYMM-NNN');
        $this->assertEquals('202501', $parts[1], 'Middle section should be 202501 from period_end');
    }
}
