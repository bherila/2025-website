<?php

namespace Tests\Unit\Finance;

use App\Services\Finance\MoneyMath;
use App\Services\Finance\TaxPreviewFacts\Builders\EquityCompensationFactsBuilder;
use App\Services\Planning\OpportunityCost\JobSpec;
use PHPUnit\Framework\TestCase;

class EquityCompensationFactsBuilderTest extends TestCase
{
    public function test_builds_equity_comp_sources_form6251_amt_and_after_tax_cash_flow(): void
    {
        $job = JobSpec::nullableFromArray([
            'id' => 'offer',
            'name' => 'Offer',
            'company' => [
                'type' => 'public',
                'currentSharePrice' => 20.0,
            ],
            'comp' => [
                'baseSalary' => 200000.0,
                'cashBonus' => 50000.0,
            ],
            'optionGrants' => [
                [
                    'id' => 'iso-1',
                    'type' => 'iso',
                    'strike' => 5.0,
                    'earlyExercise83b' => false,
                ],
                [
                    'id' => 'nso-1',
                    'type' => 'nso',
                    'strike' => 8.0,
                    'earlyExercise83b' => true,
                ],
            ],
        ], false);

        $this->assertInstanceOf(JobSpec::class, $job);

        $facts = (new EquityCompensationFactsBuilder)->build(
            $job,
            [
                ['grantId' => 'iso-1', 'type' => 'iso', 'year' => 2026, 'vestedShares' => 10000.0, 'exercisableShares' => 10000.0],
                ['grantId' => 'nso-1', 'type' => 'nso', 'year' => 2026, 'vestedShares' => 500.0, 'exercisableShares' => 500.0],
            ],
            [[
                'year' => 2026,
                'salary' => 200000.0,
                'bonus' => 50000.0,
                'vestedLiquidEquity' => 10000.0,
                'shareSaleProceeds' => 10000.0,
                'exerciseOutlay' => 54000.0,
                'freeCashFlow' => 253000.0,
            ]],
            ['low' => 253000.0, 'medium' => 253000.0, 'high' => 253000.0],
        )->toArray();

        $annual = $facts['annual'][0];

        $this->assertSame(256000.0, $annual['taxableCompIncome']);
        $this->assertSame(6000.0, $annual['nsoOrdinaryIncome']);
        $this->assertSame(150000.0, $annual['isoAmtPreference']);
        $this->assertSame(10000.0, $annual['equitySaleProceeds']);
        $this->assertSame(MoneyMath::add($annual['estimatedRegularTax'], $annual['estimatedAmt']), $annual['totalEstimatedTax']);
        $this->assertSame(MoneyMath::subtract(253000.0, $annual['totalEstimatedTax']), $annual['freeCashFlow']);
        $this->assertGreaterThan(0.0, $annual['estimatedAmt']);

        $sourceTypes = array_column($facts['sources'], 'sourceType');
        $this->assertContains('equity_comp_iso_bargain_element', $sourceTypes);
        $this->assertContains('equity_comp_nso_ordinary_income', $sourceTypes);
        $this->assertContains('equity_comp_83b_election', $sourceTypes);
        $this->assertContains('equity_comp_sale_proceeds', $sourceTypes);

        $this->assertSame(2026, $facts['form6251'][0]['year']);
        $this->assertSame(150000.0, $facts['form6251'][0]['facts']['line3OtherAdjustments']);
        $this->assertSame($annual['estimatedAmt'], $facts['form6251'][0]['facts']['amt']);
        $this->assertSame(MoneyMath::subtract(253000.0, $annual['totalEstimatedTax']), $facts['lifetime']['totalValue']['medium']);
    }
}
