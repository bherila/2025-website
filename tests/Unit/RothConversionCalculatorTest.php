<?php

namespace Tests\Unit;

use App\Services\Planning\RothConversionCalculator;
use App\Services\Planning\RothConversionInputs;
use PHPUnit\Framework\TestCase;

class RothConversionCalculatorTest extends TestCase
{
    public function test_inputs_preserve_legacy_current_ages_when_supplied(): void
    {
        $inputs = RothConversionInputs::defaults();
        $inputs['currentYear'] = 2026;
        $inputs['people']['primaryBirthYear'] = 1968;
        $inputs['people']['primaryCurrentAge'] = 61;
        $inputs['people']['spouseBirthYear'] = 1970;
        $inputs['people']['spouseCurrentAge'] = 59;

        $normalized = RothConversionInputs::fromArray($inputs)->toArray();

        $this->assertSame(61, $normalized['people']['primaryCurrentAge']);
        $this->assertSame(59, $normalized['people']['spouseCurrentAge']);
    }

    public function test_single_no_social_security_scenario_projects_without_ss_tax(): void
    {
        $inputs = RothConversionInputs::defaults();
        $inputs['filingStatus'] = 'single';
        $inputs['socialSecurity']['piaPrimary'] = 0.0;
        $inputs['socialSecurity']['piaSpouse'] = 0.0;
        $inputs['scenarios'] = [['name' => 'No conversion', 'strategy' => ['conversionMode' => 'constant', 'annualConversion' => 0.0]]];

        $projection = (new RothConversionCalculator)->project(RothConversionInputs::fromArray($inputs))->toArray();
        $firstYear = $projection['scenarios'][0]['years'][0];

        $this->assertSame(0.0, $firstYear['grossSocialSecurity']);
        $this->assertSame(0.0, $firstYear['taxableSocialSecurity']);
    }

    public function test_mfj_conversion_increases_roth_balance(): void
    {
        $inputs = RothConversionInputs::defaults();
        $inputs['scenarios'] = [['name' => 'Constant', 'strategy' => ['conversionMode' => 'constant', 'annualConversion' => 50000.0]]];

        $projection = (new RothConversionCalculator)->project(RothConversionInputs::fromArray($inputs))->toArray();
        $conversionYear = null;
        foreach ($projection['scenarios'][0]['years'] as $year) {
            if ($year['rothConversion'] === 50000.0) {
                $conversionYear = $year;
                break;
            }
        }

        $this->assertNotNull($conversionYear);
        $this->assertLessThan($conversionYear['endingBalances']['roth'], $conversionYear['beginningBalances']['roth']);
    }

    public function test_mfj_to_qss_to_single_transition_is_modeled(): void
    {
        $inputs = RothConversionInputs::defaults();
        $inputs['people']['primaryCurrentAge'] = 70;
        $inputs['people']['primaryBirthYear'] = $inputs['currentYear'] - 70;
        $inputs['people']['primaryEndAge'] = 75;
        $inputs['people']['firstDeathAge'] = 71;
        $inputs['scenarios'] = [['name' => 'No conversion', 'strategy' => ['conversionMode' => 'constant', 'annualConversion' => 0.0]]];

        $years = (new RothConversionCalculator)->project(RothConversionInputs::fromArray($inputs))->toArray()['scenarios'][0]['years'];

        $this->assertSame('married_filing_jointly', $years[1]['filingStatus']);
        $this->assertSame('qualifying_surviving_spouse', $years[2]['filingStatus']);
        $this->assertSame('qualifying_surviving_spouse', $years[3]['filingStatus']);
        $this->assertSame('single', $years[4]['filingStatus']);
    }

    public function test_irmaa_tier_crossing_produces_surcharge_after_age_65(): void
    {
        $inputs = RothConversionInputs::defaults();
        $inputs['people']['primaryCurrentAge'] = 65;
        $inputs['people']['primaryBirthYear'] = $inputs['currentYear'] - 65;
        $inputs['people']['primaryEndAge'] = 66;
        $inputs['income']['wagesPrimary'] = 600000.0;
        $inputs['income']['retirementAgePrimary'] = 70;
        $inputs['assumptions']['twoYearsPriorMagi'] = 600000.0;
        $inputs['scenarios'] = [['name' => 'No conversion', 'strategy' => ['conversionMode' => 'constant', 'annualConversion' => 0.0]]];

        $year = (new RothConversionCalculator)->project(RothConversionInputs::fromArray($inputs))->toArray()['scenarios'][0]['years'][0];

        $this->assertGreaterThan(0, $year['irmaa']);
        $this->assertNotSame('Standard', $year['irmaaTier']['label']);
    }

