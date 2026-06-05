<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class Form4952Facts
{
    /**
     * @var TaxFactSource[]
     */
    public array $investmentInterestSources;

    /**
     * @var TaxFactSource[]
     */
    public array $investmentExpenseSources;

    /**
     * @var TaxFactSource[]
     */
    public array $excludedInvestmentExpenseSources;

    /**
     * @var TaxFactSource[]
     */
    public array $materialParticipationScheduleEInterestSources;

    /**
     * @var TaxFactSource[]
     */
    public array $grossInvestmentIncomeFromK1Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $qualifiedDividendSources;

    /**
     * @var Form4952CarryDestination[]
     */
    public array $carryDestinations;

    /**
     * @var Form4952TracingSplit[]
     */
    public array $tracingSplitSources;

    /**
     * @param  TaxFactSource[]  $investmentInterestSources
     * @param  TaxFactSource[]  $investmentExpenseSources
     * @param  TaxFactSource[]  $excludedInvestmentExpenseSources
     * @param  TaxFactSource[]  $materialParticipationScheduleEInterestSources
     * @param  TaxFactSource[]  $grossInvestmentIncomeFromK1Sources
     * @param  TaxFactSource[]  $qualifiedDividendSources
     * @param  Form4952CarryDestination[]  $carryDestinations
     * @param  Form4952TracingSplit[]  $tracingSplitSources
     */
    public function __construct(
        array $investmentInterestSources,
        public float $totalInvestmentInterestExpense,
        array $investmentExpenseSources,
        public float $totalInvestmentExpenses,
        array $excludedInvestmentExpenseSources,
        public float $totalExcludedInvestmentExpenses,
        array $materialParticipationScheduleEInterestSources,
        public float $totalMaterialParticipationScheduleEInterest,
        public float $grossInvestmentIncomeFromScheduleB,
        public float $grossInvestmentIncomeFromK1,
        public float $grossInvestmentIncomeTotal,
        public float $line4cNetInvestmentIncomeAfterQualifiedDividends,
        public float $netInvestmentIncomeBeforeQualifiedDividendElection,
        public float $totalQualifiedDividends,
        public float $deductibleInvestmentInterestExpense,
        public float $disallowedCarryforward,
        array $grossInvestmentIncomeFromK1Sources,
        array $qualifiedDividendSources,
        public float $deductibleScheduleEAboveLine,
        public float $deductibleScheduleAItemized,
        public float $carryforwardScheduleE,
        public float $carryforwardScheduleA,
        array $carryDestinations,
        public string $allocationMethod = 'pro_rata',
        public string $allocationMethodDescription = 'Pro-rata allocation under Rev. Rul. 2008-38.',
        array $tracingSplitSources = [],
    ) {
        $this->investmentInterestSources = $investmentInterestSources;
        $this->investmentExpenseSources = $investmentExpenseSources;
        $this->excludedInvestmentExpenseSources = $excludedInvestmentExpenseSources;
        $this->materialParticipationScheduleEInterestSources = $materialParticipationScheduleEInterestSources;
        $this->grossInvestmentIncomeFromK1Sources = $grossInvestmentIncomeFromK1Sources;
        $this->qualifiedDividendSources = $qualifiedDividendSources;
        $this->carryDestinations = $carryDestinations;
        $this->tracingSplitSources = $tracingSplitSources;
    }

    /**
     * @return array{investmentInterestSources:array<int,array<string,mixed>>,totalInvestmentInterestExpense:float,investmentExpenseSources:array<int,array<string,mixed>>,totalInvestmentExpenses:float,excludedInvestmentExpenseSources:array<int,array<string,mixed>>,totalExcludedInvestmentExpenses:float,materialParticipationScheduleEInterestSources:array<int,array<string,mixed>>,totalMaterialParticipationScheduleEInterest:float,grossInvestmentIncomeFromScheduleB:float,grossInvestmentIncomeFromK1:float,grossInvestmentIncomeTotal:float,line4cNetInvestmentIncomeAfterQualifiedDividends:float,netInvestmentIncomeBeforeQualifiedDividendElection:float,totalQualifiedDividends:float,deductibleInvestmentInterestExpense:float,disallowedCarryforward:float,grossInvestmentIncomeFromK1Sources:array<int,array<string,mixed>>,qualifiedDividendSources:array<int,array<string,mixed>>,deductibleScheduleEAboveLine:float,deductibleScheduleAItemized:float,carryforwardScheduleE:float,carryforwardScheduleA:float,carryDestinations:array<int,array<string,mixed>>,allocationMethod:string,allocationMethodDescription:string,tracingSplitSources:array<int,array<string,mixed>>}
     */
    public function toArray(): array
    {
        return [
            'investmentInterestSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->investmentInterestSources),
            'totalInvestmentInterestExpense' => $this->totalInvestmentInterestExpense,
            'investmentExpenseSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->investmentExpenseSources),
            'totalInvestmentExpenses' => $this->totalInvestmentExpenses,
            'excludedInvestmentExpenseSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->excludedInvestmentExpenseSources),
            'totalExcludedInvestmentExpenses' => $this->totalExcludedInvestmentExpenses,
            'materialParticipationScheduleEInterestSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->materialParticipationScheduleEInterestSources),
            'totalMaterialParticipationScheduleEInterest' => $this->totalMaterialParticipationScheduleEInterest,
            'grossInvestmentIncomeFromScheduleB' => $this->grossInvestmentIncomeFromScheduleB,
            'grossInvestmentIncomeFromK1' => $this->grossInvestmentIncomeFromK1,
            'grossInvestmentIncomeTotal' => $this->grossInvestmentIncomeTotal,
            'line4cNetInvestmentIncomeAfterQualifiedDividends' => $this->line4cNetInvestmentIncomeAfterQualifiedDividends,
            'netInvestmentIncomeBeforeQualifiedDividendElection' => $this->netInvestmentIncomeBeforeQualifiedDividendElection,
            'totalQualifiedDividends' => $this->totalQualifiedDividends,
            'deductibleInvestmentInterestExpense' => $this->deductibleInvestmentInterestExpense,
            'disallowedCarryforward' => $this->disallowedCarryforward,
            'grossInvestmentIncomeFromK1Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->grossInvestmentIncomeFromK1Sources),
            'qualifiedDividendSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->qualifiedDividendSources),
            'deductibleScheduleEAboveLine' => $this->deductibleScheduleEAboveLine,
            'deductibleScheduleAItemized' => $this->deductibleScheduleAItemized,
            'carryforwardScheduleE' => $this->carryforwardScheduleE,
            'carryforwardScheduleA' => $this->carryforwardScheduleA,
            'carryDestinations' => array_map(static fn (Form4952CarryDestination $destination): array => $destination->toArray(), $this->carryDestinations),
            'allocationMethod' => $this->allocationMethod,
            'allocationMethodDescription' => $this->allocationMethodDescription,
            'tracingSplitSources' => array_map(static fn (Form4952TracingSplit $source): array => $source->toArray(), $this->tracingSplitSources),
        ];
    }
}
