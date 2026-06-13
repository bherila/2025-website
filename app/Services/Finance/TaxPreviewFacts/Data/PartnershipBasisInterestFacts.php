<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class PartnershipBasisInterestFacts
{
    /** @var PartnershipBasisEventFact[] */
    public array $events;

    /** @var PartnershipBasisYearSummaryFact[] */
    public array $basisHistory;

    /**
     * @param  array<int, PartnershipBasisEventFact>  $events
     * @param  array<int, PartnershipBasisYearSummaryFact>  $basisHistory
     */
    public function __construct(
        public int $interestId,
        public string $partnershipName,
        public ?string $partnershipEin,
        public ?int $accountId,
        public int $taxYear,
        public float $beginningTaxBasisCapital,
        public float $endingTaxBasisCapital,
        public float $beginningBookCapital,
        public float $endingBookCapital,
        public string $insideBasisConfidence,
        public string $reviewStatus,
        public bool $isStale,
        public PartnershipBasisWorksheetFacts $worksheet,
        array $events,
        array $basisHistory,
        public ?float $carryoverMismatch,
        public bool $hasActionNeeded,
    ) {
        $this->events = $events;
        $this->basisHistory = $basisHistory;
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'interestId' => $this->interestId,
            'partnershipName' => $this->partnershipName,
            'partnershipEin' => $this->partnershipEin,
            'accountId' => $this->accountId,
            'taxYear' => $this->taxYear,
            'beginningTaxBasisCapital' => $this->beginningTaxBasisCapital,
            'endingTaxBasisCapital' => $this->endingTaxBasisCapital,
            'beginningBookCapital' => $this->beginningBookCapital,
            'endingBookCapital' => $this->endingBookCapital,
            'insideBasisConfidence' => $this->insideBasisConfidence,
            'reviewStatus' => $this->reviewStatus,
            'isStale' => $this->isStale,
            'worksheet' => $this->worksheet->toArray(),
            'events' => array_map(static fn (PartnershipBasisEventFact $event): array => $event->toArray(), $this->events),
            'basisHistory' => array_map(static fn (PartnershipBasisYearSummaryFact $summary): array => $summary->toArray(), $this->basisHistory),
            'carryoverMismatch' => $this->carryoverMismatch,
            'hasActionNeeded' => $this->hasActionNeeded,
        ];
    }
}
