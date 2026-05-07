<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Enums\Finance\DeductionCategory;
use App\Models\FinanceTool\UserDeduction;
use App\Services\Finance\TaxPreviewFacts\Data\Form1116Facts;
use App\Services\Finance\TaxPreviewFacts\Data\Schedule3Facts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;

class Schedule3FactsBuilder extends TaxPreviewFactBuilder
{
    /**
     * @param  UserDeduction[]  $userDeductions
     */
    public function build(Form1116Facts $form1116, array $userDeductions): Schedule3Facts
    {
        $line1IsReviewed = $form1116->foreignTaxSources !== [] && collect($form1116->foreignTaxSources)->every(static fn (TaxFactSource $source): bool => $source->isReviewed);
        $line1Sources = $form1116->totalForeignTaxes !== 0.0 ? [
            new TaxFactSource(
                id: 'schedule-3-line-1-form-1116',
                label: 'Form 1116 foreign tax credit',
                amount: $form1116->totalForeignTaxes,
                sourceType: TaxFactSourceType::Schedule3Form1116ForeignTaxCredit,
                routing: TaxFactRouting::Schedule3Line1,
                routingReason: 'Form 1116 foreign tax credit flows to Schedule 3 line 1.',
                isReviewed: $line1IsReviewed,
                reviewStatus: $line1IsReviewed ? 'reviewed' : 'needs_review',
                reviewAction: $line1IsReviewed ? null : 'Review Form 1116 foreign tax sources before relying on Schedule 3 line 1.',
            ),
        ] : [];

        $line2Sources = $this->manualSources($userDeductions, DeductionCategory::Schedule3ChildDependentCareCredit, TaxFactRouting::Schedule3Line2, 'Credit for child and dependent care expenses');
        $line3Sources = $this->manualSources($userDeductions, DeductionCategory::Schedule3EducationCredits, TaxFactRouting::Schedule3Line3, 'Education credits');
        $line4Sources = $this->manualSources($userDeductions, DeductionCategory::Schedule3RetirementSavingsCredit, TaxFactRouting::Schedule3Line4, 'Retirement savings contributions credit');
        $line5aSources = $this->manualSources($userDeductions, DeductionCategory::Schedule3ResidentialCleanEnergyCredit, TaxFactRouting::Schedule3Line5a, 'Residential clean energy credit');
        $line5bSources = $this->manualSources($userDeductions, DeductionCategory::Schedule3EnergyEfficientHomeImprovementCredit, TaxFactRouting::Schedule3Line5b, 'Energy efficient home improvement credit');
        $line6Sources = [
            ...$this->manualSources($userDeductions, DeductionCategory::Schedule3GeneralBusinessCredit, TaxFactRouting::Schedule3Line6, 'General business credit'),
            ...$this->manualSources($userDeductions, DeductionCategory::Schedule3PriorYearMinimumTaxCredit, TaxFactRouting::Schedule3Line6, 'Credit for prior year minimum tax'),
            ...$this->manualSources($userDeductions, DeductionCategory::Schedule3OtherNonrefundableCredits, TaxFactRouting::Schedule3Line6, 'Other nonrefundable credits'),
        ];
        $line9Sources = $this->manualSources($userDeductions, DeductionCategory::Schedule3NetPremiumTaxCredit, TaxFactRouting::Schedule3Line9, 'Net premium tax credit');
        $line10Sources = $this->manualSources($userDeductions, DeductionCategory::Schedule3ExtensionPayment, TaxFactRouting::Schedule3Line10, 'Amount paid with request for extension to file');
        $line11Sources = $this->manualSources($userDeductions, DeductionCategory::Schedule3ExcessSocialSecurityWithheld, TaxFactRouting::Schedule3Line11, 'Excess Social Security and RRTA tax withheld');
        $line12Sources = $this->manualSources($userDeductions, DeductionCategory::Schedule3FuelTaxCredit, TaxFactRouting::Schedule3Line12, 'Credit for federal tax on fuels');
        $line13Sources = $this->manualSources($userDeductions, DeductionCategory::Schedule3OtherRefundableCredits, TaxFactRouting::Schedule3Line13, 'Other payments or refundable credits');

        $line7 = $this->sumSources($line6Sources);
        $line8 = $this->sumMoney([
            $this->sumSources($line1Sources),
            $this->sumSources($line2Sources),
            $this->sumSources($line3Sources),
            $this->sumSources($line4Sources),
            $this->sumSources($line5aSources),
            $this->sumSources($line5bSources),
            $line7,
        ]);
        $line14 = $this->sumSources($line13Sources);
        $line15 = $this->sumMoney([
            $this->sumSources($line9Sources),
            $this->sumSources($line10Sources),
            $this->sumSources($line11Sources),
            $this->sumSources($line12Sources),
            $line14,
        ]);

        return new Schedule3Facts(
            line1Sources: $line1Sources,
            line1ForeignTaxCredit: $this->sumSources($line1Sources),
            line2Sources: $line2Sources,
            line2ChildDependentCareCredit: $this->sumSources($line2Sources),
            line3Sources: $line3Sources,
            line3EducationCredits: $this->sumSources($line3Sources),
            line4Sources: $line4Sources,
            line4RetirementSavingsCredit: $this->sumSources($line4Sources),
            line5aSources: $line5aSources,
            line5aResidentialCleanEnergyCredit: $this->sumSources($line5aSources),
            line5bSources: $line5bSources,
            line5bEnergyEfficientHomeImprovementCredit: $this->sumSources($line5bSources),
            line6Sources: $line6Sources,
            line7OtherNonrefundableCredits: $line7,
            line8TotalNonrefundableCredits: $line8,
            line9Sources: $line9Sources,
            line9NetPremiumTaxCredit: $this->sumSources($line9Sources),
            line10Sources: $line10Sources,
            line10ExtensionPayment: $this->sumSources($line10Sources),
            line11Sources: $line11Sources,
            line11ExcessSocialSecurityWithheld: $this->sumSources($line11Sources),
            line12Sources: $line12Sources,
            line12FuelTaxCredit: $this->sumSources($line12Sources),
            line13Sources: $line13Sources,
            line14OtherPaymentsRefundableCredits: $line14,
            line15TotalPaymentsRefundableCredits: $line15,
        );
    }

    /**
     * @param  UserDeduction[]  $userDeductions
     * @return TaxFactSource[]
     */
    private function manualSources(array $userDeductions, DeductionCategory $category, TaxFactRouting $routing, string $label): array
    {
        $sources = [];

        foreach ($userDeductions as $deduction) {
            if ($deduction->category !== $category->value || (float) $deduction->amount === 0.0) {
                continue;
            }

            $sources[] = new TaxFactSource(
                id: "user-deduction-{$deduction->id}-{$category->value}",
                label: $deduction->description !== null && trim($deduction->description) !== '' ? $deduction->description : $label,
                amount: (float) $deduction->amount,
                sourceType: TaxFactSourceType::Schedule3UserEnteredCredit,
                routing: $routing,
                routingReason: "{$label} is entered manually until the upstream form-specific computation is available.",
            );
        }

        return $sources;
    }
}
