<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class ScheduleBFacts
{
    /**
     * @var TaxFactSource[]
     */
    public array $interestSources;

    /**
     * @var TaxFactSource[]
     */
    public array $ordinaryDividendSources;

    /**
     * @var TaxFactSource[]
     */
    public array $qualifiedDividendSources;

    /**
     * @param  TaxFactSource[]  $interestSources
     * @param  TaxFactSource[]  $ordinaryDividendSources
     * @param  TaxFactSource[]  $qualifiedDividendSources
     */
    public function __construct(
        array $interestSources,
        public float $directInterestTotal,
        public float $k1InterestTotal,
        public float $interestTotal,
        array $ordinaryDividendSources,
        public float $directOrdinaryDividendTotal,
        public float $k1OrdinaryDividendTotal,
        public float $ordinaryDividendTotal,
        array $qualifiedDividendSources,
        public float $qualifiedDividendTotal,
        public float $form4952Line5aTotal,
    ) {
        $this->interestSources = $interestSources;
        $this->ordinaryDividendSources = $ordinaryDividendSources;
        $this->qualifiedDividendSources = $qualifiedDividendSources;
    }

    /**
     * @return array{interestSources:array<int,array<string,mixed>>,directInterestTotal:float,k1InterestTotal:float,interestTotal:float,ordinaryDividendSources:array<int,array<string,mixed>>,directOrdinaryDividendTotal:float,k1OrdinaryDividendTotal:float,ordinaryDividendTotal:float,qualifiedDividendSources:array<int,array<string,mixed>>,qualifiedDividendTotal:float,form4952Line5aTotal:float}
     */
    public function toArray(): array
    {
        return [
            'interestSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->interestSources),
            'directInterestTotal' => $this->directInterestTotal,
            'k1InterestTotal' => $this->k1InterestTotal,
            'interestTotal' => $this->interestTotal,
            'ordinaryDividendSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->ordinaryDividendSources),
            'directOrdinaryDividendTotal' => $this->directOrdinaryDividendTotal,
            'k1OrdinaryDividendTotal' => $this->k1OrdinaryDividendTotal,
            'ordinaryDividendTotal' => $this->ordinaryDividendTotal,
            'qualifiedDividendSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->qualifiedDividendSources),
            'qualifiedDividendTotal' => $this->qualifiedDividendTotal,
            'form4952Line5aTotal' => $this->form4952Line5aTotal,
        ];
    }
}
