<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Enums\Finance\DeductionCategory;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinEmploymentEntity;
use App\Models\FinanceTool\UserDeduction;
use App\Services\Finance\TaxPreviewFacts\Data\Form4952Facts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleAFacts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;
use App\Services\Finance\TaxPreviewFacts\Data\TaxPreviewTransaction;
use App\Services\Tax\PureTaxMath\ItemizedDeductions;
use App\Support\Finance\FederalStandardDeduction;

class ScheduleAFactsBuilder extends TaxPreviewFactBuilder
{
    /**
     * @param  FileForTaxDocument[]  $k1Docs
     * @param  FileForTaxDocument[]  $w2Docs
     * @param  UserDeduction[]  $userDeductions
     * @param  TaxPreviewTransaction[]  $otherItemizedTransactions
     */
    public function build(array $k1Docs, array $w2Docs, array $userDeductions, Form4952Facts $form4952, int $year, array $otherItemizedTransactions = [], ?float $magi = null, bool $magiIsEstimated = false): ScheduleAFacts
    {
        $stateIncomeTaxSources = [
            ...$this->w2StateTaxSources($w2Docs),
            ...$this->userDeductionSources($userDeductions, DeductionCategory::StateEstTax->value),
        ];
        $salesTaxSources = $this->userDeductionSources($userDeductions, DeductionCategory::SalesTax->value);
        $realEstateTaxSources = $this->userDeductionSources($userDeductions, DeductionCategory::RealEstateTax->value);
        $personalPropertyTaxSources = $this->userDeductionSources($userDeductions, DeductionCategory::PersonalPropertyTax->value);
        $mortgageInterestSources = $this->userDeductionSources($userDeductions, DeductionCategory::MortgageInterest->value);
        $charitableCashSources = $this->userDeductionSources($userDeductions, DeductionCategory::CharitableCash->value);
        $charitableNoncashSources = $this->userDeductionSources($userDeductions, DeductionCategory::CharitableNoncash->value);
        $otherItemizedSources = $this->userDeductionSources($userDeductions, DeductionCategory::Other->value);

        $stateIncomeTaxTotal = $this->sumSources($stateIncomeTaxSources);
        $salesTaxTotal = $this->sumSources($salesTaxSources);
        $realEstateTaxTotal = $this->sumSources($realEstateTaxSources);
        $personalPropertyTaxTotal = $this->sumSources($personalPropertyTaxSources);
        $line5aSelection = $this->line5aSelection($stateIncomeTaxTotal, $salesTaxTotal);
        $selectedLine5aTotal = $line5aSelection['amount'];
        // Schedule A line 5d = 5a + 5b + 5c; §164(b)(6) caps the aggregate.
        $saltPaidBeforeCap = $this->sumMoney([$selectedLine5aTotal, $realEstateTaxTotal, $personalPropertyTaxTotal]);
        $saltCap = $this->saltCap($year, $magi);
        $saltDeduction = $this->roundMoney(min($saltCap, $saltPaidBeforeCap));
        $mortgageInterestTotal = $this->sumSources($mortgageInterestSources);
        // Only the §163(d)(5)(A)(i) ordinary-investment portion of Form 4952's allowed
        // deduction is itemized on Schedule A line 9; the §(ii) trader-fund portion is
        // deducted above-the-line on Schedule E (Rev. Rul. 2008-38; Announcement 2008-65).
        $scheduleAInvestmentInterestSources = [];
        $grossScheduleAInvestmentInterest = 0.0;
        foreach ($form4952->carryDestinations as $carryDestination) {
            if ($carryDestination->destination === 'sch-a') {
                $scheduleAInvestmentInterestSources = $carryDestination->sources;
                $grossScheduleAInvestmentInterest = $carryDestination->grossInterest;
                break;
            }
        }
        $investmentInterestTotal = $form4952->deductibleScheduleAItemized;
        $grossInvestmentInterestTotal = $grossScheduleAInvestmentInterest;
        $disallowedInvestmentInterest = $form4952->carryforwardScheduleA;
        $charitableCashTotal = $this->sumSources($charitableCashSources);
        $charitableNoncashTotal = $this->sumSources($charitableNoncashSources);
        $charitableTotal = $this->sumMoney([$charitableCashTotal, $charitableNoncashTotal]);
        $otherItemizedTransactionTotal = $this->sumMoney(array_map(static fn (TaxPreviewTransaction $transaction): float => $transaction->amount, $otherItemizedTransactions));
        $otherItemizedTotal = $this->sumMoney([$this->sumSources($otherItemizedSources), $otherItemizedTransactionTotal]);
        $totalInterest = $this->sumMoney([$mortgageInterestTotal, $investmentInterestTotal]);
        $totalItemizedDeductions = $this->sumMoney([$saltDeduction, $totalInterest, $charitableTotal, $otherItemizedTotal]);
        $standardSingle = $this->standardDeduction($year, false);
        $standardMarried = $this->standardDeduction($year, true);

        return new ScheduleAFacts(
            stateIncomeTaxSources: $stateIncomeTaxSources,
            stateIncomeTaxTotal: $stateIncomeTaxTotal,
            salesTaxSources: $salesTaxSources,
            salesTaxTotal: $salesTaxTotal,
            selectedLine5aType: $line5aSelection['type'],
            selectedLine5aTotal: $selectedLine5aTotal,
            realEstateTaxSources: $realEstateTaxSources,
            realEstateTaxTotal: $realEstateTaxTotal,
            personalPropertyTaxSources: $personalPropertyTaxSources,
            personalPropertyTaxTotal: $personalPropertyTaxTotal,
            saltPaidBeforeCap: $saltPaidBeforeCap,
            saltCap: $saltCap,
            saltDeduction: $saltDeduction,
            saltCapMagi: $magi,
            saltCapUsesEstimatedMagi: $this->hasSaltPhaseDown($year) && $magi !== null && $magiIsEstimated,
            saltCapNeedsMagi: $this->hasSaltPhaseDown($year) && $magi === null,
            mortgageInterestSources: $mortgageInterestSources,
            mortgageInterestTotal: $mortgageInterestTotal,
            investmentInterestSources: $scheduleAInvestmentInterestSources,
            grossInvestmentInterestTotal: $grossInvestmentInterestTotal,
            investmentInterestTotal: $investmentInterestTotal,
            disallowedInvestmentInterest: $disallowedInvestmentInterest,
            totalInterest: $totalInterest,
            charitableCashSources: $charitableCashSources,
            charitableCashTotal: $charitableCashTotal,
            charitableNoncashSources: $charitableNoncashSources,
            charitableNoncashTotal: $charitableNoncashTotal,
            charitableTotal: $charitableTotal,
            otherItemizedSources: $otherItemizedSources,
            otherItemizedTransactions: $otherItemizedTransactions,
            otherItemizedTotal: $otherItemizedTotal,
            totalItemizedDeductions: $totalItemizedDeductions,
            standardDeductionSingle: $standardSingle,
            standardDeductionMarriedFilingJointly: $standardMarried,
            shouldItemizeSingle: $totalItemizedDeductions > $standardSingle,
            shouldItemizeMarriedFilingJointly: $totalItemizedDeductions > $standardMarried,
        );
    }

