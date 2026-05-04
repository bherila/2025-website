<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use App\Services\Finance\CapitalGains\ScheduleDRollupInput;
use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class ScheduleDRollupFact
{
    public function __construct(
        public string $form8949Box,
        public bool $isShortTerm,
        public string $scheduleDLine,
        public float $totalProceeds,
        public float $totalCostBasis,
        public float $totalAdjustment,
        public float $netGainOrLoss,
        public int $rowCount,
    ) {}

    public static function fromRollup(ScheduleDRollupInput $rollup): self
    {
        return new self(
            form8949Box: $rollup->form8949Box,
            isShortTerm: $rollup->isShortTerm,
            scheduleDLine: $rollup->scheduleDLine,
            totalProceeds: round($rollup->totalProceeds, 2),
            totalCostBasis: round($rollup->totalCostBasis, 2),
            totalAdjustment: round($rollup->totalAdjustment, 2),
            netGainOrLoss: round($rollup->netGainOrLoss, 2),
            rowCount: $rollup->rowCount,
        );
    }

    /**
     * @return array{form8949Box:string,isShortTerm:bool,scheduleDLine:string,totalProceeds:float,totalCostBasis:float,totalAdjustment:float,netGainOrLoss:float,rowCount:int}
     */
    public function toArray(): array
    {
        return [
            'form8949Box' => $this->form8949Box,
            'isShortTerm' => $this->isShortTerm,
            'scheduleDLine' => $this->scheduleDLine,
            'totalProceeds' => $this->totalProceeds,
            'totalCostBasis' => $this->totalCostBasis,
            'totalAdjustment' => $this->totalAdjustment,
            'netGainOrLoss' => $this->netGainOrLoss,
            'rowCount' => $this->rowCount,
        ];
    }
}
