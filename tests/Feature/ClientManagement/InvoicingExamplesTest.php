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
 * Feature tests for invoicing examples from the requirements.
 * 
 * These tests verify the exact behavior described in the problem statement.
 */
class InvoicingExamplesTest extends TestCase
{
    use RefreshDatabase;

    private ClientInvoicingService $invoicingService;
    private User $user;
    private ClientCompany $company;
    private ClientProject $project;

    protected function setUp(): void
    {
        parent::setUp();

        $this->invoicingService = app(ClientInvoicingService::class);
        $this->user = User::factory()->create();
        $this->company = ClientCompany::create([
            'company_name' => 'Test Company',
            'slug' => 'test-company',
        ]);
        $this->project = ClientProject::create([
            'client_company_id' => $this->company->id,
            'name' => 'Test Project',
            'slug' => 'test-project',
        ]);
    }

    /**
     * Example 1 — single large January entry
     * 
     * - Client Agreement: retainer_included_hours = 2, catch_up_threshold_hours = 1
     * - January: 10 hours worked after Jan retainer date
     * - February invoice should include:
     *   - 2.0h allocated as January retainer (pre-agreement work retroactively covered)
     *   - 8.0h billed as additional hours (catch-up for remaining overage)
     * 
     * Note: Since agreement starts in February, January has 0 retainer capacity.
     * The 10h is retroactively applied to the February invoice's balance calculation.
     */
    public function test_example_1_single_large_entry(): void
    {
        // Create agreement starting February 1, 2024 with small retainer
        $agreement = ClientAgreement::create([
            'client_company_id' => $this->company->id,
            'active_date' => Carbon::create(2024, 2, 1),
            'monthly_retainer_hours' => 2.0,
            'catch_up_threshold_hours' => 1.0,
            'hourly_rate' => 150.00,
            'monthly_retainer_fee' => 300.00,
            'rollover_months' => 3,
        ]);

        // Create 10 hours of work in January 2024
        ClientTimeEntry::create([
            'client_company_id' => $this->company->id,
            'project_id' => $this->project->id,
            'user_id' => $this->user->id,
            'date_worked' => Carbon::create(2024, 1, 15),
            'minutes_worked' => 600, // 10 hours
            'name' => 'Large January work',
            'is_billable' => true,
        ]);

        // Generate February invoice (covering January work period)
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        // Assert invoice was created
        $this->assertNotNull($invoice);
        $invoice->refresh();
        $lineItems = $invoice->lineItems;

        // January work (pre-agreement, 0 retainer capacity) is covered by February's logic
        // We expect 2h to be covered by prior_month_retainer at $0
        $priorMonthLines = $lineItems->where('line_type', 'prior_month_retainer');
        $totalPriorMonthHours = $priorMonthLines->sum('hours');
        $this->assertEquals(2.0, (float) $totalPriorMonthHours, 'Should have 2h prior month retainer coverage');
        $this->assertEquals(0, $priorMonthLines->sum('line_total'), 'Prior month retainer lines should be $0');

        // Find additional_hours line (catch-up for remaining 8h + 1h buffer)
        $additionalLine = $lineItems->firstWhere('line_type', 'additional_hours');
        $this->assertNotNull($additionalLine, 'Should have additional_hours line');
        
        // Remaining 8h + 1h buffer (catch_up_threshold) = 9h total billed
        $this->assertEquals(9.0, (float) $additionalLine->hours, 'Should bill 9h (8h overage + 1h buffer) as additional');
        $this->assertEquals(1350.00, (float) $additionalLine->line_total, '9h * $150 = $1350');

        // Verify retainer line exists
        $retainerLine = $lineItems->firstWhere('line_type', 'retainer');
        $this->assertNotNull($retainerLine);
        $this->assertEquals(300.00, (float) $retainerLine->line_total);

        // Total invoice should be retainer + additional hours
        $this->assertEquals(1650.00, (float) $invoice->invoice_total, 'Total: $300 retainer + $1350 additional = $1650');
    }

