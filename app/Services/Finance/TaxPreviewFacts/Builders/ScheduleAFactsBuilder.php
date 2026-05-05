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

class ScheduleAFactsBuilder extends TaxPreviewFactBuilder
{
    private const array STANDARD_DEDUCTIONS = [
        2023 => ['single' => 13850.0, 'mfj' => 27700.0],
        2024 => ['single' => 14600.0, 'mfj' => 29200.0],
        2025 => ['single' => 15750.0, 'mfj' => 31500.0],
        2026 => ['single' => 16100.0, 'mfj' => 32200.0],
    ];

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     * @param  FileForTaxDocument[]  $w2Docs
     * @param  UserDeduction[]  $userDeductions
     */
    public function build(array $k1Docs, array $w2Docs, array $userDeductions, Form4952Facts $form4952, int $year): ScheduleAFacts
    {
        $stateIncomeTaxSources = [
            ...$this->w2StateTaxSources($w2Docs),
            ...$this->userDeductionSources($userDeductions, DeductionCategory::StateEstTax->value),
        ];
        $salesTaxSources = $this->userDeductionSources($userDeductions, DeductionCategory::SalesTax->value);
        $realEstateTaxSources = $this->userDeductionSources($userDeductions, DeductionCategory::RealEstateTax->value);
        $mortgageInterestSources = $this->userDeductionSources($userDeductions, DeductionCategory::MortgageInterest->value);
        $charitableCashSources = $this->userDeductionSources($userDeductions, DeductionCategory::CharitableCash->value);
        $charitableNoncashSources = $this->userDeductionSources($userDeductions, DeductionCategory::CharitableNoncash->value);
        $otherItemizedSources = [
            ...$this->userDeductionSources($userDeductions, DeductionCategory::Other->value),
            ...$this->k1PortfolioDeductionSources($k1Docs),
        ];

        $stateIncomeTaxTotal = $this->sumSources($stateIncomeTaxSources);
        $salesTaxTotal = $this->sumSources($salesTaxSources);
        $realEstateTaxTotal = $this->sumSources($realEstateTaxSources);
        $line5aSelection = $this->line5aSelection($stateIncomeTaxTotal, $salesTaxTotal);
        $selectedLine5aTotal = $line5aSelection['amount'];
        $saltPaidBeforeCap = $this->sumMoney([$selectedLine5aTotal, $realEstateTaxTotal]);
        $saltCap = $this->saltCap($year);
        $saltDeduction = min($saltCap, $saltPaidBeforeCap);
        $mortgageInterestTotal = $this->sumSources($mortgageInterestSources);
        $investmentInterestTotal = $form4952->deductibleInvestmentInterestExpense;
        $grossInvestmentInterestTotal = $form4952->totalInvestmentInterestExpense;
        $disallowedInvestmentInterest = max(0.0, $this->subtractMoney($grossInvestmentInterestTotal, $investmentInterestTotal));
        $charitableCashTotal = $this->sumSources($charitableCashSources);
        $charitableNoncashTotal = $this->sumSources($charitableNoncashSources);
        $charitableTotal = $this->sumMoney([$charitableCashTotal, $charitableNoncashTotal]);
        $otherItemizedTotal = $this->sumSources($otherItemizedSources);
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
            saltPaidBeforeCap: $saltPaidBeforeCap,
            saltCap: $saltCap,
            saltDeduction: $saltDeduction,
            mortgageInterestSources: $mortgageInterestSources,
            mortgageInterestTotal: $mortgageInterestTotal,
            investmentInterestSources: $form4952->investmentInterestSources,
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

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     * @return TaxFactSource[]
     */
    private function k1PortfolioDeductionSources(array $k1Docs): array
    {
        $sources = [];

        foreach ($k1Docs as $doc) {
            $data = $this->k1Data($doc);
            if ($data === null) {
                continue;
            }

            $partnerName = $this->k1PartnerName($doc, $data);
            foreach ($this->k1CodeItems($data, '13', 'L') as $index => $item) {
                $amount = $this->parseMoney($item['value'] ?? null);
                if ($amount === null || $amount === 0.0) {
                    continue;
                }

                $sources[] = new TaxFactSource(
                    id: "k1-{$doc->id}-schedule-a-13L-{$index}",
                    label: "{$partnerName} — K-1 Box 13L portfolio deduction",
                    amount: abs($this->roundMoney($amount)),
                    sourceType: TaxFactSourceType::K1PortfolioDeduction,
                    taxDocumentId: $doc->id,
                    formType: $this->formType($doc),
                    box: '13',
                    code: 'L',
                    routing: TaxFactRouting::ScheduleALine16,
                    routingReason: 'K-1 Box 13L portfolio deductions support Schedule A line 16.',
                    notes: is_string($item['notes'] ?? null) ? $item['notes'] : null,
                    isReviewed: $this->sourceIsReviewed($doc),
                    reviewStatus: $this->reviewStatus($doc),
                    reviewAction: $this->reviewAction($doc),
                );
            }
        }

        return $sources;
    }

    private function deductionSourceType(string $category): TaxFactSourceType
    {
        return match ($category) {
            DeductionCategory::RealEstateTax->value => TaxFactSourceType::UserDeductionRealEstateTax,
            DeductionCategory::StateEstTax->value => TaxFactSourceType::UserDeductionStateTax,
            DeductionCategory::SalesTax->value => TaxFactSourceType::UserDeductionSalesTax,
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

    private function saltCap(int $year): float
    {
        return $year >= 2025 ? 40000.0 : 10000.0;
    }

    private function standardDeduction(int $year, bool $marriedFilingJointly): float
    {
        $latestYear = max(array_keys(self::STANDARD_DEDUCTIONS));
        $deductions = self::STANDARD_DEDUCTIONS[$year] ?? self::STANDARD_DEDUCTIONS[$latestYear];

        return $marriedFilingJointly ? $deductions['mfj'] : $deductions['single'];
    }
}
