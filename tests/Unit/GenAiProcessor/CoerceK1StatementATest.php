<?php

namespace Tests\Unit\GenAiProcessor;

use App\GenAiProcessor\Services\GenAiJobDispatcherService;
use ReflectionMethod;
use Tests\TestCase;

/**
 * Tests the §199A Statement A extraction logic inside GenAiJobDispatcherService::coerceK1Args().
 *
 * coerceK1Args() is private; we invoke it via reflection. Extends Tests\TestCase so that
 * Laravel facades (now(), Log::, etc.) are available during the call.
 */
class CoerceK1StatementATest extends TestCase
{
    private function coerce(array $args): array
    {
        $service = new GenAiJobDispatcherService;
        $method = new ReflectionMethod(GenAiJobDispatcherService::class, 'coerceK1Args');
        $method->setAccessible(true);

        return $method->invoke($service, $args);
    }

    public function test_statement_a_absent_when_not_in_args(): void
    {
        $result = $this->coerce([]);
        $this->assertArrayNotHasKey('statementA', $result);
    }

    public function test_statement_a_absent_when_missing_required_qbi_field(): void
    {
        // statement_a present but no qualified_business_income → should be ignored
        $result = $this->coerce([
            'statement_a' => ['trade_name' => 'Acme LLC'],
        ]);
        $this->assertArrayNotHasKey('statementA', $result);
    }

    public function test_statement_a_maps_all_fields(): void
    {
        $result = $this->coerce([
            'statement_a' => [
                'trade_name' => 'AQR Delphi Fund',
                'qualified_business_income' => 50000,
                'w2_wages' => 120000,
                'ubia' => 300000,
                'reit_dividends' => 2500,
                'ptp_income' => 1000,
                'is_sstb' => true,
            ],
        ]);

        $sa = $result['statementA'] ?? null;
        $this->assertNotNull($sa);
        $this->assertSame('AQR Delphi Fund', $sa['tradeName']);
        $this->assertSame(50000.0, $sa['qualifiedBusinessIncome']);
        $this->assertSame(120000.0, $sa['w2Wages']);
        $this->assertSame(300000.0, $sa['ubia']);
        $this->assertSame(2500.0, $sa['reitDividends']);
        $this->assertSame(1000.0, $sa['ptpIncome']);
        $this->assertTrue($sa['isSstb']);
    }

    public function test_statement_a_defaults_numeric_fields_to_zero(): void
    {
        $result = $this->coerce([
            'statement_a' => [
                'qualified_business_income' => 30000,
                // w2_wages, ubia, reit_dividends, ptp_income intentionally absent
            ],
        ]);

        $sa = $result['statementA'];
        $this->assertSame(30000.0, $sa['qualifiedBusinessIncome']);
        $this->assertSame(0.0, $sa['w2Wages']);
        $this->assertSame(0.0, $sa['ubia']);
        $this->assertSame(0.0, $sa['reitDividends']);
        $this->assertSame(0.0, $sa['ptpIncome']);
        $this->assertFalse($sa['isSstb']);
        $this->assertArrayNotHasKey('tradeName', $sa);
    }

    public function test_statement_a_handles_negative_qbi(): void
    {
        $result = $this->coerce([
            'statement_a' => ['qualified_business_income' => -12345.67],
        ]);

        $this->assertSame(-12345.67, $result['statementA']['qualifiedBusinessIncome']);
    }

    public function test_statement_a_omits_trade_name_when_empty_string(): void
    {
        $result = $this->coerce([
            'statement_a' => [
                'qualified_business_income' => 1000,
                'trade_name' => '',
            ],
        ]);

        $this->assertArrayNotHasKey('tradeName', $result['statementA']);
    }

    public function test_statement_a_coerces_is_sstb_truthy_integer(): void
    {
        $result = $this->coerce([
            'statement_a' => [
                'qualified_business_income' => 1000,
                'is_sstb' => 1,
            ],
        ]);

        $this->assertTrue($result['statementA']['isSstb']);
    }

    public function test_statement_a_string_false_does_not_set_is_sstb_true(): void
    {
        // PHP (bool)"false" = true — the normalized parser must handle this correctly
        $result = $this->coerce([
            'statement_a' => [
                'qualified_business_income' => 1000,
                'is_sstb' => 'false',
            ],
        ]);

        $this->assertFalse($result['statementA']['isSstb']);
    }

    public function test_statement_a_string_true_sets_is_sstb(): void
    {
        $result = $this->coerce([
            'statement_a' => [
                'qualified_business_income' => 1000,
                'is_sstb' => 'true',
            ],
        ]);

        $this->assertTrue($result['statementA']['isSstb']);
    }
}
