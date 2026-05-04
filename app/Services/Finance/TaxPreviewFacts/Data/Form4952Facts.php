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
     * @param  TaxFactSource[]  $investmentInterestSources
     * @param  TaxFactSource[]  $investmentExpenseSources
     */
    public function __construct(
        array $investmentInterestSources,
        public float $totalInvestmentInterestExpense,
        array $investmentExpenseSources,
        public float $totalInvestmentExpenses,
        public float $netInvestmentIncomeBeforeQualifiedDividendElection,
        public float $totalQualifiedDividends,
        public float $deductibleInvestmentInterestExpense,
        public float $disallowedCarryforward,
    ) {
        $this->investmentInterestSources = $investmentInterestSources;
        $this->investmentExpenseSources = $investmentExpenseSources;
    }

    /**
     * @return array{investmentInterestSources:array<int,array<string,mixed>>,totalInvestmentInterestExpense:float,investmentExpenseSources:array<int,array<string,mixed>>,totalInvestmentExpenses:float,netInvestmentIncomeBeforeQualifiedDividendElection:float,totalQualifiedDividends:float,deductibleInvestmentInterestExpense:float,disallowedCarryforward:float}
     */
    public function toArray(): array
    {
        return [
            'investmentInterestSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->investmentInterestSources),
            'totalInvestmentInterestExpense' => $this->totalInvestmentInterestExpense,
            'investmentExpenseSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->investmentExpenseSources),
            'totalInvestmentExpenses' => $this->totalInvestmentExpenses,
            'netInvestmentIncomeBeforeQualifiedDividendElection' => $this->netInvestmentIncomeBeforeQualifiedDividendElection,
            'totalQualifiedDividends' => $this->totalQualifiedDividends,
            'deductibleInvestmentInterestExpense' => $this->deductibleInvestmentInterestExpense,
            'disallowedCarryforward' => $this->disallowedCarryforward,
        ];
    }
}
