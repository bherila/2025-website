<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class Form8829EntityFact
{
    /**
     * @var Form8829LineFact[]
     */
    public array $homeOfficeLines;

    /**
     * @var TaxFactSource[]
     */
    public array $line36Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line43Sources;

    /**
     * @param  Form8829LineFact[]  $homeOfficeLines
     * @param  TaxFactSource[]  $line36Sources
     * @param  TaxFactSource[]  $line43Sources
     */
    public function __construct(
        public ?int $entityId,
        public string $entityName,
        public string $method,
        public ?float $officeSqft,
        public ?float $homeSqft,
        public int $monthsUsed,
        public float $businessUsePercentage,
        public float $priorYearOpCarryover,
        public float $priorYearOpCarryoverCa,
        public float $priorYearDepreciationCarryover,
        public float $priorYearDepreciationCarryoverCa,
        public float $line1OfficeSqft,
        public float $line2HomeSqft,
        public float $line3BusinessUsePercentage,
        public float $line7BusinessUsePercentage,
        public float $line8TentativeProfit,
        array $homeOfficeLines,
        public float $line24IndirectExpensesTotal,
        public float $line25AllowableIndirectExpenses,
        public float $line26PriorYearOpCarryover,
        public float $line27AllowableOperatingExpenses,
        public float $line36AllowableHomeOfficeDeduction,
        public float $line41ExcessCasualtyAndDepreciation,
        public float $line42DepreciationCarryover,
        public float $line43CarryoverToNextYear,
        public float $line43CarryoverToNextYearCa,
        public float $regularDeduction,
        public float $simplifiedDeduction,
        public string $limitationReason,
        array $line36Sources,
        array $line43Sources,
    ) {
        $this->homeOfficeLines = $homeOfficeLines;
        $this->line36Sources = $line36Sources;
        $this->line43Sources = $line43Sources;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'entityId' => $this->entityId,
            'entityName' => $this->entityName,
            'method' => $this->method,
            'officeSqft' => $this->officeSqft,
            'homeSqft' => $this->homeSqft,
            'monthsUsed' => $this->monthsUsed,
            'businessUsePercentage' => $this->businessUsePercentage,
            'priorYearOpCarryover' => $this->priorYearOpCarryover,
            'priorYearOpCarryoverCa' => $this->priorYearOpCarryoverCa,
            'priorYearDepreciationCarryover' => $this->priorYearDepreciationCarryover,
            'priorYearDepreciationCarryoverCa' => $this->priorYearDepreciationCarryoverCa,
            'line1OfficeSqft' => $this->line1OfficeSqft,
            'line2HomeSqft' => $this->line2HomeSqft,
            'line3BusinessUsePercentage' => $this->line3BusinessUsePercentage,
            'line7BusinessUsePercentage' => $this->line7BusinessUsePercentage,
            'line8TentativeProfit' => $this->line8TentativeProfit,
            'homeOfficeLines' => array_map(static fn (Form8829LineFact $line): array => $line->toArray(), $this->homeOfficeLines),
            'line24IndirectExpensesTotal' => $this->line24IndirectExpensesTotal,
            'line25AllowableIndirectExpenses' => $this->line25AllowableIndirectExpenses,
            'line26PriorYearOpCarryover' => $this->line26PriorYearOpCarryover,
            'line27AllowableOperatingExpenses' => $this->line27AllowableOperatingExpenses,
            'line36AllowableHomeOfficeDeduction' => $this->line36AllowableHomeOfficeDeduction,
            'line41ExcessCasualtyAndDepreciation' => $this->line41ExcessCasualtyAndDepreciation,
            'line42DepreciationCarryover' => $this->line42DepreciationCarryover,
            'line43CarryoverToNextYear' => $this->line43CarryoverToNextYear,
            'line43CarryoverToNextYearCa' => $this->line43CarryoverToNextYearCa,
            'regularDeduction' => $this->regularDeduction,
            'simplifiedDeduction' => $this->simplifiedDeduction,
            'limitationReason' => $this->limitationReason,
            'line36Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line36Sources),
            'line43Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line43Sources),
        ];
    }
}
