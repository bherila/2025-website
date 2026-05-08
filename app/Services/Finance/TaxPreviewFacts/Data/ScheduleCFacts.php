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
        public float $returnsAndAllowancesTotal,
        public float $grossIncomeAfterReturns,
        public float $expensesTotal,
        public float $tentativeProfitBeforeHomeOffice,
        public float $homeOfficeAllowable,
        public float $homeOfficeDisallowed,
        public float $homeOfficePriorCarryforward,
        public float $homeOfficeCarryoverToNextYear,
        public float $netProfit,
        public QuarterTotals $netProfitCumulativeByQuarter,
        public float $netProfitRoutedToSchedule1,
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
            returnsAndAllowancesTotal: 0.0,
            grossIncomeAfterReturns: 0.0,
            expensesTotal: 0.0,
            tentativeProfitBeforeHomeOffice: 0.0,
            homeOfficeAllowable: 0.0,
            homeOfficeDisallowed: 0.0,
            homeOfficePriorCarryforward: 0.0,
            homeOfficeCarryoverToNextYear: 0.0,
            netProfit: 0.0,
            netProfitCumulativeByQuarter: QuarterTotals::empty(),
            netProfitRoutedToSchedule1: 0.0,
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
            'returnsAndAllowancesTotal' => $this->returnsAndAllowancesTotal,
            'grossIncomeAfterReturns' => $this->grossIncomeAfterReturns,
            'expensesTotal' => $this->expensesTotal,
            'tentativeProfitBeforeHomeOffice' => $this->tentativeProfitBeforeHomeOffice,
            'homeOfficeAllowable' => $this->homeOfficeAllowable,
            'homeOfficeDisallowed' => $this->homeOfficeDisallowed,
            'homeOfficePriorCarryforward' => $this->homeOfficePriorCarryforward,
            'homeOfficeCarryoverToNextYear' => $this->homeOfficeCarryoverToNextYear,
            'netProfit' => $this->netProfit,
            'netProfitCumulativeByQuarter' => $this->netProfitCumulativeByQuarter->toArray(),
            'netProfitRoutedToSchedule1' => $this->netProfitRoutedToSchedule1,
            'line31Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line31Sources),
        ];
    }
}
