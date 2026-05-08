<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class Form8829Facts
{
    /**
     * @var Form8829EntityFact[]
     */
    public array $entities;

    /**
     * @param  Form8829EntityFact[]  $entities
     */
    public function __construct(
        array $entities,
        public float $line36AllowableHomeOfficeDeductionTotal,
        public float $line43OperatingCarryoverToNextYearTotal,
        public float $line43OperatingCarryoverToNextYearCaTotal,
        public float $line44ExcessCasualtyAndDepreciationCarryoverToNextYearTotal,
        public float $line44ExcessCasualtyAndDepreciationCarryoverToNextYearCaTotal,
        public float $carryoverToNextYearTotal,
        public float $carryoverToNextYearCaTotal,
    ) {
        $this->entities = $entities;
    }

    public static function empty(): self
    {
        return new self(
            entities: [],
            line36AllowableHomeOfficeDeductionTotal: 0.0,
            line43OperatingCarryoverToNextYearTotal: 0.0,
            line43OperatingCarryoverToNextYearCaTotal: 0.0,
            line44ExcessCasualtyAndDepreciationCarryoverToNextYearTotal: 0.0,
            line44ExcessCasualtyAndDepreciationCarryoverToNextYearCaTotal: 0.0,
            carryoverToNextYearTotal: 0.0,
            carryoverToNextYearCaTotal: 0.0,
        );
    }

    public function entityFor(?int $entityId): ?Form8829EntityFact
    {
        foreach ($this->entities as $entity) {
            if ($entity->entityId === $entityId) {
                return $entity;
            }
        }

        return null;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'entities' => array_map(static fn (Form8829EntityFact $entity): array => $entity->toArray(), $this->entities),
            'line36AllowableHomeOfficeDeductionTotal' => $this->line36AllowableHomeOfficeDeductionTotal,
            'line43OperatingCarryoverToNextYearTotal' => $this->line43OperatingCarryoverToNextYearTotal,
            'line43OperatingCarryoverToNextYearCaTotal' => $this->line43OperatingCarryoverToNextYearCaTotal,
            'line44ExcessCasualtyAndDepreciationCarryoverToNextYearTotal' => $this->line44ExcessCasualtyAndDepreciationCarryoverToNextYearTotal,
            'line44ExcessCasualtyAndDepreciationCarryoverToNextYearCaTotal' => $this->line44ExcessCasualtyAndDepreciationCarryoverToNextYearCaTotal,
            'carryoverToNextYearTotal' => $this->carryoverToNextYearTotal,
            'carryoverToNextYearCaTotal' => $this->carryoverToNextYearCaTotal,
        ];
    }
}