    public function test_current_year_income_does_not_drive_first_year_irmaa_without_lookback_magi(): void
    {
        $inputs = RothConversionInputs::defaults();
        $inputs['people']['primaryCurrentAge'] = 65;
        $inputs['people']['primaryBirthYear'] = $inputs['currentYear'] - 65;
        $inputs['people']['primaryEndAge'] = 65;
        $inputs['income']['wagesPrimary'] = 600000.0;
        $inputs['income']['retirementAgePrimary'] = 70;
        $inputs['assumptions']['twoYearsPriorMagi'] = 0.0;
        $inputs['scenarios'] = [['name' => 'No conversion', 'strategy' => ['conversionMode' => 'constant', 'annualConversion' => 0.0]]];

        $year = (new RothConversionCalculator)->project(RothConversionInputs::fromArray($inputs))->toArray()['scenarios'][0]['years'][0];

        $this->assertSame(0.0, $year['irmaa']);
        $this->assertSame('Standard', $year['irmaaTier']['label']);
    }

    public function test_niit_triggers_when_magi_and_investment_income_are_high(): void
    {
        $inputs = RothConversionInputs::defaults();
        $inputs['filingStatus'] = 'single';
        $inputs['income']['interest'] = 250000.0;
        $inputs['income']['qualifiedDividends'] = 100000.0;
        $inputs['scenarios'] = [['name' => 'No conversion', 'strategy' => ['conversionMode' => 'constant', 'annualConversion' => 0.0]]];

        $year = (new RothConversionCalculator)->project(RothConversionInputs::fromArray($inputs))->toArray()['scenarios'][0]['years'][0];

        $this->assertGreaterThan(0, $year['niit']);
    }

    public function test_rmd_age_73_and_75_birth_years(): void
    {
        $calculator = new RothConversionCalculator;
        $inputs73 = RothConversionInputs::defaults();
        $inputs73['currentYear'] = 2026;
        $inputs73['people']['primaryCurrentAge'] = 73;
        $inputs73['people']['primaryEndAge'] = 73;
        $inputs73['people']['primaryBirthYear'] = 1953;
        $inputs73['scenarios'] = [['name' => 'No conversion', 'strategy' => ['conversionMode' => 'constant', 'annualConversion' => 0.0]]];

        $inputs75 = $inputs73;
        $inputs75['people']['primaryBirthYear'] = 1961;

        $year73 = $calculator->project(RothConversionInputs::fromArray($inputs73))->toArray()['scenarios'][0]['years'][0];
        $year75 = $calculator->project(RothConversionInputs::fromArray($inputs75))->toArray()['scenarios'][0]['years'][0];

        $this->assertGreaterThan(0, $year73['rmd']);
        $this->assertSame(0.0, $year75['rmd']);
    }

    public function test_rmd_uses_each_spouses_own_traditional_balance(): void
    {
        $inputs = $this->singleYearNoIncomeInputs();
        $inputs['filingStatus'] = 'married_filing_jointly';
        $inputs['people']['primaryCurrentAge'] = 73;
        $inputs['people']['primaryEndAge'] = 73;
        $inputs['people']['primaryBirthYear'] = 1953;
        $inputs['people']['spouseCurrentAge'] = 71;
        $inputs['people']['spouseEndAge'] = 95;
        $inputs['people']['spouseBirthYear'] = 1955;
        $inputs['balances']['traditionalPrimary'] = 1500000.0;
        $inputs['balances']['traditionalSpouse'] = 50000.0;

        $year = (new RothConversionCalculator)->project(RothConversionInputs::fromArray($inputs))->toArray()['scenarios'][0]['years'][0];

        $this->assertSame(56604.0, $year['ordinaryIncomeStack']['rmdPrimary']);
        $this->assertSame(0.0, $year['ordinaryIncomeStack']['rmdSpouse']);
        $this->assertSame(56604.0, $year['rmd']);
    }

