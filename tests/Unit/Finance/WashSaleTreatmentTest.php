<?php

namespace Tests\Unit\Finance;

use App\Enums\Finance\WashSaleTreatment;
use App\Services\Finance\CapitalGains\WashSaleTreatmentApplier;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class WashSaleTreatmentTest extends TestCase
{
    /**
     * Parameterized: each scenario asserts the Form 8949 column (h) gain/loss
     * that {@see WashSaleTreatmentApplier::adjustedForm8949GainLoss()} must
     * produce given a synthetic broker-reported lot.
     *
     * @return array<string, array{0: WashSaleTreatment, 1: float, 2: float, 3: float}>
     */
    public static function treatmentScenarios(): array
    {
        return [
            // Broker reported gross_of_wash_sales: proceeds 667,784.17,
            // cost basis 759,965.30, realized G/L -92,181.13, wash-sale
            // disallowed 58,809.49 → adjusted G/L = -33,371.64.
            'gross_of_wash_sales adds wash-sale disallowed once' => [
                WashSaleTreatment::GrossOfWashSales,
                -92181.13,
                58809.49,
                -33371.64,
            ],
            // Broker says wash-sale is already included in cost basis. The
            // realized G/L already reflects it. Adjusted G/L = realized G/L.
            'already_reflected_in_cost_basis leaves realized G/L untouched' => [
                WashSaleTreatment::AlreadyReflectedInCostBasis,
                -65907.22,
                536.36,
                -65907.22,
            ],
            // Broker's displayed net G/L already equals proceeds − basis +
            // wash sale. Adjusted G/L = displayed net G/L.
            'net_gain_loss_already_includes_wash_sale_column trusts the broker' => [
                WashSaleTreatment::NetGainLossAlreadyIncludesWashSaleColumn,
                -141.50,
                250.00,
                -141.50,
            ],
            // Broker summary reports no wash-sale amount. Adjusted G/L =
            // displayed realized G/L (wash_sale_disallowed should be 0 here).
            'no_wash_sale_amount returns realized G/L unchanged' => [
                WashSaleTreatment::NoWashSaleAmount,
                4250.75,
                0.0,
                4250.75,
            ],
        ];
    }

    #[DataProvider('treatmentScenarios')]
    public function test_adjusted_form_8949_gain_loss_per_treatment(
        WashSaleTreatment $treatment,
        float $realizedGainLoss,
        float $washSaleDisallowed,
        float $expected,
    ): void {
        $applier = new WashSaleTreatmentApplier;

        $actual = $applier->adjustedForm8949GainLoss(
            realizedGainLoss: $realizedGainLoss,
            washSaleDisallowed: $washSaleDisallowed,
            treatment: $treatment,
        );

        $this->assertEqualsWithDelta($expected, $actual, 0.005);
    }

    public function test_negative_wash_sale_disallowed_is_treated_as_positive(): void
    {
        $applier = new WashSaleTreatmentApplier;

        $actual = $applier->adjustedForm8949GainLoss(
            realizedGainLoss: -100.0,
            washSaleDisallowed: -25.0,
            treatment: WashSaleTreatment::GrossOfWashSales,
        );

        $this->assertEqualsWithDelta(-75.0, $actual, 0.005);
    }

    public function test_default_treatment_is_gross_of_wash_sales(): void
    {
        $this->assertSame(WashSaleTreatment::GrossOfWashSales, WashSaleTreatment::default());
    }

    public function test_try_from_scalar_maps_known_keys(): void
    {
        $this->assertSame(
            WashSaleTreatment::GrossOfWashSales,
            WashSaleTreatment::tryFromScalar('gross_of_wash_sales'),
        );
        $this->assertSame(
            WashSaleTreatment::AlreadyReflectedInCostBasis,
            WashSaleTreatment::tryFromScalar(' already_reflected_in_cost_basis '),
        );
        $this->assertNull(WashSaleTreatment::tryFromScalar('unknown_value'));
        $this->assertNull(WashSaleTreatment::tryFromScalar(null));
    }

    public function test_fixture_keys_match_enum_values(): void
    {
        $fixturePath = __DIR__.'/../../Fixtures/Finance/wash-sale-treatments-2025.json';
        $contents = file_get_contents($fixturePath);
        $this->assertNotFalse($contents, 'wash-sale-treatments-2025.json fixture must exist');

        /** @var array<int, array{treatment: string}> $entries */
        $entries = json_decode($contents, true, flags: JSON_THROW_ON_ERROR);
        $fixtureKeys = array_column($entries, 'treatment');
        sort($fixtureKeys);

        $enumValues = array_map(static fn (WashSaleTreatment $case): string => $case->value, WashSaleTreatment::cases());
        sort($enumValues);

        $this->assertSame($enumValues, $fixtureKeys);
    }
}
