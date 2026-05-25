<?php

namespace Tests\Unit\Finance;

use App\Services\Finance\CapitalGains\BrokerWashSaleTreatmentNormalizer;
use PHPUnit\Framework\TestCase;

class BrokerWashSaleTreatmentNormalizerTest extends TestCase
{
    public function test_gross_of_wash_sales_adds_wash_sale_once(): void
    {
        $result = $this->normalizer()->normalizeAmounts(
            proceeds: 1000.0,
            costBasis: 1200.0,
            reportedGainLoss: -200.0,
            washSaleDisallowed: 50.0,
            treatment: 'gross_of_wash_sales',
        );

        $this->assertSame(-150.0, $result['realized_gain_loss']);
        $this->assertSame(50.0, $result['wash_sale_disallowed']);
        $this->assertSame(BrokerWashSaleTreatmentNormalizer::TREATMENT_GROSS_OF_WASH_SALES, $result['wash_sale_treatment']);
    }

    public function test_already_reflected_in_cost_basis_zeroes_wash_sale_adjustment(): void
    {
        $result = $this->normalizer()->normalizeAmounts(
            proceeds: 1000.0,
            costBasis: 1200.0,
            reportedGainLoss: -200.0,
            washSaleDisallowed: 50.0,
            treatment: 'already_reflected_in_cost_basis',
        );

        $this->assertSame(-200.0, $result['realized_gain_loss']);
        $this->assertSame(0.0, $result['wash_sale_disallowed']);
        $this->assertSame(BrokerWashSaleTreatmentNormalizer::TREATMENT_ALREADY_REFLECTED_IN_COST_BASIS, $result['wash_sale_treatment']);
        $this->assertIsString($result['note']);
    }

    public function test_already_net_of_wash_sales_preserves_form_8949_adjustment(): void
    {
        $result = $this->normalizer()->normalizeAmounts(
            proceeds: 1000.0,
            costBasis: 1200.0,
            reportedGainLoss: -150.0,
            washSaleDisallowed: 50.0,
            treatment: 'already_net_of_wash_sales',
        );

        $this->assertSame(-150.0, $result['realized_gain_loss']);
        $this->assertSame(50.0, $result['wash_sale_disallowed']);
        $this->assertSame(BrokerWashSaleTreatmentNormalizer::TREATMENT_ALREADY_NET_OF_WASH_SALES, $result['wash_sale_treatment']);
    }

    public function test_unknown_treatment_infers_net_when_reported_gain_matches_form_8949_math(): void
    {
        $result = $this->normalizer()->normalizeAmounts(
            proceeds: 1000.0,
            costBasis: 1200.0,
            reportedGainLoss: -150.0,
            washSaleDisallowed: 50.0,
            treatment: null,
        );

        $this->assertSame(-150.0, $result['realized_gain_loss']);
        $this->assertSame(50.0, $result['wash_sale_disallowed']);
        $this->assertSame(BrokerWashSaleTreatmentNormalizer::TREATMENT_ALREADY_NET_OF_WASH_SALES, $result['wash_sale_treatment']);
    }

    public function test_treatment_aliases_are_normalized(): void
    {
        $normalizer = $this->normalizer();

        $this->assertSame(
            BrokerWashSaleTreatmentNormalizer::TREATMENT_ALREADY_REFLECTED_IN_COST_BASIS,
            $normalizer->normalizeTreatment('Included in cost basis'),
        );
        $this->assertSame(
            BrokerWashSaleTreatmentNormalizer::TREATMENT_GROSS_OF_WASH_SALES,
            $normalizer->normalizeTreatment('separate W adjustment'),
        );
        $this->assertSame(
            BrokerWashSaleTreatmentNormalizer::TREATMENT_GROSS_OF_WASH_SALES,
            $normalizer->normalizeTreatment('gain_loss_gross_of_wash_sales'),
        );
        $this->assertSame(
            BrokerWashSaleTreatmentNormalizer::TREATMENT_ALREADY_REFLECTED_IN_COST_BASIS,
            $normalizer->normalizeTreatment('gain_loss_already_reflects_wash_sales_in_basis'),
        );
        $this->assertSame(
            BrokerWashSaleTreatmentNormalizer::TREATMENT_ALREADY_NET_OF_WASH_SALES,
            $normalizer->normalizeTreatment('net_gain_loss_already_includes_wash_sale_column'),
        );
        $this->assertSame(
            BrokerWashSaleTreatmentNormalizer::TREATMENT_NO_WASH_SALE_AMOUNT,
            $normalizer->normalizeTreatment('no_wash_sale_amount_in_source_summary'),
        );
    }

    private function normalizer(): BrokerWashSaleTreatmentNormalizer
    {
        return new BrokerWashSaleTreatmentNormalizer;
    }
}
