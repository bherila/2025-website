<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class Form8606SourceRowFact
{
    public function __construct(
        public string $payerName,
        public float $grossDistribution,
        public float $taxableAmount,
        public string $distributionCode,
        public bool $isIra,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'payerName' => $this->payerName,
            'grossDistribution' => $this->grossDistribution,
            'taxableAmount' => $this->taxableAmount,
            'distributionCode' => $this->distributionCode,
            'isIra' => $this->isIra,
        ];
    }
}