    /**
     * @param  FileForTaxDocument[]  $w2Docs
     * @return TaxFactSource[]
     */
    private function w2StateTaxSources(array $w2Docs): array
    {
        $sources = [];

        foreach ($w2Docs as $doc) {
            if (! is_array($doc->parsed_data)) {
                continue;
            }

            $amount = $this->firstNumericValue($doc->parsed_data, ['box17_state_tax', 'state_tax_withheld']);
            if ($amount === null || $amount === 0.0) {
                continue;
            }

            $entity = $doc->employmentEntity;
            $employerName = is_string($doc->parsed_data['employer_name'] ?? null)
                ? $doc->parsed_data['employer_name']
                : ($entity instanceof FinEmploymentEntity ? $entity->display_name : 'W-2 employer');

            $sources[] = new TaxFactSource(
                id: "w2-{$doc->id}-schedule-a-state-tax",
                label: "{$employerName} — W-2 Box 17 state tax",
                amount: $this->roundMoney($amount),
                sourceType: TaxFactSourceType::W2StateTaxWithheld,
                taxDocumentId: $doc->id,
                formType: $this->formType($doc),
                box: '17',
                routing: TaxFactRouting::ScheduleALine5a,
                routingReason: 'W-2 Box 17 state income tax withheld supports Schedule A line 5a and the SALT cap.',
                isReviewed: $this->sourceIsReviewed($doc),
                reviewStatus: $this->reviewStatus($doc),
                reviewAction: $this->reviewAction($doc),
            );
        }

        return $sources;
    }

