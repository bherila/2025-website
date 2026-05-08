<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class Form8959Facts
{
    /**
     * @var TaxFactSource[]
     */
    public array $wageSources;

    /**
     * @param  TaxFactSource[]  $wageSources
     */
    public function __construct(
        public float $wages,
        public float $threshold,
        public float $excessWages,
        public float $additionalTax,
        array $wageSources,
    ) {
        $this->wageSources = $wageSources;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'wages' => $this->wages,
            'threshold' => $this->threshold,
            'excessWages' => $this->excessWages,
            'additionalTax' => $this->additionalTax,
            'wageSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->wageSources),
        ];
    }
}
