<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class PartnershipBasisEventFact
{
    public function __construct(
        public int $id,
        public int $taxYear,
        public string $eventType,
        public string $basisSide,
        public float $amount,
        public string $sourceType,
        public ?int $taxDocumentId,
        public ?int $taxDocumentAccountId,
        public ?int $accountId,
        public ?string $k1Box,
        public ?string $k1Code,
        public ?string $sourcePath,
        public ?string $sourceLabel,
        public string $reviewStatus,
    ) {}

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'taxYear' => $this->taxYear,
            'eventType' => $this->eventType,
            'basisSide' => $this->basisSide,
            'amount' => $this->amount,
            'sourceType' => $this->sourceType,
            'taxDocumentId' => $this->taxDocumentId,
            'taxDocumentAccountId' => $this->taxDocumentAccountId,
            'accountId' => $this->accountId,
            'k1Box' => $this->k1Box,
            'k1Code' => $this->k1Code,
            'sourcePath' => $this->sourcePath,
            'sourceLabel' => $this->sourceLabel,
            'reviewStatus' => $this->reviewStatus,
        ];
    }
}
