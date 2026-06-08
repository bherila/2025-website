<?php

namespace Tests\Feature\Finance\TaxPreviewFacts;

use App\Services\Finance\K1CodeCharacterResolver;
use App\Services\Finance\TaxPreviewFacts\Builders\Form8960FactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Data\Form4952Facts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleAFacts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleBFacts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleDFacts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleEFacts;
use PHPUnit\Framework\TestCase;

class Form8960FactsBuilderTest extends TestCase
{
    private function builder(): Form8960FactsBuilder
    {
        return new Form8960FactsBuilder(new K1CodeCharacterResolver);
    }

    private function scheduleB(float $interest = 0.0, float $ordinaryDividends = 0.0): ScheduleBFacts
    {
        return new ScheduleBFacts(
            interestSources: [],
            directInterestTotal: $interest,
            k1InterestTotal: 0.0,
            interestTotal: $interest,
            ordinaryDividendSources: [],
            directOrdinaryDividendTotal: $ordinaryDividends,
            k1OrdinaryDividendTotal: 0.0,
            ordinaryDividendTotal: $ordinaryDividends,
            qualifiedDividendSources: [],
            qualifiedDividendTotal: 0.0,
            form4952Line5aTotal: 0.0,
        );
    }

    private function scheduleE(float $passive = 0.0, float $trader = 0.0): ScheduleEFacts
    {
        return new ScheduleEFacts(
            miscIncomeSources: [],
            miscIncomeTotal: 0.0,
            box1Sources: [],
            totalBox1: 0.0,
            box2Sources: [],
            totalBox2: 0.0,
            box3Sources: [],
            totalBox3: 0.0,
            box4Sources: [],
            totalBox4: 0.0,
            totalBox5: 0.0,
            box11ZZSources: [],
            totalBox11ZZ: 0.0,
            box13ZZSources: [],
            totalBox13ZZ: 0.0,
            traderNiiSources: [],
            totalTraderNii: $trader,
            form4952InvestmentInterestSources: [],
            totalForm4952InvestmentInterest: 0.0,
            materialParticipationTraderInterestSources: [],
            totalMaterialParticipationTraderInterest: 0.0,
            totalPassive: $passive,
            totalNonpassive: 0.0,
            totalNonpassiveIncome: 0.0,
            totalNonpassiveLoss: 0.0,
            grandTotal: $passive + $trader,
        );
    }

    private function scheduleD(float $line16Combined): ScheduleDFacts
    {
        return new ScheduleDFacts(
            form8949Rollups: [],
            line1aGainLoss: 0.0,
            line1bGainLoss: 0.0,
            line2GainLoss: 0.0,
            line3Sources: [],
            line3GainLoss: 0.0,
            line4Sources: [],
            line4GainLoss: 0.0,
            line5Sources: [],
            line5GainLoss: 0.0,
            line6Carryover: 0.0,
            line7NetShortTerm: 0.0,
            line8aGainLoss: 0.0,
            line8bGainLoss: 0.0,
            line9GainLoss: 0.0,
            line10Sources: [],
            line10GainLoss: 0.0,
            line11Sources: [],
            line11GainLoss: 0.0,
            line12Sources: [],
            line12GainLoss: 0.0,
            line13Sources: [],
            line13CapitalGainDistributions: 0.0,
            line14Carryover: 0.0,
            line15NetLongTerm: 0.0,
            line16Combined: $line16Combined,
            line21LimitedLossOrGain: 0.0,
            appliedToReturn: 0.0,
            carryforward: 0.0,
            totalBusinessCapGains: 0.0,
            totalPersonalCapGains: 0.0,
            limitedBusinessCapGains: 0.0,
            limitedPersonalCapGains: 0.0,
            ambiguous11SSources: [],
            ambiguous11SAmount: 0.0,
        );
    }

    private function form4952(float $deductibleInvestmentInterestExpense = 0.0): Form4952Facts
    {
        return new Form4952Facts(
            investmentInterestSources: [],
            totalInvestmentInterestExpense: $deductibleInvestmentInterestExpense,
            investmentExpenseSources: [],
            totalInvestmentExpenses: 0.0,
            excludedInvestmentExpenseSources: [],
            totalExcludedInvestmentExpenses: 0.0,
            materialParticipationScheduleEInterestSources: [],
            totalMaterialParticipationScheduleEInterest: 0.0,
            grossInvestmentIncomeFromScheduleB: 0.0,
            grossInvestmentIncomeFromK1: 0.0,
            grossInvestmentIncomeTotal: 0.0,
            line4cNetInvestmentIncomeAfterQualifiedDividends: 0.0,
            netInvestmentIncomeBeforeQualifiedDividendElection: 0.0,
            totalQualifiedDividends: 0.0,
            deductibleInvestmentInterestExpense: $deductibleInvestmentInterestExpense,
            disallowedCarryforward: 0.0,
            grossInvestmentIncomeFromK1Sources: [],
            qualifiedDividendSources: [],
            deductibleScheduleEAboveLine: 0.0,
            deductibleScheduleAItemized: $deductibleInvestmentInterestExpense,
            carryforwardScheduleE: 0.0,
            carryforwardScheduleA: 0.0,
            carryDestinations: [],
        );
    }

