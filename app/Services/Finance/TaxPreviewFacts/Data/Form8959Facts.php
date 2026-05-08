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
     * @var TaxFactSource[]
     */
    public array $withholdingSources;

    /**
     * @param  TaxFactSource[]  $wageSources
     * @param  TaxFactSource[]  $withholdingSources
     */
    public function __construct(
        public float $wages,
        public float $threshold,
        public float $excessWages,
        public float $additionalTax,
        public float $medicareTaxWithheld,
        public float $regularMedicareTaxWithholding,
        public float $additionalMedicareWithholding,
        array $wageSources,
        array $withholdingSources,
    ) {
        $this->wageSources = $wageSources;
        $this->withholdingSources = $withholdingSources;
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
            'medicareTaxWithheld' => $this->medicareTaxWithheld,
            'regularMedicareTaxWithholding' => $this->regularMedicareTaxWithholding,
            'additionalMedicareWithholding' => $this->additionalMedicareWithholding,
            'wageSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->wageSources),
            'withholdingSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->withholdingSources),
        ];
    }
}
