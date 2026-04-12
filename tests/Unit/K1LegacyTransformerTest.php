<?php

namespace Tests\Unit;

use App\Services\Finance\K1LegacyTransformer;
use PHPUnit\Framework\TestCase;

class K1LegacyTransformerTest extends TestCase
{
    private function legacySample(): array
    {
        return [
            'form_source' => 1065,
            'tax_year' => 2025,
            'partner_type' => 'INDIVIDUAL',
            'partner_name' => 'John Doe',
            'partner_ssn_last4' => '1234',
            'partner_ownership_pct' => 0.01007,
            'entity_name' => 'Example Fund LP',
            'entity_ein' => '12-3456789',
            'state' => 'DE, NY',
            'state_tax_withheld' => 0,
            'box1_ordinary_income' => 0,
            'box2_net_rental_real_estate' => 0,
            'box3_other_net_rental' => 0,
            'box4_guaranteed_payments_services' => 0,
            'box5_guaranteed_payments_capital' => 0,
            'box6_guaranteed_payments_total' => 0,
            'box7_net_section_1231_gain' => 0,
            'box8_other_income' => 0,
            'box9_section_179_deduction' => 0,
            'box10_other_deductions' => 1020,
            'distributions' => 0,
            'credits' => [],
            'amt_items' => [
                ['code' => '8', 'description' => 'Net short-term capital gain (loss)', 'amount' => -209],
            ],
            'other_coded_items' => [
                ['code' => 'AE', 'description' => 'Other deductions', 'amount' => 1049],
                ['code' => '13AE', 'description' => 'Other deductions - portfolio', 'amount' => 1020],
            ],
            'other_info_items' => [
                ['code' => 'K1', 'description' => 'Nonrecourse liabilities (Ending)', 'amount' => 1412],
            ],
            'supplemental_statements' => 'Management fees $800.',
        ];
    }

    public function test_is_legacy_returns_true_when_no_schema_version(): void
    {
        $this->assertTrue(K1LegacyTransformer::isLegacy($this->legacySample()));
    }

    public function test_is_legacy_returns_false_when_schema_version_present(): void
    {
        $this->assertFalse(K1LegacyTransformer::isLegacy(['schemaVersion' => '2026.1', 'fields' => []]));
        $this->assertFalse(K1LegacyTransformer::isLegacy(['schemaVersion' => '1.0', 'fields' => []]));
    }

    public function test_transform_sets_schema_version_1_0(): void
    {
        $result = K1LegacyTransformer::transform($this->legacySample());

        $this->assertSame('1.0', $result['schemaVersion']);
    }

    public function test_transform_maps_letter_fields(): void
    {
        $result = K1LegacyTransformer::transform($this->legacySample());

        $this->assertSame('12-3456789', $result['fields']['A']['value']);
        $this->assertSame('Example Fund LP', $result['fields']['B']['value']);
        $this->assertSame('1234', $result['fields']['E']['value']);
        $this->assertSame('John Doe', $result['fields']['F']['value']);
        $this->assertSame('INDIVIDUAL', $result['fields']['I1']['value']);
    }

    public function test_transform_maps_numeric_box_fields(): void
    {
        $result = K1LegacyTransformer::transform($this->legacySample());

        $this->assertSame('1020', $result['fields']['10']['value']);
        // Zero values are still mapped
        $this->assertSame('0', $result['fields']['1']['value']);
    }

    public function test_transform_maps_ownership_pct_to_field_j(): void
    {
        $result = K1LegacyTransformer::transform($this->legacySample());

        $this->assertStringContainsString('0.01007', $result['fields']['J']['value']);
    }

    public function test_transform_parses_combined_box_letter_code(): void
    {
        // "13AE" → box 13, code AE
        $result = K1LegacyTransformer::transform($this->legacySample());

        $this->assertArrayHasKey('13', $result['codes']);
        $codes13 = $result['codes']['13'];
        $this->assertSame('AE', $codes13[0]['code']);
        $this->assertSame('1020', $codes13[0]['value']);
    }

    public function test_transform_moves_amt_items_to_codes(): void
    {
        $result = K1LegacyTransformer::transform($this->legacySample());

        $this->assertArrayHasKey('8', $result['codes']);
        $this->assertStringContainsString('[AMT]', $result['codes']['8'][0]['notes']);
        $this->assertSame('-209', $result['codes']['8'][0]['value']);
    }

    public function test_transform_moves_other_info_items_to_codes(): void
    {
        $result = K1LegacyTransformer::transform($this->legacySample());

        $this->assertArrayHasKey('K1', $result['codes']);
        $this->assertSame('1412', $result['codes']['K1'][0]['value']);
    }

    public function test_transform_maps_supplemental_to_raw_text(): void
    {
        $result = K1LegacyTransformer::transform($this->legacySample());

        $this->assertSame('Management fees $800.', $result['raw_text']);
    }

    public function test_transform_preserves_original_in_legacy_fields(): void
    {
        $legacy = $this->legacySample();
        $result = K1LegacyTransformer::transform($legacy);

        $this->assertSame($legacy, $result['legacyFields']);
    }

    public function test_transform_detects_form_1120s(): void
    {
        $legacy = $this->legacySample();
        $legacy['form_source'] = 1120;
        $result = K1LegacyTransformer::transform($legacy);

        $this->assertSame('K-1-1120S', $result['formType']);
    }

    public function test_transform_defaults_to_1065(): void
    {
        $result = K1LegacyTransformer::transform($this->legacySample());

        $this->assertSame('K-1-1065', $result['formType']);
    }

    public function test_transform_sets_extraction_source_to_legacy_migration(): void
    {
        $result = K1LegacyTransformer::transform($this->legacySample());

        $this->assertSame('legacy_migration', $result['extraction']['source']);
    }

    public function test_transform_preserves_letter_only_codes_in_unknown_bucket(): void
    {
        // "AE" in other_coded_items has no box-number prefix, so it can't be mapped
        // to a specific codes[] key. It must land in codes["_unknown"] rather than
        // being silently dropped.
        $result = K1LegacyTransformer::transform($this->legacySample());

        $this->assertArrayHasKey('_unknown', $result['codes'], 'Letter-only codes must be preserved in _unknown bucket');
        $unknownCodes = $result['codes']['_unknown'];
        $this->assertCount(1, $unknownCodes);
        $this->assertSame('AE', $unknownCodes[0]['code']);
        $this->assertSame('1049', $unknownCodes[0]['value']);
    }

    public function test_transform_is_idempotent_via_is_legacy_guard(): void
    {
        $legacy = $this->legacySample();
        $transformed = K1LegacyTransformer::transform($legacy);

        // After transformation, isLegacy should return false
        $this->assertFalse(K1LegacyTransformer::isLegacy($transformed));
    }
}
