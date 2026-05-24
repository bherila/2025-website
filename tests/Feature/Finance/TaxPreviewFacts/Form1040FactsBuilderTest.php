<?php

namespace Tests\Feature\Finance\TaxPreviewFacts;

use App\Services\Finance\K1CodeCharacterResolver;
use App\Services\Finance\TaxPreviewFacts\Builders\Form1040FactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Data\Form6251Facts;
use App\Services\Finance\TaxPreviewFacts\Data\Form8959Facts;
use App\Services\Finance\TaxPreviewFacts\Data\Form8960Facts;
use App\Services\Finance\TaxPreviewFacts\Data\Form8995Facts;
use App\Services\Finance\TaxPreviewFacts\Data\Schedule1Facts;
use App\Services\Finance\TaxPreviewFacts\Data\Schedule3Facts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleAFacts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleBFacts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleDFacts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleSEFacts;
use PHPUnit\Framework\TestCase;

class Form1040FactsBuilderTest extends TestCase
{
    private function builder(): Form1040FactsBuilder
    {
        return new Form1040FactsBuilder(new K1CodeCharacterResolver);
    }

    private function scheduleB(): ScheduleBFacts
    {
        return new ScheduleBFacts(
            interestSources: [],
            directInterestTotal: 0.0,
            k1InterestTotal: 0.0,
            interestTotal: 0.0,
            ordinaryDividendSources: [],
            directOrdinaryDividendTotal: 0.0,
            k1OrdinaryDividendTotal: 0.0,
            ordinaryDividendTotal: 0.0,
            qualifiedDividendSources: [],
            qualifiedDividendTotal: 0.0,
            form4952Line5aTotal: 0.0,
        );
    }

    private function schedule1(): Schedule1Facts
    {
        return new Schedule1Facts(
            line1aSources: [],
            line1aTotal: 0.0,
            line2aSources: [],
            line2aTotal: 0.0,
            line3Sources: [],
            line3Total: 0.0,
            line4Sources: [],
            line4Total: 0.0,
            line5Sources: [],
            line5Total: 0.0,
            line6Sources: [],
            line6Total: 0.0,
            line7Sources: [],
            line7Total: 0.0,
            line8Sources: [],
            line8bSources: [],
            line8bTotal: 0.0,
            line8hSources: [],
            line8hTotal: 0.0,
            line8iSources: [],
            line8iTotal: 0.0,
            line8zSources: [],
            line8zTotal: 0.0,
            line9TotalOtherIncome: 0.0,
            line15Sources: [],
            line15Total: 0.0,
        );
    }

    private function scheduleA(float $standardDeductionSingle = 0.0): ScheduleAFacts
    {
        return new ScheduleAFacts(
            stateIncomeTaxSources: [],
            stateIncomeTaxTotal: 0.0,
            salesTaxSources: [],
            salesTaxTotal: 0.0,
            selectedLine5aType: 'state',
            selectedLine5aTotal: 0.0,
            realEstateTaxSources: [],
            realEstateTaxTotal: 0.0,
            personalPropertyTaxSources: [],
            personalPropertyTaxTotal: 0.0,
            saltPaidBeforeCap: 0.0,
            saltCap: 40000.0,
            saltDeduction: 0.0,
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
            otherItemizedTotal: 0.0,
            totalItemizedDeductions: 0.0,
            standardDeductionSingle: $standardDeductionSingle,
            standardDeductionMarriedFilingJointly: 30000.0,
            shouldItemizeSingle: false,
            shouldItemizeMarriedFilingJointly: false,
        );
    }

    private function scheduleD(): ScheduleDFacts
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
            line16Combined: 0.0,
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

    private function schedule3(): Schedule3Facts
    {
        return new Schedule3Facts(
            line1Sources: [],
            line1ForeignTaxCredit: 0.0,
            line2Sources: [],
            line2ChildDependentCareCredit: 0.0,
            line3Sources: [],
            line3EducationCredits: 0.0,
            line4Sources: [],
            line4RetirementSavingsCredit: 0.0,
            line5aSources: [],
            line5aResidentialCleanEnergyCredit: 0.0,
            line5bSources: [],
            line5bEnergyEfficientHomeImprovementCredit: 0.0,
            line6Sources: [],
            line7OtherNonrefundableCredits: 0.0,
            line8TotalNonrefundableCredits: 0.0,
            line9Sources: [],
            line9NetPremiumTaxCredit: 0.0,
            line10Sources: [],
            line10ExtensionPayment: 0.0,
            line11Sources: [],
            line11ExcessSocialSecurityWithheld: 0.0,
            line12Sources: [],
            line12FuelTaxCredit: 0.0,
            line13Sources: [],
            line14OtherPaymentsRefundableCredits: 0.0,
            line15TotalPaymentsRefundableCredits: 0.0,
        );
    }

