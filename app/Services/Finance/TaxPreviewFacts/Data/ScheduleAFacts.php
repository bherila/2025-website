<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class ScheduleAFacts
{
    /**
     * @var TaxFactSource[]
     */
    public array $stateIncomeTaxSources;

    /**
     * @var TaxFactSource[]
     */
    public array $salesTaxSources;

    /**
     * @var TaxFactSource[]
     */
    public array $realEstateTaxSources;

    /**
     * @var TaxFactSource[]
     */
    public array $mortgageInterestSources;

    /**
     * @var TaxFactSource[]
     */
    public array $investmentInterestSources;

    /**
     * @var TaxFactSource[]
     */
    public array $charitableCashSources;

    /**
     * @var TaxFactSource[]
     */
    public array $charitableNoncashSources;

    /**
     * @var TaxFactSource[]
     */
    public array $otherItemizedSources;

    /**
     * @param  TaxFactSource[]  $stateIncomeTaxSources
     * @param  TaxFactSource[]  $salesTaxSources
     * @param  TaxFactSource[]  $realEstateTaxSources
     * @param  TaxFactSource[]  $mortgageInterestSources
     * @param  TaxFactSource[]  $investmentInterestSources
     * @param  TaxFactSource[]  $charitableCashSources
     * @param  TaxFactSource[]  $charitableNoncashSources
     * @param  TaxFactSource[]  $otherItemizedSources
     */
    public function __construct(
        array $stateIncomeTaxSources,
        public float $stateIncomeTaxTotal,
        array $salesTaxSources,
        public float $salesTaxTotal,
        array $realEstateTaxSources,
        public float $realEstateTaxTotal,
        public float $saltPaidBeforeCap,
        public float $saltCap,
        public float $saltDeduction,
        array $mortgageInterestSources,
        public float $mortgageInterestTotal,
        array $investmentInterestSources,
        public float $investmentInterestTotal,
        public float $totalInterest,
        array $charitableCashSources,
        public float $charitableCashTotal,
        array $charitableNoncashSources,
        public float $charitableNoncashTotal,
        public float $charitableTotal,
        array $otherItemizedSources,
        public float $otherItemizedTotal,
        public float $totalItemizedDeductions,
        public float $standardDeductionSingle,
        public float $standardDeductionMarriedFilingJointly,
        public bool $shouldItemizeSingle,
        public bool $shouldItemizeMarriedFilingJointly,
    ) {
        $this->stateIncomeTaxSources = $stateIncomeTaxSources;
        $this->salesTaxSources = $salesTaxSources;
        $this->realEstateTaxSources = $realEstateTaxSources;
        $this->mortgageInterestSources = $mortgageInterestSources;
        $this->investmentInterestSources = $investmentInterestSources;
        $this->charitableCashSources = $charitableCashSources;
        $this->charitableNoncashSources = $charitableNoncashSources;
        $this->otherItemizedSources = $otherItemizedSources;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'stateIncomeTaxSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->stateIncomeTaxSources),
            'stateIncomeTaxTotal' => $this->stateIncomeTaxTotal,
            'salesTaxSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->salesTaxSources),
            'salesTaxTotal' => $this->salesTaxTotal,
            'realEstateTaxSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->realEstateTaxSources),
            'realEstateTaxTotal' => $this->realEstateTaxTotal,
            'saltPaidBeforeCap' => $this->saltPaidBeforeCap,
            'saltCap' => $this->saltCap,
            'saltDeduction' => $this->saltDeduction,
            'mortgageInterestSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->mortgageInterestSources),
            'mortgageInterestTotal' => $this->mortgageInterestTotal,
            'investmentInterestSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->investmentInterestSources),
            'investmentInterestTotal' => $this->investmentInterestTotal,
            'totalInterest' => $this->totalInterest,
            'charitableCashSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->charitableCashSources),
            'charitableCashTotal' => $this->charitableCashTotal,
            'charitableNoncashSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->charitableNoncashSources),
            'charitableNoncashTotal' => $this->charitableNoncashTotal,
            'charitableTotal' => $this->charitableTotal,
            'otherItemizedSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->otherItemizedSources),
            'otherItemizedTotal' => $this->otherItemizedTotal,
            'totalItemizedDeductions' => $this->totalItemizedDeductions,
            'standardDeductionSingle' => $this->standardDeductionSingle,
            'standardDeductionMarriedFilingJointly' => $this->standardDeductionMarriedFilingJointly,
            'shouldItemizeSingle' => $this->shouldItemizeSingle,
            'shouldItemizeMarriedFilingJointly' => $this->shouldItemizeMarriedFilingJointly,
        ];
    }
}
