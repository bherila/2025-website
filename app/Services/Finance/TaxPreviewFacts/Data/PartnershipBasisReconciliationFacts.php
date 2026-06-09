<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

/**
 * Read-only reconciliation of a partnership account's transactions and statements against the
 * computed basis rollforward. Surfaces contribution/distribution candidates and comparison flags
 * (K-1 distributions vs account withdrawals, statement NAV vs book capital, statement cost basis vs
 * inside-basis proxy). Nothing here mutates outside basis without explicit user review.
 */
#[TypeScript]
readonly class PartnershipBasisReconciliationFacts
{
    /** @var PartnershipBasisReconciliationItem[] */
    public array $contributionCandidates;

    /** @var PartnershipBasisReconciliationItem[] */
    public array $distributionCandidates;

    /** @var PartnershipBasisReconciliationFlag[] */
    public array $flags;

    /**
     * @param  PartnershipBasisReconciliationItem[]  $contributionCandidates
     * @param  PartnershipBasisReconciliationItem[]  $distributionCandidates
     * @param  PartnershipBasisReconciliationFlag[]  $flags
     */
    public function __construct(
        public int $accountId,
        public int $year,
        array $contributionCandidates,
        array $distributionCandidates,
        array $flags,
        public bool $hasReconcilableData,
    ) {
        $this->contributionCandidates = $contributionCandidates;
        $this->distributionCandidates = $distributionCandidates;
        $this->flags = $flags;
    }

    public static function empty(int $accountId, int $year): self
    {
        return new self($accountId, $year, [], [], [], false);
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'accountId' => $this->accountId,
            'year' => $this->year,
            'contributionCandidates' => array_map(static fn (PartnershipBasisReconciliationItem $item): array => $item->toArray(), $this->contributionCandidates),
            'distributionCandidates' => array_map(static fn (PartnershipBasisReconciliationItem $item): array => $item->toArray(), $this->distributionCandidates),
            'flags' => array_map(static fn (PartnershipBasisReconciliationFlag $flag): array => $flag->toArray(), $this->flags),
            'hasReconcilableData' => $this->hasReconcilableData,
        ];
    }
}
