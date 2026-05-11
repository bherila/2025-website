<?php

namespace App\Services\Finance\CapitalGains;

class LotMatcherResult
{
    /**
     * @param  list<LotMatchProposal>  $proposals
     * @param  list<int>  $linkIds
     * @param  array<string, int>  $counts
     */
    public function __construct(
        public readonly int $documentId,
        public readonly bool $dryRun,
        public readonly array $proposals,
        public readonly array $linkIds,
        public readonly array $counts,
    ) {}

    /**
     * @return array{documentId: int, dryRun: bool, counts: array<string, int>, linkIds: list<int>, proposals: list<array<string, mixed>>}
     */
    public function toArray(): array
    {
        return [
            'documentId' => $this->documentId,
            'dryRun' => $this->dryRun,
            'counts' => $this->counts,
            'linkIds' => $this->linkIds,
            'proposals' => array_map(
                static fn (LotMatchProposal $proposal): array => $proposal->toArray(),
                $this->proposals,
            ),
        ];
    }
}
