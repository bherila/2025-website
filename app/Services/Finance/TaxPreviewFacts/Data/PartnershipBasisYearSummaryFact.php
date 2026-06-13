<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class PartnershipBasisYearSummaryFact
{
    public function __construct(
        public int $taxYear,
        public string $reviewStatus,
        public bool $isStale,
        public bool $isLocked,
        public ?float $carryoverMismatch,
        public PartnershipBasisWorksheetFacts $worksheet,
    ) {}

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'taxYear' => $this->taxYear,
            'reviewStatus' => $this->reviewStatus,
            'isStale' => $this->isStale,
            'isLocked' => $this->isLocked,
            'carryoverMismatch' => $this->carryoverMismatch,
            'worksheet' => $this->worksheet->toArray(),
        ];
    }
}
