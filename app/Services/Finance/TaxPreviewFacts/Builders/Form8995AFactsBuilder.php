<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Services\Finance\TaxPreviewFacts\Data\Form8995AEntityFact;
use App\Services\Finance\TaxPreviewFacts\Data\Form8995AFacts;
use App\Services\Finance\TaxPreviewFacts\Data\Form8995EntityFact;

class Form8995AFactsBuilder extends TaxPreviewFactBuilder
{
    /**
     * @param  Form8995EntityFact[]  $entities
     */
    public function build(
        array $entities,
        float $qualifiedReitDividends,
        float $qualifiedPtpIncome,
        float $taxableIncomeBeforeQbi,
        float $netCapitalGain,
        float $taxableIncomeLessNetCapitalGain,
        float $incomeLimitation,
        float $threshold,
        float $phaseInRange,
    ): Form8995AFacts {
        $phaseInPercentage = $this->phaseInPercentage($taxableIncomeBeforeQbi, $threshold, $phaseInRange);
        $entityFacts = array_map(
            fn (Form8995EntityFact $entity): Form8995AEntityFact => $this->entityFact($entity, $taxableIncomeBeforeQbi, $threshold, $phaseInRange, $phaseInPercentage),
            $entities,
        );
        $totalQbiComponent = $this->sumMoney(array_map(
            static fn (Form8995AEntityFact $entity): float => $entity->qualifiedBusinessIncomeComponent,
            $entityFacts,
        ));
        $qualifiedReitPtpComponent = $this->roundMoney(max(0.0, $this->sumMoney([$qualifiedReitDividends, $qualifiedPtpIncome])) * 0.2);
        $deductionBeforeIncomeLimit = $this->sumMoney([$totalQbiComponent, $qualifiedReitPtpComponent]);
        $deduction = min($deductionBeforeIncomeLimit, $incomeLimitation);

        return new Form8995AFacts(
            entities: $entityFacts,
            threshold: $threshold,
            phaseInRange: $phaseInRange,
            phaseInPercentage: $phaseInPercentage,
            totalQualifiedBusinessIncomeComponent: $totalQbiComponent,
            qualifiedReitPtpComponent: $qualifiedReitPtpComponent,
            deductionBeforeIncomeLimit: $deductionBeforeIncomeLimit,
            taxableIncomeBeforeQbi: $taxableIncomeBeforeQbi,
            netCapitalGain: $netCapitalGain,
            taxableIncomeLessNetCapitalGain: $taxableIncomeLessNetCapitalGain,
            incomeLimitation: $incomeLimitation,
            deduction: $deduction,
        );
    }

    private function entityFact(Form8995EntityFact $entity, float $taxableIncomeBeforeQbi, float $threshold, float $phaseInRange, float $phaseInPercentage): Form8995AEntityFact
    {
        $applicablePercentage = $this->applicablePercentage($entity, $taxableIncomeBeforeQbi, $threshold, $phaseInRange);
        $adjustedQbi = $this->roundMoney($entity->qbiIncome * $applicablePercentage);
        $w2Wages = $adjustedQbi > 0.0 ? $this->roundMoney($entity->w2Wages * $applicablePercentage) : 0.0;
        $ubia = $adjustedQbi > 0.0 ? $this->roundMoney($entity->ubia * $applicablePercentage) : 0.0;
        $qbiComponentBeforeLimit = $this->roundMoney(max(0.0, $adjustedQbi) * 0.2);
        $w2WageLimit = $this->roundMoney($w2Wages * 0.5);
        $w2WageUbiaLimit = $this->roundMoney($this->sumMoney([$w2Wages * 0.25, $ubia * 0.025]));
        $wageUbiaLimit = max($w2WageLimit, $w2WageUbiaLimit);
        $wageUbiaLimitedQbiComponent = min($qbiComponentBeforeLimit, $wageUbiaLimit);
        $phaseInReduction = $phaseInPercentage > 0.0 && $phaseInPercentage < 1.0 && $wageUbiaLimit < $qbiComponentBeforeLimit
            ? $this->roundMoney(($qbiComponentBeforeLimit - $wageUbiaLimit) * $phaseInPercentage)
            : 0.0;
        $qualifiedBusinessIncomeComponent = $phaseInReduction > 0.0
            ? $this->subtractMoney($qbiComponentBeforeLimit, $phaseInReduction)
            : $wageUbiaLimitedQbiComponent;

        return new Form8995AEntityFact(
            entityKey: $entity->entityKey,
            label: $entity->label,
            sourceKind: $entity->sourceKind,
            isSstb: $entity->isSstb,
            qbiIncome: $entity->qbiIncome,
            applicablePercentage: $applicablePercentage,
            adjustedQbi: $adjustedQbi,
            w2Wages: $w2Wages,
            ubia: $ubia,
            w2WageLimit: $w2WageLimit,
            w2WageUbiaLimit: $w2WageUbiaLimit,
            wageUbiaLimit: $wageUbiaLimit,
            qbiComponentBeforeLimit: $qbiComponentBeforeLimit,
            wageUbiaLimitedQbiComponent: $wageUbiaLimitedQbiComponent,
            phaseInReduction: $phaseInReduction,
            qualifiedBusinessIncomeComponent: $qualifiedBusinessIncomeComponent,
        );
    }

    private function phaseInPercentage(float $taxableIncomeBeforeQbi, float $threshold, float $phaseInRange): float
    {
        if ($phaseInRange <= 0.0 || $taxableIncomeBeforeQbi <= $threshold) {
            return 0.0;
        }

        return min(1.0, round(($taxableIncomeBeforeQbi - $threshold) / $phaseInRange, 5));
    }

    private function applicablePercentage(Form8995EntityFact $entity, float $taxableIncomeBeforeQbi, float $threshold, float $phaseInRange): float
    {
        if (! $entity->isSstb || $taxableIncomeBeforeQbi <= $threshold) {
            return 1.0;
        }

        if ($taxableIncomeBeforeQbi >= $threshold + $phaseInRange) {
            return 0.0;
        }

        return max(0.0, round(1.0 - (($taxableIncomeBeforeQbi - $threshold) / $phaseInRange), 5));
    }
}
