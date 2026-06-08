<?php

namespace Tests\Unit\Finance;

use App\Services\Finance\K1CodeCharacterResolver;
use App\Services\Finance\MoneyMath;
use App\Services\Finance\TaxPreviewFacts\Builders\EquityCompensationFactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Builders\Form6251FactsBuilder;
use App\Services\Planning\CareerComp\JobSpec;
use App\Support\Finance\FederalIncomeTax;
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

    public function test_private_option_bargain_element_uses_common_fmv_not_preferred_share_price(): void
    {
        $job = JobSpec::nullableFromArray([
            'id' => 'private-offer',
            'name' => 'Private offer',
            'company' => [
                'type' => 'private',
                'currentSharePrice' => 29.134,
                'fourNineA' => 2.8,
                'fullyDilutedShares' => 6178405,
                'valuationScenarios' => [[
                    'id' => 'base',
                    'label' => 'Base',
                    'outcome' => 'medium',
                    'stages' => [[
                        'year' => 2026,
                        'stage' => 'A',
                        'preferredPostMoneyValuation' => 180001651,
                        'capitalDilutionPct' => 0,
                        'employeePoolDilutionPct' => 0,
                        'commonFmv' => 2.8,
                        'liquidityEvent' => false,
                    ]],
                ]],
            ],
            'comp' => [
                'baseSalary' => 280000.0,
                'cashBonus' => 0.0,
            ],
            'optionGrants' => [[
                'id' => 'iso-hire',
                'type' => 'iso',
                'strike' => 2.8,
                'earlyExercise83b' => true,
            ]],
        ], false);

        $this->assertInstanceOf(JobSpec::class, $job);

        $facts = (new EquityCompensationFactsBuilder)->build(
            $job,
            [
                ['grantId' => 'iso-hire', 'type' => 'iso', 'year' => 2026, 'vestedShares' => 35714.2857, 'exercisableShares' => 35714.2857],
                ['grantId' => 'iso-hire', 'type' => 'nso', 'year' => 2026, 'vestedShares' => 26069.7643, 'exercisableShares' => 26069.7643],
            ],
            [[
                'year' => 2026,
                'salary' => 280000.0,
                'bonus' => 0.0,
                'vestedLiquidEquity' => 0.0,
                'shareSaleProceeds' => 0.0,
                'exerciseOutlay' => 172995.34,
                'freeCashFlow' => 107004.66,
            ]],
            ['low' => 107004.66, 'medium' => 107004.66, 'high' => 107004.66],
        )->toArray();

        $annual = $facts['annual'][0];

        $this->assertSame(280000.0, $annual['taxableCompIncome']);
        $this->assertSame(0.0, $annual['nsoOrdinaryIncome']);
        $this->assertSame(0.0, $annual['isoAmtPreference']);
        $this->assertSame(0.0, $annual['estimatedAmt']);
        $this->assertSame(MoneyMath::subtract(107004.66, $annual['estimatedRegularTax']), $annual['freeCashFlow']);
        $this->assertGreaterThan(0.0, $annual['freeCashFlow']);
        $this->assertSame([], $facts['form6251']);

        $sourceTypes = array_column($facts['sources'], 'sourceType');
        $this->assertNotContains('equity_comp_iso_bargain_element', $sourceTypes);
        $this->assertNotContains('equity_comp_nso_ordinary_income', $sourceTypes);
        $this->assertContains('equity_comp_83b_election', $sourceTypes);
    }

    public function test_private_option_bargain_element_preserves_explicit_common_fmv_without_diluted_shares(): void
    {
        $job = JobSpec::nullableFromArray([
            'id' => 'private-no-shares',
            'name' => 'Private no shares',
            'company' => [
                'type' => 'private',
                'fourNineA' => 2.8,
                'valuationScenarios' => [[
                    'id' => 'base',
                    'label' => 'Base',
                    'outcome' => 'medium',
                    'stages' => [[
                        'year' => 2026,
                        'stage' => 'A',
                        'commonFmv' => 12.8,
                        'liquidityEvent' => false,
                    ]],
                ]],
            ],
            'comp' => [
                'baseSalary' => 0.0,
                'cashBonus' => 0.0,
            ],
            'optionGrants' => [[
                'id' => 'nso-hire',
                'type' => 'nso',
                'strike' => 2.8,
                'earlyExercise83b' => true,
            ]],
        ], false);

        $this->assertInstanceOf(JobSpec::class, $job);

        $facts = (new EquityCompensationFactsBuilder)->build(
            $job,
            [
                ['grantId' => 'nso-hire', 'type' => 'nso', 'year' => 2026, 'vestedShares' => 1000.0, 'exercisableShares' => 1000.0],
            ],
            [[
                'year' => 2026,
                'salary' => 0.0,
                'bonus' => 0.0,
                'vestedLiquidEquity' => 0.0,
                'shareSaleProceeds' => 0.0,
                'exerciseOutlay' => 2800.0,
                'freeCashFlow' => -2800.0,
            ]],
            ['low' => -2800.0, 'medium' => -2800.0, 'high' => -2800.0],
        )->toArray();

        $annual = $facts['annual'][0];

        $this->assertSame(10000.0, $annual['taxableCompIncome']);
        $this->assertSame(10000.0, $annual['nsoOrdinaryIncome']);
        $this->assertSame(0.0, $annual['isoAmtPreference']);

        $sources = array_column($facts['sources'], 'amount', 'sourceType');
        $this->assertSame(10000.0, $sources['equity_comp_nso_ordinary_income']);
        $this->assertSame(10000.0, $sources['equity_comp_83b_election']);
    }

    public function test_equity_capital_gain_uses_preferential_regular_tax_path(): void
    {
        $job = JobSpec::nullableFromArray([
            'id' => 'private-exit',
            'name' => 'Private exit',
            'company' => [
                'type' => 'private',
                'fourNineA' => 2.0,
            ],
            'comp' => [
                'baseSalary' => 0.0,
                'cashBonus' => 0.0,
            ],
        ], false);

        $this->assertInstanceOf(JobSpec::class, $job);

        $facts = (new EquityCompensationFactsBuilder)->build(
            $job,
            [],
            [[
                'year' => 2025,
                'salary' => 0.0,
                'bonus' => 0.0,
                'vestedLiquidEquity' => 500000.0,
                'shareSaleProceeds' => 500000.0,
                'equitySaleBasis' => 5000.0,
                'equityCapitalGain' => 495000.0,
                'exerciseOutlay' => 0.0,
                'freeCashFlow' => 500000.0,
            ]],
            ['low' => 500000.0, 'medium' => 500000.0, 'high' => 500000.0],
        )->toArray();

        $annual = $facts['annual'][0];
        $expectedRegularTax = MoneyMath::round(FederalIncomeTax::regularTax(495000.0, 2025, false, 0.0, 495000.0));

        $this->assertSame(0.0, $annual['taxableCompIncome']);
        $this->assertSame(495000.0, $annual['totalTaxableIncome']);
        $this->assertSame(500000.0, $annual['equitySaleProceeds']);
        $this->assertSame(495000.0, $annual['equityCapitalGain']);
        $this->assertSame($expectedRegularTax, $annual['estimatedRegularTax']);
        $this->assertSame(0.0, $annual['estimatedAmt']);
        $this->assertSame(MoneyMath::subtract(500000.0, $expectedRegularTax), $annual['freeCashFlow']);
        $this->assertSame(495000.0, $facts['lifetime']['equityCapitalGain']);

        $sourceTypes = array_column($facts['sources'], 'sourceType');
        $this->assertContains('equity_comp_sale_proceeds', $sourceTypes);
        $this->assertContains('equity_comp_long_term_capital_gain', $sourceTypes);
    }

    public function test_form6251_taxable_income_includes_equity_capital_gain_for_mixed_iso_exit_year(): void
    {
        $job = JobSpec::nullableFromArray([
            'id' => 'mixed-iso-exit',
            'name' => 'Mixed ISO exit',
            'company' => [
                'type' => 'public',
                'currentSharePrice' => 30.0,
            ],
            'comp' => [
                'baseSalary' => 0.0,
                'cashBonus' => 0.0,
            ],
            'optionGrants' => [[
                'id' => 'iso-1',
                'type' => 'iso',
                'strike' => 10.0,
                'earlyExercise83b' => false,
            ]],
        ], false);

        $this->assertInstanceOf(JobSpec::class, $job);

        $facts = (new EquityCompensationFactsBuilder)->build(
            $job,
            [
                ['grantId' => 'iso-1', 'type' => 'iso', 'year' => 2026, 'vestedShares' => 10000.0, 'exercisableShares' => 10000.0],
            ],
            [[
                'year' => 2026,
                'salary' => 0.0,
                'bonus' => 0.0,
                'vestedLiquidEquity' => 700000.0,
                'shareSaleProceeds' => 700000.0,
                'equitySaleBasis' => 100000.0,
                'equityCapitalGain' => 600000.0,
                'exerciseOutlay' => 100000.0,
                'freeCashFlow' => 600000.0,
            ]],
            ['low' => 700000.0, 'medium' => 700000.0, 'high' => 700000.0],
        )->toArray();

        $annual = $facts['annual'][0];
        $form6251 = $facts['form6251'][0]['facts'];

        $this->assertSame(600000.0, $annual['totalTaxableIncome']);
        $this->assertSame(200000.0, $annual['isoAmtPreference']);
        $this->assertGreaterThan(0.0, $annual['estimatedAmt']);
        $this->assertSame(600000.0, $form6251['line1TaxableIncome']);
        $this->assertSame(200000.0, $form6251['line3OtherAdjustments']);
        $this->assertSame(800000.0, $form6251['amti']);
    }

    public function test_form6251_amt_preferential_income_uses_regular_stack_without_exemption_phaseout(): void
    {
        $facts = (new Form6251FactsBuilder(new K1CodeCharacterResolver))->buildFromOtherAdjustments(
            taxableIncome: 120000.0,
            line3OtherAdjustments: 100000.0,
            year: 2025,
            isMarried: false,
            regularTax: FederalIncomeTax::regularTax(120000.0, 2025, false, 0.0, 120000.0),
            preferentialIncome: 120000.0,
        );

        $this->assertSame(220000.0, $facts->amti);
        $this->assertSame(88100.0, $facts->exemption);
        $this->assertSame(131900.0, $facts->amtTaxBase);
        $this->assertSame(13841.5, $facts->amtBeforeForeignCredit);
        $this->assertSame(3094.0, $facts->amt);
    }

    public function test_form6251_amt_preferential_income_uses_regular_stack_with_exemption_phaseout(): void
    {
        $facts = (new Form6251FactsBuilder(new K1CodeCharacterResolver))->buildFromOtherAdjustments(
            taxableIncome: 600000.0,
            line3OtherAdjustments: 200000.0,
            year: 2025,
            isMarried: false,
            regularTax: FederalIncomeTax::regularTax(600000.0, 2025, false, 0.0, 600000.0),
            preferentialIncome: 600000.0,
        );

        $this->assertSame(800000.0, $facts->amti);
        $this->assertSame(44687.5, $facts->exemption);
        $this->assertSame(755312.5, $facts->amtTaxBase);
        $this->assertSame(126458.75, $facts->amtBeforeForeignCredit);
        $this->assertSame(40381.25, $facts->amt);
    }
}
