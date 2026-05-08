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
     * @var TaxFactSource[]
     */
    public array $line44Sources;

    /**
     * @param  Form8829LineFact[]  $homeOfficeLines
     * @param  TaxFactSource[]  $line36Sources
     * @param  TaxFactSource[]  $line43Sources
     * @param  TaxFactSource[]  $line44Sources
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
        public float $line14DeductibleMortgageInterestAndTaxes,
        public float $line15OperatingExpenseLimit,
        public float $line23OperatingExpensesTotal,
        public float $line24AllowableOperatingIndirectExpenses,
        public float $line25PriorYearOpCarryover,
        public float $line26TotalOperatingExpenseClaim,
        public float $line27AllowableOperatingExpenses,
        public float $line28ExcessCasualtyAndDepreciationLimit,
        public float $line30Depreciation,
        public float $line31PriorYearExcessCasualtyAndDepreciationCarryover,
        public float $line32TotalExcessCasualtyAndDepreciation,
        public float $line33AllowableExcessCasualtyAndDepreciation,
        public float $line36AllowableHomeOfficeDeduction,
        public float $line43OperatingCarryoverToNextYear,
        public float $line43OperatingCarryoverToNextYearCa,
        public float $line44ExcessCasualtyAndDepreciationCarryoverToNextYear,
        public float $line44ExcessCasualtyAndDepreciationCarryoverToNextYearCa,
        public float $carryoverToNextYear,
        public float $carryoverToNextYearCa,
        public float $regularDeduction,
        public float $simplifiedDeduction,
        public string $limitationReason,
        array $line36Sources,
        array $line43Sources,
        array $line44Sources,
    ) {
        $this->homeOfficeLines = $homeOfficeLines;
        $this->line36Sources = $line36Sources;
        $this->line43Sources = $line43Sources;
        $this->line44Sources = $line44Sources;
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
            'line14DeductibleMortgageInterestAndTaxes' => $this->line14DeductibleMortgageInterestAndTaxes,
            'line15OperatingExpenseLimit' => $this->line15OperatingExpenseLimit,
            'line23OperatingExpensesTotal' => $this->line23OperatingExpensesTotal,
            'line24AllowableOperatingIndirectExpenses' => $this->line24AllowableOperatingIndirectExpenses,
            'line25PriorYearOpCarryover' => $this->line25PriorYearOpCarryover,
            'line26TotalOperatingExpenseClaim' => $this->line26TotalOperatingExpenseClaim,
            'line27AllowableOperatingExpenses' => $this->line27AllowableOperatingExpenses,
            'line28ExcessCasualtyAndDepreciationLimit' => $this->line28ExcessCasualtyAndDepreciationLimit,
            'line30Depreciation' => $this->line30Depreciation,
            'line31PriorYearExcessCasualtyAndDepreciationCarryover' => $this->line31PriorYearExcessCasualtyAndDepreciationCarryover,
            'line32TotalExcessCasualtyAndDepreciation' => $this->line32TotalExcessCasualtyAndDepreciation,
            'line33AllowableExcessCasualtyAndDepreciation' => $this->line33AllowableExcessCasualtyAndDepreciation,
            'line36AllowableHomeOfficeDeduction' => $this->line36AllowableHomeOfficeDeduction,
            'line43OperatingCarryoverToNextYear' => $this->line43OperatingCarryoverToNextYear,
            'line43OperatingCarryoverToNextYearCa' => $this->line43OperatingCarryoverToNextYearCa,
            'line44ExcessCasualtyAndDepreciationCarryoverToNextYear' => $this->line44ExcessCasualtyAndDepreciationCarryoverToNextYear,
            'line44ExcessCasualtyAndDepreciationCarryoverToNextYearCa' => $this->line44ExcessCasualtyAndDepreciationCarryoverToNextYearCa,
            'carryoverToNextYear' => $this->carryoverToNextYear,
            'carryoverToNextYearCa' => $this->carryoverToNextYearCa,
            'regularDeduction' => $this->regularDeduction,
            'simplifiedDeduction' => $this->simplifiedDeduction,
            'limitationReason' => $this->limitationReason,
            'line36Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line36Sources),
            'line43Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line43Sources),
            'line44Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line44Sources),
        ];
    }
}
