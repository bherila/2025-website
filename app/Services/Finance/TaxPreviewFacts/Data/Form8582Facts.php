<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class Form8582Facts
{
    /**
     * @var Form8582ActivityFact[]
     */
    public array $activities;

    /**
     * @param  Form8582ActivityFact[]  $activities
     */
    public function __construct(
        array $activities,
        public float $totalPassiveIncome,
        public float $totalPassiveLoss,
        public float $totalPriorYearUnallowed,
        public float $netPassiveResult,
        public float $rentalAllowance,
        public float $totalAllowedLoss,
        public float $totalSuspendedLoss,
        public float $netDeductionToReturn,
        public bool $isLossLimited,
        public float $magi,
        public bool $isMarried,
        public bool $realEstateProfessional,
    ) {
        $this->activities = $activities;
    }

    public static function empty(bool $isMarried = false): self
    {
        return new self(
            activities: [],
            totalPassiveIncome: 0.0,
            totalPassiveLoss: 0.0,
            totalPriorYearUnallowed: 0.0,
            netPassiveResult: 0.0,
            rentalAllowance: 0.0,
            totalAllowedLoss: 0.0,
            totalSuspendedLoss: 0.0,
            netDeductionToReturn: 0.0,
            isLossLimited: false,
            magi: 0.0,
            isMarried: $isMarried,
            realEstateProfessional: false,
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'activities' => array_map(static fn (Form8582ActivityFact $activity): array => $activity->toArray(), $this->activities),
            'totalPassiveIncome' => $this->totalPassiveIncome,
            'totalPassiveLoss' => $this->totalPassiveLoss,
            'totalPriorYearUnallowed' => $this->totalPriorYearUnallowed,
            'netPassiveResult' => $this->netPassiveResult,
            'rentalAllowance' => $this->rentalAllowance,
            'totalAllowedLoss' => $this->totalAllowedLoss,
            'totalSuspendedLoss' => $this->totalSuspendedLoss,
            'netDeductionToReturn' => $this->netDeductionToReturn,
            'isLossLimited' => $this->isLossLimited,
            'magi' => $this->magi,
            'isMarried' => $this->isMarried,
            'realEstateProfessional' => $this->realEstateProfessional,
        ];
    }
}