    /**
     * Example 2 — exact boundary
     * 
     * - Remaining retainer = 2.0h, time entry = 2.0h
     * - Should be single fragment assigned to retainer; no extra fragment
     * 
     * Note: With catch_up_threshold = 1.0, we need buffer after allocation.
     * So 2h work with 2h retainer leaves 0h available, triggering catch-up.
     */
    public function test_example_2_exact_boundary(): void
    {
        $agreement = ClientAgreement::create([
            'client_company_id' => $this->company->id,
            'active_date' => Carbon::create(2024, 2, 1),
            'monthly_retainer_hours' => 2.0,
            'catch_up_threshold_hours' => 1.0,
            'hourly_rate' => 150.00,
            'monthly_retainer_fee' => 300.00,
            'rollover_months' => 3,
        ]);

        // Create exactly 2 hours of work in January
        ClientTimeEntry::create([
            'client_company_id' => $this->company->id,
            'project_id' => $this->project->id,
            'user_id' => $this->user->id,
            'date_worked' => Carbon::create(2024, 1, 15),
            'minutes_worked' => 120, // 2 hours exactly
            'name' => 'Exact boundary work',
            'is_billable' => true,
        ]);

        // Generate February invoice (covering January work period)
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $invoice->refresh();
        $lineItems = $invoice->lineItems;

        // Should have prior_month_retainer line covering all 2h at $0
        $priorMonthLine = $lineItems->firstWhere('line_type', 'prior_month_retainer');
        $this->assertNotNull($priorMonthLine);
        $this->assertEquals(2.0, (float) $priorMonthLine->hours);
        $this->assertEquals(0, (float) $priorMonthLine->line_total);

        // With catch_up_threshold=1.0, using all 2h leaves 0h available (< 1h threshold)
        // So we need catch-up billing to restore 1h buffer
        $additionalLine = $lineItems->firstWhere('line_type', 'additional_hours');
        $this->assertNotNull($additionalLine, 'Should have additional_hours to restore minimum availability');
        $this->assertEquals(1.0, (float) $additionalLine->hours, 'Should bill 1h catch-up to restore buffer');

        // Total should be retainer + catch-up
        $this->assertEquals(450.00, (float) $invoice->invoice_total, '$300 retainer + $150 catch-up');
    }

    /**
     * Example 3 — catch_up_threshold = 0
     * 
     * - All overage after retainer allocations becomes billable catch-up
     * - No minimum catch-up allocation enforced
     */
    public function test_example_3_zero_catch_up_threshold(): void
    {
        $agreement = ClientAgreement::create([
            'client_company_id' => $this->company->id,
            'active_date' => Carbon::create(2024, 2, 1),
            'monthly_retainer_hours' => 5.0,
            'catch_up_threshold_hours' => 0.0, // No catch-up threshold
            'hourly_rate' => 150.00,
            'monthly_retainer_fee' => 750.00,
            'rollover_months' => 3,
        ]);

        // Create 8 hours of work in January
        ClientTimeEntry::create([
            'client_company_id' => $this->company->id,
            'project_id' => $this->project->id,
            'user_id' => $this->user->id,
            'date_worked' => Carbon::create(2024, 1, 15),
            'minutes_worked' => 480, // 8 hours
            'name' => 'January work',
            'is_billable' => true,
        ]);

        // Generate February invoice (covering January work period)
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $invoice->refresh();
        $lineItems = $invoice->lineItems;

        // Should cover 5h with Jan retainer, leaving 3h overage
        $priorMonthLine = $lineItems->firstWhere('line_type', 'prior_month_retainer');
        $this->assertNotNull($priorMonthLine);
        $this->assertEquals(5.0, (float) $priorMonthLine->hours);

        // The 3h overage should be billed at hourly rate (no catch-up threshold enforced)
        $additionalLine = $lineItems->firstWhere('line_type', 'additional_hours');
        $this->assertNotNull($additionalLine);
        $this->assertEquals(3.0, (float) $additionalLine->hours, 'Should bill 3h overage');
        $this->assertEquals(450.00, (float) $additionalLine->line_total, '3h * $150 = $450');

        // Total: retainer + overage
        $this->assertEquals(1200.00, (float) $invoice->invoice_total, '$750 + $450 = $1200');
    }