    private function scheduleA(float $stateIncomeTaxTotal = 0.0, float $salesTaxTotal = 0.0): ScheduleAFacts
    {
        return new ScheduleAFacts(
            stateIncomeTaxSources: [],
            stateIncomeTaxTotal: $stateIncomeTaxTotal,
            salesTaxSources: [],
            salesTaxTotal: $salesTaxTotal,
            selectedLine5aType: $salesTaxTotal > $stateIncomeTaxTotal ? 'sales_tax' : 'state_income_tax',
            selectedLine5aTotal: max($stateIncomeTaxTotal, $salesTaxTotal),
            realEstateTaxSources: [],
            realEstateTaxTotal: 0.0,
            personalPropertyTaxSources: [],
            personalPropertyTaxTotal: 0.0,
            saltPaidBeforeCap: $stateIncomeTaxTotal,
            saltCap: 40000.0,
            saltDeduction: min(40000.0, $stateIncomeTaxTotal),
            saltCapMagi: null,
            saltCapUsesEstimatedMagi: false,
            saltCapNeedsMagi: false,
            mortgageInterestSources: [],
            mortgageInterestTotal: 0.0,
            investmentInterestSources: [],
            grossInvestmentInterestTotal: 0.0,
            investmentInterestTotal: 0.0,
            disallowedInvestmentInterest: 0.0,
            totalInterest: 0.0,
            charitableCashSources: [],
            charitableCashTotal: 0.0,
            charitableNoncashSources: [],
            charitableNoncashTotal: 0.0,
            charitableTotal: 0.0,
            otherItemizedSources: [],
            otherItemizedTransactions: [],
            otherItemizedTotal: 0.0,
            totalItemizedDeductions: min(40000.0, $stateIncomeTaxTotal),
            standardDeductionSingle: 15000.0,
            standardDeductionMarriedFilingJointly: 30000.0,
            shouldItemizeSingle: false,
            shouldItemizeMarriedFilingJointly: false,
        );
    }

    public function test_section_1211b_loss_floor_clips_large_capital_loss_at_negative_3000(): void
    {
        $facts = $this->builder()->build(
            $this->scheduleB(),
            $this->scheduleE(),
            $this->scheduleD(line16Combined: -184533.73),
            $this->form4952(),
        );

        $this->assertSame(-3000.0, $facts->netCapGains);
    }

    public function test_section_1211b_loss_floor_passes_through_loss_smaller_than_3000(): void
    {
        $facts = $this->builder()->build(
            $this->scheduleB(),
            $this->scheduleE(),
            $this->scheduleD(line16Combined: -2000.0),
            $this->form4952(),
        );

        $this->assertSame(-2000.0, $facts->netCapGains);
    }

    public function test_capital_gain_passes_through_unchanged(): void
    {
        $facts = $this->builder()->build(
            $this->scheduleB(),
            $this->scheduleE(),
            $this->scheduleD(line16Combined: 5000.0),
            $this->form4952(),
        );

        $this->assertSame(5000.0, $facts->netCapGains);
    }

    public function test_line_9b_salt_proration_allocates_state_income_tax_by_nii_over_agi_ratio(): void
    {
        // stateIncomeTax=10000, investmentIncome (gross NII)=11117, AGI=2122501.
        // allocated = 10000 * 11117 / 2122501 ≈ 52.38.
        $facts = $this->builder()->build(
            $this->scheduleB(interest: 11117.0),
            $this->scheduleE(),
            $this->scheduleD(line16Combined: 0.0),
            $this->form4952(),
            $this->scheduleA(stateIncomeTaxTotal: 10000.0),
            magi: 2122501.0,
        );

        $this->assertEqualsWithDelta(52.0, $facts->stateLocalForeignIncomeTax, 1.0);
        $this->assertGreaterThan(0.0, $facts->stateLocalForeignIncomeTax);
        $this->assertLessThanOrEqual(10000.0, $facts->stateLocalForeignIncomeTax);
    }

    public function test_line_9b_salt_proration_floored_at_zero_when_no_state_tax(): void
    {
        $facts = $this->builder()->build(
            $this->scheduleB(interest: 11117.0),
            $this->scheduleE(),
            $this->scheduleD(line16Combined: 0.0),
            $this->form4952(),
            $this->scheduleA(stateIncomeTaxTotal: 0.0),
            magi: 2122501.0,
        );

        $this->assertSame(0.0, $facts->stateLocalForeignIncomeTax);
    }

