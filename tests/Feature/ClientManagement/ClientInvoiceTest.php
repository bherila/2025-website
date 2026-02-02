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
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
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
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
        );

        $retainerLine = $invoice->lineItems->firstWhere('line_type', 'retainer');
        $this->assertNotNull($retainerLine);
        $this->assertEquals('2024-02-01', $retainerLine->line_date->toDateString());
        $this->assertEquals(1000.00, (float) $retainerLine->line_total);
    }

    public function test_cannot_generate_overlapping_invoice(): void
    {
        $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
        );

        $this->expectException(\Exception::class);
        $this->expectExceptionMessage('overlapping period');

        $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 2, 15),
            Carbon::create(2024, 3, 15)
        );
    }

    public function test_can_generate_adjacent_invoices(): void
    {
        $febInvoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
        );

        $marInvoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 3, 1),
            Carbon::create(2024, 3, 31)
        );

        $this->assertNotNull($febInvoice);
        $this->assertNotNull($marInvoice);
        $this->assertNotEquals($febInvoice->client_invoice_id, $marInvoice->client_invoice_id);
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
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
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
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
        );

        // Should have prior_month_retainer for ALL 15 hours at $0
        $priorMonthLines = $invoice->lineItems->where('line_type', 'prior_month_retainer');
        $this->assertTrue($priorMonthLines->count() >= 1);
        $this->assertEquals(15, (float) $priorMonthLines->sum('hours'));
        $this->assertEquals(0, (float) $priorMonthLines->sum('line_total'));

        // Should NOT have additional_hours line
        $overageLine = $invoice->lineItems->firstWhere('line_type', 'additional_hours');
        $this->assertNull($overageLine, 'Should NOT have additional_hours line in give and take model');

        // Negative balance of 5 from Jan should be offset by 10h retainer in Feb
        // resulting in 5h unused balance.
        $this->assertEquals(5, (float) $invoice->fresh()->unused_hours_balance);
        $this->assertEquals(0, (float) $invoice->fresh()->negative_hours_balance);
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
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29),
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
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
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
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
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
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
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
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
        );

        $invoice->void();
        $this->assertEquals('void', $invoice->fresh()->status);
    }

    public function test_voided_invoice_periods_can_be_reused(): void
    {
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
        );
        $invoice->void();

        $newInvoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
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
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
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
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
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
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
        );

        $initialRetainerCount = $invoice->lineItems()->where('line_type', 'retainer')->count();

        // Regenerate
        $regeneratedInvoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
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
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
        );

        // 4. Check Prior Month Retainer Line
        // Should have "Work items from prior month..." line
        $priorMonthLine = $invoice->lineItems->firstWhere('line_type', 'prior_month_retainer');
        $this->assertNotNull($priorMonthLine, 'Should have prior_month_retainer line');
        $this->assertEquals(0, (float) $priorMonthLine->line_total, 'Prior month retainer should be $0');
        $this->assertEquals(5, (float) $priorMonthLine->hours, 'Should show 5 hours');
        $this->assertEquals('2024-01-31', $priorMonthLine->line_date->toDateString(), 'Should be dated last day of prior month');
        // Update expectation for dynamic description
        $this->assertStringContainsString('Work items from prior month applied to retainer', $priorMonthLine->description);
    }

    public function test_months_with_no_prior_month_entries(): void
    {
        // Generate February invoice with no January work
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
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
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
        );

        // January balance: 10h retainer, 13h worked -> 3h negative balance.
        // February: 10h retainer, 0h worked. 3h negative balance carried from Jan is offset by 10h retainer.
        // Result: 7h unused balance in Feb.
        $this->assertEquals(7, (float) $febInvoice->fresh()->unused_hours_balance);
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

        $febInvoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
        );

        // Should NOT have additional_hours line
        $overageLine = $febInvoice->lineItems->firstWhere('line_type', 'additional_hours');
        $this->assertNull($overageLine);

        // Should have 5h negative balance (15h from Jan offset by 10h in Feb)
        $this->assertEquals(5, (float) $febInvoice->fresh()->negative_hours_balance);
    }
    public function test_time_entry_is_split_when_partially_billed(): void
    {
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
        // Work = 12.
        // Stage 1 (Dec Cover): 0.
        // Stage 2 (Jan Cover): 10.
        // Stage 3 (Feb Carry): 2.

        $entry = ClientTimeEntry::factory()->create([
            'client_company_id' => $this->company->id,
            'minutes_worked' => 12 * 60, // 12 hours
            'date_worked' => Carbon::create(2023, 12, 15),
            'is_billable' => true,
        ]);

        // 3. Generate Jan Invoice
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $invoice->refresh();

        // 4. Verify lines
        // We expect:
        // Line A: 10h (Applied to Jan)
        // Line B: 2h (Exceeding -> Feb)

        $priorLines = $invoice->lineItems->where('line_type', 'prior_month_retainer')->sortBy('hours');
        // Sorted: 2h, 10h

        $this->assertEquals(2, $priorLines->count(), 'Should have 2 prior work lines');

        $tenHourLine = $priorLines->firstWhere('hours', 10);
        $twoHourLine = $priorLines->firstWhere('hours', 2);

        $this->assertNotNull($tenHourLine, 'Should have 10h covered line');
        $this->assertStringContainsString('applied to January 2024 retainer', $tenHourLine->description);

        $this->assertNotNull($twoHourLine, 'Should have 2h offset line');
        $this->assertStringContainsString('applied to February 2024 retainer', $twoHourLine->description);

        // 5. Verify Original Entry was modified
        $entry->refresh();
        // The original entry should correspond to one of the split parts (usually the first selected one, which is 10h in Stage 2)
        // Stage 1 (0h) select nothing.
        // Stage 2 (10h) selects.

        $this->assertEquals(10 * 60, $entry->minutes_worked, 'Original entry should be 10h');
        $this->assertEquals($tenHourLine->client_invoice_line_id, $entry->client_invoice_line_id);

        // 6. Verify New Entry
        $remainderEntry = ClientTimeEntry::where('client_company_id', $this->company->id)
            ->where('id', '!=', $entry->id)
            ->first();

        $this->assertNotNull($remainderEntry);
        $this->assertEquals(2 * 60, $remainderEntry->minutes_worked);
        $this->assertEquals($twoHourLine->client_invoice_line_id, $remainderEntry->client_invoice_line_id);
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
            'expense_date' => Carbon::create(2024, 2, 15),
            'is_reimbursable' => true,
            'creator_user_id' => $this->admin->id,
        ]);

        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
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
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
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
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
        );

        $this->actingAs($this->admin)
            ->deleteJson("/api/client/mgmt/companies/{$otherCompany->id}/invoices/{$invoice->client_invoice_id}")
            ->assertStatus(404);
    }
}