    public function test_projection_runs_until_later_spouse_end_age(): void
    {
        $inputs = $this->singleYearNoIncomeInputs();
        $inputs['filingStatus'] = 'married_filing_jointly';
        $inputs['people']['primaryCurrentAge'] = 60;
        $inputs['people']['primaryEndAge'] = 60;
        $inputs['people']['spouseCurrentAge'] = 58;
        $inputs['people']['spouseEndAge'] = 62;

        $years = (new RothConversionCalculator)->project(RothConversionInputs::fromArray($inputs))->toArray()['scenarios'][0]['years'];
        $lastYear = $years[array_key_last($years)];

        $this->assertSame(64, $lastYear['primaryAge']);
        $this->assertSame(62, $lastYear['spouseAge']);
    }

    public function test_fill_bracket_conversion_sizes_to_target_ordinary_bracket(): void
    {
        $inputs = $this->singleYearNoIncomeInputs();
        $inputs['filingStatus'] = 'single';
        $inputs['strategy']['conversionMode'] = 'fill_bracket';
        $inputs['strategy']['bracketTarget'] = 12;
        $inputs['strategy']['conversionStartAge'] = 60;
        $inputs['strategy']['conversionEndAge'] = 60;
        $inputs['scenarios'] = [['name' => 'Fill 12%', 'strategy' => []]];

        $year = (new RothConversionCalculator)->project(RothConversionInputs::fromArray($inputs))->toArray()['scenarios'][0]['years'][0];

        $this->assertSame(66500.0, $year['rothConversion']);
        $this->assertSame(50400.0, $year['taxableIncome']);
    }

    public function test_fill_bracket_conversion_includes_taxable_social_security(): void
    {
        $inputs = $this->singleYearNoIncomeInputs();
        $inputs['people']['primaryCurrentAge'] = 67;
        $inputs['people']['primaryBirthYear'] = $inputs['currentYear'] - 67;
        $inputs['people']['primaryEndAge'] = 67;
        $inputs['socialSecurity']['piaPrimary'] = 3000.0;
        $inputs['socialSecurity']['claimAgePrimary'] = 67;
        $inputs['strategy']['conversionMode'] = 'fill_bracket';
        $inputs['strategy']['bracketTarget'] = 12;
        $inputs['strategy']['conversionStartAge'] = 67;
        $inputs['strategy']['conversionEndAge'] = 67;
        $inputs['scenarios'] = [['name' => 'Fill 12%', 'strategy' => []]];

        $year = (new RothConversionCalculator)->project(RothConversionInputs::fromArray($inputs))->toArray()['scenarios'][0]['years'][0];

        $this->assertSame(40864.86, $year['rothConversion']);
        $this->assertSame(25635.13, $year['taxableSocialSecurity']);
        $this->assertSame(50399.99, $year['taxableIncome']);
    }

    public function test_fill_bracket_conversion_uses_itemized_expense_deductions(): void
    {
        $inputs = $this->singleYearNoIncomeInputs();
        $inputs['strategy']['conversionMode'] = 'fill_bracket';
        $inputs['strategy']['bracketTarget'] = 12;
        $inputs['strategy']['conversionStartAge'] = 60;
        $inputs['strategy']['conversionEndAge'] = 60;
        $inputs['expenses']['propertyTax'] = 50000.0;
        $inputs['expenses']['medicalExpense'] = 20000.0;
        $inputs['scenarios'] = [['name' => 'Fill 12% with itemized', 'strategy' => []]];

        $year = (new RothConversionCalculator)->project(RothConversionInputs::fromArray($inputs))->toArray()['scenarios'][0]['years'][0];

        $this->assertSame(103069.77, $year['rothConversion']);
        $this->assertSame('itemized', $year['deductionBreakdown']['mode']);
        $this->assertSame(50400.0, $year['taxableIncome']);
    }

    public function test_cash_uses_cash_yield_instead_of_portfolio_growth(): void
    {
        $inputs = $this->singleYearNoIncomeInputs();
        $inputs['balances']['cash'] = 1000.0;
        $inputs['assumptions']['postRetirementGrowthPercent'] = 10.0;
        $inputs['assumptions']['cashYieldPercent'] = 1.0;

        $year = (new RothConversionCalculator)->project(RothConversionInputs::fromArray($inputs))->toArray()['scenarios'][0]['years'][0];

        $this->assertSame(275000.0, $year['endingBalances']['traditional']);
        $this->assertSame(1010.0, $year['endingBalances']['cash']);
    }