    /**
     * @param  UserDeduction[]  $userDeductions
     * @return TaxFactSource[]
     */
    private function userDeductionSources(array $userDeductions, string $category): array
    {
        $sources = [];

        foreach ($userDeductions as $deduction) {
            if ($deduction->category !== $category || (float) $deduction->amount === 0.0) {
                continue;
            }

            $sources[] = new TaxFactSource(
                id: "user-deduction-{$deduction->id}",
                label: $deduction->description ?: $this->deductionLabel($category),
                amount: $this->roundMoney((float) $deduction->amount),
                sourceType: $this->deductionSourceType($category),
                routing: $this->deductionRouting($category),
                routingReason: 'User-entered itemized deduction category maps to a Schedule A source line.',
            );
        }

        return $sources;
    }

    private function deductionSourceType(string $category): TaxFactSourceType
    {
        return match ($category) {
            DeductionCategory::RealEstateTax->value => TaxFactSourceType::UserDeductionRealEstateTax,
            DeductionCategory::StateEstTax->value => TaxFactSourceType::UserDeductionStateTax,
            DeductionCategory::SalesTax->value => TaxFactSourceType::UserDeductionSalesTax,
            DeductionCategory::PersonalPropertyTax->value => TaxFactSourceType::UserDeductionPersonalPropertyTax,
            DeductionCategory::MortgageInterest->value => TaxFactSourceType::UserDeductionMortgageInterest,
            DeductionCategory::CharitableCash->value => TaxFactSourceType::UserDeductionCharitableCash,
            DeductionCategory::CharitableNoncash->value => TaxFactSourceType::UserDeductionCharitableNoncash,
            default => TaxFactSourceType::UserDeductionOtherItemized,
        };
    }

    private function deductionRouting(string $category): TaxFactRouting
    {
        return match ($category) {
            DeductionCategory::StateEstTax->value => TaxFactRouting::ScheduleALine5a,
            DeductionCategory::SalesTax->value => TaxFactRouting::ScheduleALine5a,
            DeductionCategory::RealEstateTax->value => TaxFactRouting::ScheduleALine5b,
            DeductionCategory::PersonalPropertyTax->value => TaxFactRouting::ScheduleALine5c,
            DeductionCategory::MortgageInterest->value => TaxFactRouting::ScheduleALine8a,
            DeductionCategory::CharitableCash->value => TaxFactRouting::ScheduleALine11,
            DeductionCategory::CharitableNoncash->value => TaxFactRouting::ScheduleALine12,
            default => TaxFactRouting::ScheduleALine16,
        };
    }

    private function deductionLabel(string $category): string
    {
        return match ($category) {
            DeductionCategory::StateEstTax->value => 'State estimated tax paid',
            DeductionCategory::SalesTax->value => 'State/local general sales taxes',
            DeductionCategory::RealEstateTax->value => 'Real estate taxes',
            DeductionCategory::PersonalPropertyTax->value => 'Personal property tax',
            DeductionCategory::MortgageInterest->value => 'Mortgage interest',
            DeductionCategory::CharitableCash->value => 'Charitable cash contributions',
            DeductionCategory::CharitableNoncash->value => 'Charitable noncash contributions',
            default => 'Other itemized deduction',
        };
    }

    /**
     * @return array{type:string,amount:float}
     */
    private function line5aSelection(float $stateIncomeTaxTotal, float $salesTaxTotal): array
    {
        if ($salesTaxTotal > $stateIncomeTaxTotal) {
            return ['type' => 'sales_tax', 'amount' => $salesTaxTotal];
        }

        return ['type' => 'state_income_tax', 'amount' => $stateIncomeTaxTotal];
    }

    private function saltCap(int $year, ?float $magi = null): float
    {
        return ItemizedDeductions::saltCap($year, $magi);
    }

    private function hasSaltPhaseDown(int $year): bool
    {
        return ItemizedDeductions::hasSaltPhaseDown($year);
    }

    private function standardDeduction(int $year, bool $marriedFilingJointly): float
    {
        return $marriedFilingJointly
            ? FederalStandardDeduction::marriedFilingJointly($year)
            : FederalStandardDeduction::single($year);
    }
}
