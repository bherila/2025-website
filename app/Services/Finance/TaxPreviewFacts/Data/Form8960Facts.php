<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class Form8960Facts
{
    /**
     * @var TaxFactSource[]
     */
    public array $componentSources;

    /**
     * @param  TaxFactSource[]  $componentSources
     */
    public function __construct(
        public float $taxableInterest,
        public float $ordinaryDividends,
        public float $netCapGains,
        public float $passiveIncome,
        public float $nonpassiveTradingIncome,
        public float $investmentInterestExpense,
        public float $grossNII,
        public float $totalDeductions,
        public float $netInvestmentIncome,
        public ?float $magi,
        public ?float $thresholdSingle,
        public ?float $thresholdMarriedFilingJointly,
        public ?float $magiExcessSingle,
        public ?float $magiExcessMarriedFilingJointly,
        public ?float $niitTaxSingle,
        public ?float $niitTaxMarriedFilingJointly,
        public bool $needsMagi,
        array $componentSources,
    ) {
        $this->componentSources = $componentSources;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'taxableInterest' => $this->taxableInterest,
            'ordinaryDividends' => $this->ordinaryDividends,
            'netCapGains' => $this->netCapGains,
            'passiveIncome' => $this->passiveIncome,
            'nonpassiveTradingIncome' => $this->nonpassiveTradingIncome,
            'investmentInterestExpense' => $this->investmentInterestExpense,
            'grossNII' => $this->grossNII,
            'totalDeductions' => $this->totalDeductions,
            'netInvestmentIncome' => $this->netInvestmentIncome,
            'magi' => $this->magi,
            'thresholdSingle' => $this->thresholdSingle,
            'thresholdMarriedFilingJointly' => $this->thresholdMarriedFilingJointly,
            'magiExcessSingle' => $this->magiExcessSingle,
            'magiExcessMarriedFilingJointly' => $this->magiExcessMarriedFilingJointly,
            'niitTaxSingle' => $this->niitTaxSingle,
            'niitTaxMarriedFilingJointly' => $this->niitTaxMarriedFilingJointly,
            'needsMagi' => $this->needsMagi,
            'componentSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->componentSources),
        ];
    }
}