    public function test_harvested_long_term_gains_respect_zero_percent_cap(): void
    {
        $inputs = $this->singleYearNoIncomeInputs();
        $inputs['balances']['taxableBrokerage'] = 200000.0;
        $inputs['balances']['taxableBasis'] = 0.0;
        $inputs['strategy']['harvestLtcg'] = true;
        $inputs['strategy']['ltcgTargetRate'] = 0;
        $inputs['scenarios'] = [['name' => 'Harvest', 'strategy' => ['conversionMode' => 'constant', 'annualConversion' => 0.0]]];

        $year = (new RothConversionCalculator)->project(RothConversionInputs::fromArray($inputs))->toArray()['scenarios'][0]['years'][0];

        $this->assertSame(49450.0, $year['capitalGainStack']['harvestedLongTermGains']);
    }

    public function test_cash_shortfall_withdrawals_use_taxable_average_basis_and_recompute_tax(): void
    {
        $inputs = $this->singleYearNoIncomeInputs();
        $inputs['income']['wagesPrimary'] = 100000.0;
        $inputs['income']['retirementAgePrimary'] = 61;
        $inputs['balances']['cash'] = 0.0;
        $inputs['balances']['traditionalPrimary'] = 100000.0;
        $inputs['balances']['taxableBrokerage'] = 200000.0;
        $inputs['balances']['taxableBasis'] = 100000.0;
        $inputs['expenses']['otherNondeductible'] = 120000.0;
        $inputs['strategy']['conversionMode'] = 'constant';
        $inputs['strategy']['annualConversion'] = 0.0;
        $inputs['strategy']['conversionStartAge'] = 60;
        $inputs['strategy']['conversionEndAge'] = 60;
        $inputs['strategy']['harvestLtcg'] = false;
        $inputs['scenarios'] = [['name' => 'Cash shortfall', 'strategy' => []]];

        $projection = (new RothConversionCalculator)->project(RothConversionInputs::fromArray($inputs))->toArray();
        $year = $projection['scenarios'][0]['years'][0];

        $this->assertSame(33170.0, $year['cashShortfallWithdrawals']['shortfall']);
        $this->assertSame(35859.46, $year['cashShortfallWithdrawals']['taxable']);
        $this->assertSame(17929.74, $year['cashShortfallWithdrawals']['taxableBasisRecovered']);
        $this->assertSame(17929.74, $year['cashShortfallWithdrawals']['taxableRealizedGain']);
        $this->assertSame(0.0, $year['cashShortfallWithdrawals']['traditional']);
        $this->assertSame(2689.46, $year['cashShortfallWithdrawals']['estimatedAdditionalFederalTax']);
        $this->assertSame(2689.46, $year['cashShortfallWithdrawals']['estimatedAdditionalTax']);
        $this->assertSame(15859.46, $year['totalTax']);
        $this->assertSame(17929.74, $year['capitalGainStack']['cashShortfallRealizedGains']);
        $this->assertSame(1, $projection['scenarios'][0]['summary']['cashShortfallTaxApproximationYears']);
        $this->assertSame(1, $projection['scenarios'][0]['summary']['cashShortfallTaxRecomputedYears']);
        $this->assertSame([], $projection['warnings']);
    }

    public function test_cash_shortfall_pre_tax_withdrawals_gross_up_ordinary_income_tax(): void
    {
        $inputs = $this->singleYearNoIncomeInputs();
        $inputs['income']['wagesPrimary'] = 100000.0;
        $inputs['income']['retirementAgePrimary'] = 61;
        $inputs['balances']['cash'] = 0.0;
        $inputs['balances']['traditionalPrimary'] = 200000.0;
        $inputs['expenses']['otherNondeductible'] = 120000.0;
        $inputs['strategy']['conversionMode'] = 'constant';
        $inputs['strategy']['annualConversion'] = 0.0;
        $inputs['strategy']['conversionStartAge'] = 60;
        $inputs['strategy']['conversionEndAge'] = 60;
        $inputs['strategy']['harvestLtcg'] = false;
        $inputs['scenarios'] = [['name' => 'Cash shortfall', 'strategy' => []]];

        $projection = (new RothConversionCalculator)->project(RothConversionInputs::fromArray($inputs))->toArray();
        $year = $projection['scenarios'][0]['years'][0];

        $this->assertSame(33170.0, $year['cashShortfallWithdrawals']['shortfall']);
        $this->assertSame(43071.05, $year['cashShortfallWithdrawals']['traditional']);
        $this->assertSame(43071.05, $year['cashShortfallWithdrawals']['traditionalOrdinaryIncome']);
        $this->assertSame(9901.05, $year['cashShortfallWithdrawals']['estimatedAdditionalFederalTax']);
        $this->assertSame(9901.05, $year['cashShortfallWithdrawals']['estimatedAdditionalTax']);
        $this->assertSame(23071.05, $year['totalTax']);
        $this->assertSame(43071.05, $year['ordinaryIncomeStack']['cashShortfallTraditionalWithdrawal']);
        $this->assertSame([], $projection['warnings']);
    }

