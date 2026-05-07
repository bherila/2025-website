<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class Form8995AEntityFact
{
    public function __construct(
        public string $entityKey,
        public string $label,
        public string $sourceKind,
        public bool $isSstb,
        public float $qbiIncome,
        public float $applicablePercentage,
        public float $adjustedQbi,
        public float $w2Wages,
        public float $ubia,
        public float $w2WageLimit,
        public float $w2WageUbiaLimit,
        public float $wageUbiaLimit,
        public float $qbiComponentBeforeLimit,
        public float $wageUbiaLimitedQbiComponent,
        public float $phaseInReduction,
        public float $qualifiedBusinessIncomeComponent,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'entityKey' => $this->entityKey,
            'label' => $this->label,
            'sourceKind' => $this->sourceKind,
            'isSstb' => $this->isSstb,
            'qbiIncome' => $this->qbiIncome,
            'applicablePercentage' => $this->applicablePercentage,
            'adjustedQbi' => $this->adjustedQbi,
            'w2Wages' => $this->w2Wages,
            'ubia' => $this->ubia,
            'w2WageLimit' => $this->w2WageLimit,
            'w2WageUbiaLimit' => $this->w2WageUbiaLimit,
            'wageUbiaLimit' => $this->wageUbiaLimit,
            'qbiComponentBeforeLimit' => $this->qbiComponentBeforeLimit,
            'wageUbiaLimitedQbiComponent' => $this->wageUbiaLimitedQbiComponent,
            'phaseInReduction' => $this->phaseInReduction,
            'qualifiedBusinessIncomeComponent' => $this->qualifiedBusinessIncomeComponent,
        ];
    }
}
