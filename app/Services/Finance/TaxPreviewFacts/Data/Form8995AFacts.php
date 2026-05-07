<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class Form8995AFacts
{
    /**
     * @var Form8995AEntityFact[]
     */
    public array $entities;

    /**
     * @param  Form8995AEntityFact[]  $entities
     */
    public function __construct(
        array $entities,
        public float $threshold,
        public float $phaseInRange,
        public float $phaseInPercentage,
        public float $totalQualifiedBusinessIncomeComponent,
        public float $qualifiedReitPtpComponent,
        public float $deductionBeforeIncomeLimit,
        public float $taxableIncomeBeforeQbi,
        public float $netCapitalGain,
        public float $taxableIncomeLessNetCapitalGain,
        public float $incomeLimitation,
        public float $deduction,
    ) {
        $this->entities = $entities;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'entities' => array_map(static fn (Form8995AEntityFact $entity): array => $entity->toArray(), $this->entities),
            'threshold' => $this->threshold,
            'phaseInRange' => $this->phaseInRange,
            'phaseInPercentage' => $this->phaseInPercentage,
            'totalQualifiedBusinessIncomeComponent' => $this->totalQualifiedBusinessIncomeComponent,
            'qualifiedReitPtpComponent' => $this->qualifiedReitPtpComponent,
            'deductionBeforeIncomeLimit' => $this->deductionBeforeIncomeLimit,
            'taxableIncomeBeforeQbi' => $this->taxableIncomeBeforeQbi,
            'netCapitalGain' => $this->netCapitalGain,
            'taxableIncomeLessNetCapitalGain' => $this->taxableIncomeLessNetCapitalGain,
            'incomeLimitation' => $this->incomeLimitation,
            'deduction' => $this->deduction,
        ];
    }
}