    public function test_expenses_reduce_cash_and_feed_schedule_a_deductions(): void
    {
        $inputs = $this->singleYearNoIncomeInputs();
        $inputs['income']['wagesPrimary'] = 100000.0;
        $inputs['income']['retirementAgePrimary'] = 61;
        $inputs['balances']['traditionalPrimary'] = 0.0;
        $inputs['balances']['cash'] = 100000.0;
        $inputs['expenses']['propertyTax'] = 50000.0;
        $inputs['expenses']['medicalExpense'] = 20000.0;
        $inputs['expenses']['otherNondeductible'] = 10000.0;

        $year = (new RothConversionCalculator)->project(RothConversionInputs::fromArray($inputs))->toArray()['scenarios'][0]['years'][0];

        $this->assertSame(80000.0, $year['expenses']['total']);
        $this->assertSame('itemized', $year['deductionBreakdown']['mode']);
        $this->assertSame(40400.0, $year['deductionBreakdown']['saltDeduction']);
        $this->assertSame(7500.0, $year['deductionBreakdown']['medicalExpenseFloor']);
        $this->assertSame(12500.0, $year['deductionBreakdown']['medicalExpenseDeduction']);
        $this->assertSame(52900.0, $year['standardOrItemizedDeduction']);
        $this->assertSame(47100.0, $year['taxableIncome']);
        $this->assertSame(114596.0, $year['endingBalances']['cash']);
    }

    public function test_ca_prop_13_limits_property_tax_growth_to_two_percent(): void
    {
        $inputs = $this->singleYearNoIncomeInputs();
        $inputs['people']['primaryEndAge'] = 62;
        $inputs['balances']['cash'] = 100000.0;
        $inputs['expenses']['propertyTax'] = 10000.0;
        $inputs['expenses']['caProp13PropertyTaxLimit'] = true;
        $inputs['assumptions']['inflationPercent'] = 6.0;

        $years = (new RothConversionCalculator)->project(RothConversionInputs::fromArray($inputs))->toArray()['scenarios'][0]['years'];

        $this->assertSame([10000.0, 10200.0, 10404.0], array_map(
            static fn (array $year): float => $year['expenses']['propertyTax'],
            $years,
        ));
    }

    public function test_tax_exempt_interest_is_added_to_magi_but_not_agi(): void
    {
        $inputs = $this->singleYearNoIncomeInputs();
        $inputs['income']['taxExemptInterest'] = 10000.0;
        $inputs['scenarios'] = [['name' => 'Tax exempt', 'strategy' => ['conversionMode' => 'constant', 'annualConversion' => 0.0]]];

        $year = (new RothConversionCalculator)->project(RothConversionInputs::fromArray($inputs))->toArray()['scenarios'][0]['years'][0];

        $this->assertSame(0.0, $year['agi']);
        $this->assertSame(10000.0, $year['magi']);
        $this->assertSame(10000.0, $year['ordinaryIncomeStack']['taxExemptInterest']);
    }

