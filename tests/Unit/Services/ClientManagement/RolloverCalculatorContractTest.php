<?php

namespace Tests\Unit\Services\ClientManagement;

use App\Services\ClientManagement\RolloverCalculator;
use PHPUnit\Framework\TestCase;

class RolloverCalculatorContractTest extends TestCase
{
    private RolloverCalculator $calculator;

    protected function setUp(): void
    {
        parent::setUp();
        $this->calculator = new RolloverCalculator();
    }

    /**
     * Test Contract Section 2.3: "If Contractor performs more than the retainer hours...
     * the excess hours (“Additional Hours”) will create a negative hours balance.
     * This negative balance will be offset against the retainer hours available in the following month."
     */
    public function test_excess_hours_create_negative_balance_not_immediate_billing(): void
    {
        // Scenario: 10 hours retainer, 12 hours worked.
        // Should result in 2 hours negative balance, 0 excess (billed) hours.
        $result = $this->calculator->calculateClosingBalance(
            totalAvailable: 10.0,
            hoursWorked: 12.0,
            retainerHours: 10.0,
            rolloverHours: 0.0
        );

        // CURRENT BUG: The code sets excess_hours = 2.0 and negative_balance = 0.0
        // REQUIRED: excess_hours = 0.0, negative_balance = 2.0
        
        $this->assertEquals(0.0, $result['excess_hours'], 'Excess hours should be 0 (carried forward instead)');
        $this->assertEquals(2.0, $result['negative_balance'], 'Should create a negative balance of 2.0');
    }

    /**
     * Test Contract Section 2.3: "If any portion of the negative balance remains after one (1) month,
     * the remaining negative hours will be invoiced"
     */
    public function test_negative_balance_offset_and_invoicing(): void
    {
        // Scenario: Previous negative balance of 15.0. Current retainer 10.0.
        // 10.0 should be offset.
        // 5.0 should be remaining/invoiced.
        
        $result = $this->calculator->calculateOpeningBalance(
            retainerHours: 10.0,
            previousMonthsUnused: [],
            rolloverMonths: 2,
            previousNegativeBalance: 15.0
        );

        $this->assertEquals(10.0, $result['negative_offset'], 'Should offset max possible (retainer hours)');
        $this->assertEquals(0.0, $result['effective_retainer_hours'], 'Effective retainer should be 0');
        
        // We need to check if the calculator exposes the invoiced amount
        // Currently it might not. This test asserts expectation of exposing it.
        // If the key doesn't exist, this helps us identify we need to add it.
        $this->assertArrayHasKey('invoiced_negative_balance', $result, 'Should identify the portion of negative balance that could not be offset');
        $this->assertEquals(5.0, $result['invoiced_negative_balance'], '5.0 hours should be invoiced as they remained after offset');
    }
}