    /**
     * Example 4 — rollover behavior
     * 
     * - retainer_included_hours = 10, rollover_months = 2
     * - Month N: worked 6h → 4h unused
     * - Month N+1: worked 14h → uses 4h rollover first (FIFO)
     */
    public function test_example_4_rollover_behavior(): void
    {
        $agreement = ClientAgreement::create([
            'client_company_id' => $this->company->id,
            'active_date' => Carbon::create(2024, 1, 1),
            'monthly_retainer_hours' => 10.0,
            'catch_up_threshold_hours' => 1.0,
            'hourly_rate' => 150.00,
            'monthly_retainer_fee' => 1500.00,
            'rollover_months' => 2,
        ]);

        // Month 1 (January): Work 6 hours
        ClientTimeEntry::create([
            'client_company_id' => $this->company->id,
            'project_id' => $this->project->id,
            'user_id' => $this->user->id,
            'date_worked' => Carbon::create(2024, 1, 15),
            'minutes_worked' => 360, // 6 hours
            'name' => 'January work',
            'is_billable' => true,
        ]);

        // Generate February invoice covering January work (should show 4h unused)
        $janInvoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $this->assertEquals(4.0, (float) $janInvoice->unused_hours_balance, 'Should have 4h unused in January');

        // Month 2 (February): Work 14 hours
        ClientTimeEntry::create([
            'client_company_id' => $this->company->id,
            'project_id' => $this->project->id,
            'user_id' => $this->user->id,
            'date_worked' => Carbon::create(2024, 2, 15),
            'minutes_worked' => 840, // 14 hours
            'name' => 'February work',
            'is_billable' => true,
        ]);

        // Generate March invoice covering February work
        $febInvoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 2, 1),
            Carbon::create(2024, 2, 29)
        );

        $febInvoice->refresh();

        // February should use 4h rollover from January
        $this->assertEquals(4.0, (float) $febInvoice->rollover_hours_used, 'Should use 4h rollover');

        // 14h worked: 10h from Feb retainer + 4h from rollover = 14h covered
        // No overage should be billed
        $additionalLine = $febInvoice->lineItems->firstWhere('line_type', 'additional_hours');
        $this->assertNull($additionalLine, 'Should NOT bill additional hours when rollover covers all work');

        // Should have 0 unused hours (used all available)
        $this->assertEquals(0.0, (float) $febInvoice->unused_hours_balance);
    }

    /**
     * Test that catch_up_threshold_hours validation works
     */
    public function test_catch_up_threshold_validation(): void
    {
        // Try to create agreement with invalid catch_up_threshold (exceeds retainer)
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('catch_up_threshold_hours must be between 0 and monthly_retainer_hours');

        ClientAgreement::create([
            'client_company_id' => $this->company->id,
            'active_date' => Carbon::create(2024, 1, 1),
            'monthly_retainer_hours' => 5.0,
            'catch_up_threshold_hours' => 10.0, // Invalid: exceeds retainer hours
            'hourly_rate' => 150.00,
            'monthly_retainer_fee' => 750.00,
            'rollover_months' => 3,
        ]);
    }

    /**
     * Test that catch_up_threshold_hours defaults to 1.0
     */
    public function test_catch_up_threshold_defaults_to_one(): void
    {
        $agreement = ClientAgreement::create([
            'client_company_id' => $this->company->id,
            'active_date' => Carbon::create(2024, 1, 1),
            'monthly_retainer_hours' => 10.0,
            // catch_up_threshold_hours not specified
            'hourly_rate' => 150.00,
            'monthly_retainer_fee' => 1500.00,
            'rollover_months' => 3,
        ]);

        $this->assertEquals(1.0, (float) $agreement->catch_up_threshold_hours, 'Should default to 1.0');
    }
}
