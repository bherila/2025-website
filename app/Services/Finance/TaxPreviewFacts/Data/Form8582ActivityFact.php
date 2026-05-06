<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class Form8582ActivityFact
{
    public function __construct(
        public string $activityName,
        public ?string $ein,
        public bool $isRentalRealEstate,
        public bool $activeParticipation,
        public float $currentIncome,
        public float $currentLoss,
        public float $priorYearUnallowed,
        public float $overallGainOrLoss,
        public float $allowedLossThisYear,
        public float $suspendedLossCarryforward,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'activityName' => $this->activityName,
            'ein' => $this->ein,
            'isRentalRealEstate' => $this->isRentalRealEstate,
            'activeParticipation' => $this->activeParticipation,
            'currentIncome' => $this->currentIncome,
            'currentLoss' => $this->currentLoss,
            'priorYearUnallowed' => $this->priorYearUnallowed,
            'overallGainOrLoss' => $this->overallGainOrLoss,
            'allowedLossThisYear' => $this->allowedLossThisYear,
            'suspendedLossCarryforward' => $this->suspendedLossCarryforward,
        ];
    }
}