    public function test_first_death_age_inside_conversion_window_rolls_spouse_traditional_to_survivor(): void
    {
        $inputs = $this->singleYearNoIncomeInputs();
        $inputs['filingStatus'] = 'married_filing_jointly';
        $inputs['people']['primaryCurrentAge'] = 70;
        $inputs['people']['primaryEndAge'] = 74;
        $inputs['people']['primaryBirthYear'] = 1956;
        $inputs['people']['spouseCurrentAge'] = 70;
        $inputs['people']['spouseEndAge'] = 95;
        $inputs['people']['spouseBirthYear'] = 1956;
        $inputs['people']['firstDeathAge'] = 71;
        $inputs['balances']['traditionalPrimary'] = 0.0;
        $inputs['balances']['traditionalSpouse'] = 100000.0;
        $inputs['strategy']['annualConversion'] = 10000.0;
        $inputs['strategy']['conversionStartAge'] = 70;
        $inputs['strategy']['conversionEndAge'] = 74;
        $inputs['scenarios'] = [['name' => 'Death during conversions', 'strategy' => []]];

        $years = (new RothConversionCalculator)->project(RothConversionInputs::fromArray($inputs))->toArray()['scenarios'][0]['years'];
        $survivorYear = $years[2];
        $rmdYear = $years[3];
        $singleYear = $years[4];

        $this->assertSame([
            'married_filing_jointly',
            'married_filing_jointly',
            'qualifying_surviving_spouse',
            'qualifying_surviving_spouse',
            'single',
        ], array_slice(array_column($years, 'filingStatus'), 0, 5));
        $this->assertSame('qualifying_surviving_spouse', $survivorYear['filingStatus']);
        $this->assertGreaterThan(0.0, $survivorYear['beginningBalances']['traditionalPrimary']);
        $this->assertSame(0.0, $survivorYear['beginningBalances']['traditionalSpouse']);
        $this->assertSame(10000.0, $survivorYear['rothConversion']);
        $this->assertGreaterThan(0.0, $rmdYear['rmd']);
        $this->assertSame($rmdYear['rmd'], $rmdYear['ordinaryIncomeStack']['rmdPrimary']);
        $this->assertSame(0.0, $rmdYear['ordinaryIncomeStack']['rmdSpouse']);
        $this->assertGreaterThan(0.0, $singleYear['rmd']);
        $this->assertSame($singleYear['rmd'], $singleYear['ordinaryIncomeStack']['rmdPrimary']);
        $this->assertSame(0.0, $singleYear['ordinaryIncomeStack']['rmdSpouse']);
    }

    /**
     * @return array<string, mixed>
     */
    private function singleYearNoIncomeInputs(): array
    {
        $inputs = RothConversionInputs::defaults();
        $inputs['currentYear'] = 2026;
        $inputs['filingStatus'] = 'single';
        $inputs['people']['primaryCurrentAge'] = 60;
        $inputs['people']['primaryEndAge'] = 60;
        $inputs['people']['primaryBirthYear'] = 1966;
        $inputs['people']['spouseCurrentAge'] = 58;
        $inputs['people']['spouseEndAge'] = 58;
        $inputs['people']['spouseBirthYear'] = 1968;
        $inputs['income']['wagesPrimary'] = 0.0;
        $inputs['income']['wagesSpouse'] = 0.0;
        $inputs['income']['retirementAgePrimary'] = 60;
        $inputs['income']['retirementAgeSpouse'] = 60;
        $inputs['income']['selfEmploymentPrimary'] = 0.0;
        $inputs['income']['selfEmploymentSpouse'] = 0.0;
        $inputs['income']['interest'] = 0.0;
        $inputs['income']['taxExemptInterest'] = 0.0;
        $inputs['income']['qualifiedDividends'] = 0.0;
        $inputs['income']['longTermCapitalGains'] = 0.0;
        $inputs['income']['otherOrdinary'] = 0.0;
        $inputs['socialSecurity']['piaPrimary'] = 0.0;
        $inputs['socialSecurity']['piaSpouse'] = 0.0;
        $inputs['balances']['traditionalPrimary'] = 250000.0;
        $inputs['balances']['traditionalSpouse'] = 0.0;
        $inputs['balances']['rothPrimary'] = 0.0;
        $inputs['balances']['rothSpouse'] = 0.0;
        $inputs['balances']['hsa'] = 0.0;
        $inputs['balances']['taxableBrokerage'] = 0.0;
        $inputs['balances']['taxableBasis'] = 0.0;
        $inputs['balances']['cash'] = 0.0;
        $inputs['strategy']['conversionMode'] = 'constant';
        $inputs['strategy']['annualConversion'] = 0.0;
        $inputs['strategy']['conversionStartAge'] = 60;
        $inputs['strategy']['conversionEndAge'] = 60;
        $inputs['strategy']['harvestLtcg'] = false;
        $inputs['assumptions']['preRetirementGrowthPercent'] = 0.0;
        $inputs['assumptions']['postRetirementGrowthPercent'] = 0.0;
        $inputs['assumptions']['cashYieldPercent'] = 0.0;
        $inputs['assumptions']['inflationPercent'] = 0.0;
        $inputs['assumptions']['stateTaxPercent'] = 0.0;
        $inputs['assumptions']['priorYearMagi'] = 0.0;
        $inputs['assumptions']['twoYearsPriorMagi'] = 0.0;
        $inputs['scenarios'] = [['name' => 'No conversion', 'strategy' => ['conversionMode' => 'constant', 'annualConversion' => 0.0]]];

        return $inputs;
    }
}
