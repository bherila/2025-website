<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class Form8829LineFact
{
    /**
     * @var TaxFactSource[]
     */
    public array $sources;

    /**
     * @param  TaxFactSource[]  $sources
     */
    public function __construct(
        public string $lineRef,
        public string $label,
        public float $directExpense,
        public float $indirectExpense,
        public float $allowable,
        array $sources,
    ) {
        $this->sources = $sources;
    }

    /**
     * @return array{lineRef:string,label:string,directExpense:float,indirectExpense:float,allowable:float,sources:array<int, array<string, mixed>>}
     */
    public function toArray(): array
    {
        return [
            'lineRef' => $this->lineRef,
            'label' => $this->label,
            'directExpense' => $this->directExpense,
            'indirectExpense' => $this->indirectExpense,
            'allowable' => $this->allowable,
            'sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->sources),
        ];
    }
}
