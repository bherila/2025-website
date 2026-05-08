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
        public float $line43CarryoverToNextYearTotal,
        public float $line43CarryoverToNextYearCaTotal,
    ) {
        $this->entities = $entities;
    }

    public static function empty(): self
    {
        return new self(
            entities: [],
            line36AllowableHomeOfficeDeductionTotal: 0.0,
            line43CarryoverToNextYearTotal: 0.0,
            line43CarryoverToNextYearCaTotal: 0.0,
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
            'line43CarryoverToNextYearTotal' => $this->line43CarryoverToNextYearTotal,
            'line43CarryoverToNextYearCaTotal' => $this->line43CarryoverToNextYearCaTotal,
        ];
    }
}