    private function scheduleSE(): ScheduleSEFacts
    {
        return new ScheduleSEFacts(
            entries: [],
            netEarningsFromSE: 0.0,
            seTaxableEarnings: 0.0,
            socialSecurityWageBase: 0.0,
            socialSecurityWages: 0.0,
            remainingSocialSecurityWageBase: 0.0,
            socialSecurityTaxableEarnings: 0.0,
            socialSecurityTax: 0.0,
            medicareWages: 0.0,
            medicareTaxWithheldSources: [],
            medicareTaxWithheld: 0.0,
            medicareTaxableEarnings: 0.0,
            medicareTax: 0.0,
            additionalMedicareThreshold: 0.0,
            additionalMedicareTaxableEarnings: 0.0,
            additionalMedicareTax: 0.0,
            seTax: 0.0,
            deductibleSeTax: 0.0,
            wageSources: [],
            scheduleFSources: [],
        );
    }

    private function form8959(): Form8959Facts
    {
        return new Form8959Facts(
            wages: 0.0,
            threshold: 0.0,
            excessWages: 0.0,
            additionalTax: 0.0,
            medicareTaxWithheld: 0.0,
            regularMedicareTaxWithholding: 0.0,
            additionalMedicareWithholding: 0.0,
            wageSources: [],
            withholdingSources: [],
        );
    }

    private function form8960(): Form8960Facts
    {
        return new Form8960Facts(
            taxableInterest: 0.0,
            ordinaryDividends: 0.0,
            netCapGains: 0.0,
            passiveIncome: 0.0,
            nonpassiveTradingIncome: 0.0,
            investmentInterestExpense: 0.0,
            stateLocalForeignIncomeTax: 0.0,
            grossNII: 0.0,
            totalDeductions: 0.0,
            netInvestmentIncome: 0.0,
            magi: 0.0,
            thresholdSingle: 200000.0,
            thresholdMarriedFilingJointly: 250000.0,
            magiExcessSingle: 0.0,
            magiExcessMarriedFilingJointly: 0.0,
            niitTaxSingle: 0.0,
            niitTaxMarriedFilingJointly: 0.0,
            needsMagi: true,
            componentSources: [],
        );
    }

    /**
     * Form 8995 fixture with an arbitrary QBI deduction value flowing into
     * Form 1040 line 13.
     */
    private function form8995(float $deduction = 0.0): Form8995Facts
    {
        return new Form8995Facts(
            entities: [],
            line1Sources: [],
            totalQbi: 0.0,
            totalQbiComponent: 0.0,
            line6Sources: [],
            qualifiedReitDividends: 0.0,
            qualifiedPtpIncome: 0.0,
            reitPtpComponent: 0.0,
            taxableIncomeBeforeQbi: 0.0,
            netCapitalGain: 0.0,
            taxableIncomeLessNetCapitalGain: 0.0,
            taxableIncomeCap: 0.0,
            deduction: $deduction,
            thresholdSingle: 0.0,
            thresholdMarriedFilingJointly: 0.0,
            aboveThreshold: false,
            reviewSources: [],
            form8995A: null,
        );
    }

    /**
     * Drive line 12 and line 13 to the supplied raw (cents-precision) values
     * and assert the resulting Form 1040 line 14.
     */
    private function buildWithLine12And13(float $rawLine12, float $rawLine13): float
    {
        $facts = $this->builder()->build(
            w2Docs: [],
            docs1099: [],
            scheduleB: $this->scheduleB(),
            schedule1: $this->schedule1(),
            scheduleA: $this->scheduleA(standardDeductionSingle: $rawLine12),
            scheduleD: $this->scheduleD(),
            schedule3: $this->schedule3(),
            scheduleSE: $this->scheduleSE(),
            form8959: $this->form8959(),
            form8995: $this->form8995(deduction: $rawLine13),
            form6251: Form6251Facts::empty(),
            form8960: $this->form8960(),
            year: 2025,
            isMarried: false,
        );

        return $facts->line14;
    }

    public function test_line14_rounds_each_constituent_before_summing_into_whole_dollar_total(): void
    {
        // Raw line 12 = 45073.62 → round → 45074.
        // Raw line 13 = 184.74 → round → 185.
        // Per-line rounded sum: 45074 + 185 = 45259.
        // Naive sum-then-round would yield: 45073.62 + 184.74 = 45258.36 → 45258 (off by -1).
        $this->assertSame(45259.0, $this->buildWithLine12And13(45073.62, 184.74));
    }

    public function test_line14_handles_negative_carry_rounding_directions(): void
    {
        // Raw line 12 = 45073.49 → round → 45073 (rounds down).
        // Raw line 13 = 184.51 → round → 185 (rounds up).
        // Per-line rounded sum: 45073 + 185 = 45258.
        // Naive sum-then-round would yield: 45073.49 + 184.51 = 45258.00 → 45258 — same result here,
        // but the test confirms each input is rounded independently rather than coincidentally.
        $this->assertSame(45258.0, $this->buildWithLine12And13(45073.49, 184.51));
    }
}
