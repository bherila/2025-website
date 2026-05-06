<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class ScheduleCFacts
{
    /**
     * @var ScheduleCEntityFact[]
     */
    public array $entities;

    /**
     * @var TaxFactSource[]
     */
    public array $line31Sources;

    /**
     * @param  ScheduleCEntityFact[]  $entities
     * @param  TaxFactSource[]  $line31Sources
     */
    public function __construct(
        array $entities,
        public float $grossReceiptsTotal,
        public float $expensesTotal,
        public float $homeOfficeAllowable,
        public float $homeOfficeDisallowed,
        public float $homeOfficePriorCarryforward,
        public float $netProfit,
        public QuarterTotals $netProfitByQuarter,
        public float $deductiblePortionRoutedToSchedule1,
        array $line31Sources,
    ) {
        $this->entities = $entities;
        $this->line31Sources = $line31Sources;
    }

    public static function empty(): self
    {
        return new self(
            entities: [],
            grossReceiptsTotal: 0.0,
            expensesTotal: 0.0,
            homeOfficeAllowable: 0.0,
            homeOfficeDisallowed: 0.0,
            homeOfficePriorCarryforward: 0.0,
            netProfit: 0.0,
            netProfitByQuarter: QuarterTotals::empty(),
            deductiblePortionRoutedToSchedule1: 0.0,
            line31Sources: [],
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'entities' => array_map(static fn (ScheduleCEntityFact $entity): array => $entity->toArray(), $this->entities),
            'grossReceiptsTotal' => $this->grossReceiptsTotal,
            'expensesTotal' => $this->expensesTotal,
            'homeOfficeAllowable' => $this->homeOfficeAllowable,
            'homeOfficeDisallowed' => $this->homeOfficeDisallowed,
            'homeOfficePriorCarryforward' => $this->homeOfficePriorCarryforward,
            'netProfit' => $this->netProfit,
            'netProfitByQuarter' => $this->netProfitByQuarter->toArray(),
            'deductiblePortionRoutedToSchedule1' => $this->deductiblePortionRoutedToSchedule1,
            'line31Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line31Sources),
        ];
    }
}
