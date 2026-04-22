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

    // ── passive_activities (Box 23 supplemental statement) ───────────────────

    public function test_passive_activities_absent_when_not_in_args(): void
    {
        $result = $this->coerce([]);
        $this->assertArrayNotHasKey('passiveActivities', $result);
    }

    public function test_passive_activities_absent_when_empty_array(): void
    {
        $result = $this->coerce(['passive_activities' => []]);
        $this->assertArrayNotHasKey('passiveActivities', $result);
    }

    public function test_passive_activities_maps_income_and_loss(): void
    {
        $result = $this->coerce([
            'passive_activities' => [
                ['name' => 'Section 1256 activity', 'current_income' => 32545.0, 'current_loss' => 0.0],
                ['name' => 'Other passive activity', 'current_income' => 0.0, 'current_loss' => -38825.0],
            ],
        ]);

        $pa = $result['passiveActivities'] ?? null;
        $this->assertNotNull($pa);
        $this->assertCount(2, $pa);

        $this->assertSame('Section 1256 activity', $pa[0]['name']);
        $this->assertSame(32545.0, $pa[0]['currentIncome']);
        $this->assertSame(0.0, $pa[0]['currentLoss']);

        $this->assertSame('Other passive activity', $pa[1]['name']);
        $this->assertSame(0.0, $pa[1]['currentIncome']);
        $this->assertSame(-38825.0, $pa[1]['currentLoss']);
    }

    public function test_passive_activities_clamps_income_to_non_negative(): void
    {
        // current_income must never be negative; clamp to 0.
        $result = $this->coerce([
            'passive_activities' => [
                ['name' => 'Loss-only activity', 'current_income' => -5000.0, 'current_loss' => -5000.0],
            ],
        ]);

        $pa = $result['passiveActivities'][0];
        $this->assertSame(0.0, $pa['currentIncome']);
        $this->assertSame(-5000.0, $pa['currentLoss']);
    }

    public function test_passive_activities_clamps_loss_to_non_positive(): void
    {
        // current_loss must never be positive; clamp to 0.
        $result = $this->coerce([
            'passive_activities' => [
                ['name' => 'Income-only activity', 'current_income' => 10000.0, 'current_loss' => 10000.0],
            ],
        ]);

        $pa = $result['passiveActivities'][0];
        $this->assertSame(10000.0, $pa['currentIncome']);
        $this->assertSame(0.0, $pa['currentLoss']);
    }

    public function test_passive_activities_drops_entries_without_name(): void
    {
        $result = $this->coerce([
            'passive_activities' => [
                ['current_income' => 1000.0, 'current_loss' => 0.0], // missing 'name'
                ['name' => 'Valid activity', 'current_income' => 500.0, 'current_loss' => 0.0],
            ],
        ]);

        $pa = $result['passiveActivities'] ?? null;
        $this->assertNotNull($pa);
        $this->assertCount(1, $pa);
        $this->assertSame('Valid activity', $pa[0]['name']);
    }

    public function test_passive_activities_drops_non_array_items(): void
    {
        $result = $this->coerce([
            'passive_activities' => [
                'not-an-array',
                ['name' => 'Real activity', 'current_income' => 100.0, 'current_loss' => 0.0],
            ],
        ]);

        $this->assertCount(1, $result['passiveActivities']);
    }

    public function test_passive_activities_defaults_missing_numeric_fields_to_zero(): void
    {
        $result = $this->coerce([
            'passive_activities' => [
                ['name' => 'Activity with no amounts'],
            ],
        ]);

        $pa = $result['passiveActivities'][0];
        $this->assertSame(0.0, $pa['currentIncome']);
        $this->assertSame(0.0, $pa['currentLoss']);
    }
}
