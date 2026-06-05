<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

/**
 * Where an allowed slice of the Form 4952 deductible investment interest carries.
 *
 * The §163(d)(1) net-investment-income limit is applied to the aggregate, then the
 * allowed deduction (and the disallowed carryforward) is split pro rata between the
 * two §163(d)(5)(A) categories (Rev. Rul. 2008-38, Issue 2):
 *  - §163(d)(5)(A)(i) ordinary/margin/investor interest → Schedule A, line 9 (itemized)
 *  - §163(d)(5)(A)(ii) trader-partnership interest → Schedule E, Part II, line 28
 *    (above-the-line, §62(a)(1); Announcement 2008-65)
 */
#[TypeScript]
readonly class Form4952CarryDestination
{
    /**
     * @var TaxFactSource[]
     */
    public array $sources;

    /**
     * @param  TaxFactSource[]  $sources
     */
    public function __construct(
        public string $destination,
        public string $label,
        public string $formLine,
        public float $grossInterest,
        public float $allowedDeduction,
        public float $carryforward,
        public float $share,
        public string $citation,
        array $sources,
    ) {
        $this->sources = $sources;
    }

    /**
     * @return array{destination:string,label:string,formLine:string,grossInterest:float,allowedDeduction:float,carryforward:float,share:float,citation:string,sources:array<int,array<string,mixed>>}
     */
    public function toArray(): array
    {
        return [
            'destination' => $this->destination,
            'label' => $this->label,
            'formLine' => $this->formLine,
            'grossInterest' => $this->grossInterest,
            'allowedDeduction' => $this->allowedDeduction,
            'carryforward' => $this->carryforward,
            'share' => $this->share,
            'citation' => $this->citation,
            'sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->sources),
        ];
    }
}