    public function test_line_9b_salt_proration_returns_zero_when_schedule_a_elects_sales_tax(): void
    {
        $facts = $this->builder()->build(
            $this->scheduleB(interest: 11117.0),
            $this->scheduleE(),
            $this->scheduleD(line16Combined: 0.0),
            $this->form4952(),
            $this->scheduleA(stateIncomeTaxTotal: 10000.0, salesTaxTotal: 12000.0),
            magi: 2122501.0,
        );

        $this->assertSame(0.0, $facts->stateLocalForeignIncomeTax);
    }

    public function test_line_9b_salt_proration_returns_zero_without_magi(): void
    {
        $facts = $this->builder()->build(
            $this->scheduleB(interest: 11117.0),
            $this->scheduleE(),
            $this->scheduleD(line16Combined: 0.0),
            $this->form4952(),
            $this->scheduleA(stateIncomeTaxTotal: 10000.0),
            magi: null,
        );

        $this->assertSame(0.0, $facts->stateLocalForeignIncomeTax);
    }

    public function test_total_deductions_includes_investment_interest_and_salt_allocation(): void
    {
        $facts = $this->builder()->build(
            $this->scheduleB(interest: 11117.0),
            $this->scheduleE(),
            $this->scheduleD(line16Combined: 0.0),
            $this->form4952(deductibleInvestmentInterestExpense: 1000.0),
            $this->scheduleA(stateIncomeTaxTotal: 10000.0),
            magi: 2122501.0,
        );

        $this->assertEqualsWithDelta(1000.0 + $facts->stateLocalForeignIncomeTax, $facts->totalDeductions, 0.01);
    }

    public function test_magi_scalars_always_emitted_with_numeric_values_when_magi_null(): void
    {
        $facts = $this->builder()->build(
            $this->scheduleB(interest: 1000.0),
            $this->scheduleE(),
            $this->scheduleD(line16Combined: 0.0),
            $this->form4952(),
        );

        $array = $facts->toArray();
        $this->assertArrayHasKey('magi', $array);
        $this->assertArrayHasKey('magiExcessSingle', $array);
        $this->assertArrayHasKey('magiExcessMarriedFilingJointly', $array);
        $this->assertArrayHasKey('niitTaxSingle', $array);
        $this->assertArrayHasKey('niitTaxMarriedFilingJointly', $array);
        $this->assertIsFloat($array['magi']);
        $this->assertIsFloat($array['magiExcessSingle']);
        $this->assertIsFloat($array['magiExcessMarriedFilingJointly']);
        $this->assertIsFloat($array['niitTaxSingle']);
        $this->assertIsFloat($array['niitTaxMarriedFilingJointly']);
        $this->assertSame(0.0, $array['magi']);
        $this->assertSame(0.0, $array['magiExcessSingle']);
        $this->assertSame(0.0, $array['magiExcessMarriedFilingJointly']);
        $this->assertSame(0.0, $array['niitTaxSingle']);
        $this->assertSame(0.0, $array['niitTaxMarriedFilingJointly']);
        $this->assertTrue($array['needsMagi']);
    }

    public function test_magi_scalars_compute_when_magi_supplied(): void
    {
        // MAGI = 2,122,501. Single threshold = 200k. Excess = 1,922,501.
        // grossNii (1,000 interest) - 0 deductions = 1,000 NII.
        // NIIT = 0.038 * min(1000, 1922501) = 0.038 * 1000 = 38.0
        $facts = $this->builder()->build(
            $this->scheduleB(interest: 1000.0),
            $this->scheduleE(),
            $this->scheduleD(line16Combined: 0.0),
            $this->form4952(),
            scheduleA: null,
            magi: 2122501.0,
        );

        $this->assertSame(2122501.0, $facts->magi);
        $this->assertSame(1922501.0, $facts->magiExcessSingle);
        $this->assertSame(1872501.0, $facts->magiExcessMarriedFilingJointly);
        $this->assertSame(38.0, $facts->niitTaxSingle);
        $this->assertSame(38.0, $facts->niitTaxMarriedFilingJointly);
        $this->assertFalse($facts->needsMagi);
    }

    public function test_state_local_foreign_income_tax_path_present_in_to_array(): void
    {
        $facts = $this->builder()->build(
            $this->scheduleB(),
            $this->scheduleE(),
            $this->scheduleD(line16Combined: 0.0),
            $this->form4952(),
        );

        $array = $facts->toArray();
        $this->assertArrayHasKey('stateLocalForeignIncomeTax', $array);
        $this->assertIsFloat($array['stateLocalForeignIncomeTax']);
        $this->assertSame(0.0, $array['stateLocalForeignIncomeTax']);
    }
}
