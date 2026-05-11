<?php

namespace App\Services\Finance\CapitalGains;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinLotReconciliationLink;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\LotMatcher;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Persists broker-to-account lot reconciliation links.
 *
 * Matcher runs are deterministic and preservation-aware: accepted_* and
 * ignored_* decisions survive normal re-runs, while mutable states are
 * recomputed from current broker/account lots. The link table is the source of
 * truth; fin_account_lots.reconciliation_status and superseded_by_lot_id are
 * denormalised caches refreshed from the latest link state for each lot.
 *
 * Split matching is intentionally conservative in this first pass: same-account,
 * same-symbol, same-date candidates must all sum to the target split lot.
 */
class LotMatcherService
{
    private const float MONEY_TOLERANCE = 0.02;

    private const float QUANTITY_TOLERANCE = 0.000001;

    private const array PRESERVED_STATES = [
        FinLotReconciliationLink::STATE_ACCEPTED_BROKER,
        FinLotReconciliationLink::STATE_ACCEPTED_ACCOUNT_OVERRIDE,
        FinLotReconciliationLink::STATE_IGNORED_DUPLICATE,
    ];

    private const array COUNT_STATES = [
        FinLotReconciliationLink::STATE_AUTO_MATCHED,
        FinLotReconciliationLink::STATE_NEEDS_REVIEW,
        FinLotReconciliationLink::STATE_ACCEPTED_BROKER,
        FinLotReconciliationLink::STATE_ACCEPTED_ACCOUNT_OVERRIDE,
        FinLotReconciliationLink::STATE_IGNORED_DUPLICATE,
        FinLotReconciliationLink::STATE_UNLINKED,
        FinLotReconciliationLink::STATE_BROKER_ONLY,
        FinLotReconciliationLink::STATE_ACCOUNT_ONLY,
    ];

    private const array MATCHED_LINK_STATES = [
        FinLotReconciliationLink::STATE_AUTO_MATCHED,
        FinLotReconciliationLink::STATE_NEEDS_REVIEW,
        FinLotReconciliationLink::STATE_ACCEPTED_BROKER,
        FinLotReconciliationLink::STATE_ACCEPTED_ACCOUNT_OVERRIDE,
    ];

    public function __construct(
        private readonly LotMatcher $lotMatcher,
    ) {}

    /**
     * @return list<LotMatchProposal>
     */
    public function proposeMatchesForDocument(int $taxDocumentId): array
    {
        return $this->proposeForDocument($this->taxDocument($taxDocumentId), [], []);
    }

    public function runMatcherForDocument(int $taxDocumentId, bool $preserveDecisions = true): LotMatcherResult
    {
        $taxDocument = $this->taxDocument($taxDocumentId);

        return DB::transaction(function () use ($taxDocument, $preserveDecisions): LotMatcherResult {
            $existingLinks = $this->linksForDocument((int) $taxDocument->id);
            $preservedLinks = $preserveDecisions
                ? $existingLinks->filter(fn (FinLotReconciliationLink $link): bool => in_array($link->state, self::PRESERVED_STATES, true))->values()
                : new EloquentCollection;
            $mutableLinks = $preserveDecisions
                ? $existingLinks->reject(fn (FinLotReconciliationLink $link): bool => in_array($link->state, self::PRESERVED_STATES, true))->values()
                : $existingLinks;

            if (! $preserveDecisions) {
                FinLotReconciliationLink::query()
                    ->where('tax_document_id', $taxDocument->id)
                    ->delete();
                $mutableLinks = new EloquentCollection;
                $preservedLinks = new EloquentCollection;
            }

            $proposals = $this->proposeForDocument(
                $taxDocument,
                $this->brokerLotIds($preservedLinks),
                $this->accountLotIds($preservedLinks),
            );

            $existingByKey = [];
            foreach ($mutableLinks as $link) {
                $existingByKey[$this->linkKey($link)] = $link;
            }

            $proposalKeys = [];
            $linkIds = [];
            $affectedLotIds = $this->linkLotIds($existingLinks);

            foreach ($proposals as $proposal) {
                $proposalKeys[] = $proposal->key();
                $link = $existingByKey[$proposal->key()] ?? new FinLotReconciliationLink;
                $link->fill([
                    'tax_document_id' => (int) $taxDocument->id,
                    'broker_lot_id' => $proposal->brokerLotId,
                    'account_lot_id' => $proposal->accountLotId,
                    'state' => $proposal->state,
                    'match_reason' => $proposal->matchReason(),
                    'accepted_by_user_id' => null,
                    'accepted_at' => null,
                ]);
                $link->save();

                $linkIds[] = (int) $link->id;
                $affectedLotIds = array_merge($affectedLotIds, $this->proposalLotIds($proposal));
            }

            foreach ($mutableLinks as $link) {
                if (! in_array($this->linkKey($link), $proposalKeys, true)) {
                    $link->delete();
                }
            }

            $this->refreshLotCaches((int) $taxDocument->id, $affectedLotIds);

            return new LotMatcherResult(
                taxDocumentId: (int) $taxDocument->id,
                dryRun: false,
                proposals: $proposals,
                linkIds: $linkIds,
                counts: $this->countsForDocument((int) $taxDocument->id),
            );
        });
    }

    public function previewMatcherForDocument(int $taxDocumentId, bool $preserveDecisions = true): LotMatcherResult
    {
        $taxDocument = $this->taxDocument($taxDocumentId);
        $existingLinks = $this->linksForDocument((int) $taxDocument->id);
        $preservedLinks = $preserveDecisions
            ? $existingLinks->filter(fn (FinLotReconciliationLink $link): bool => in_array($link->state, self::PRESERVED_STATES, true))->values()
            : new EloquentCollection;
        $proposals = $this->proposeForDocument(
            $taxDocument,
            $this->brokerLotIds($preservedLinks),
            $this->accountLotIds($preservedLinks),
        );

        return new LotMatcherResult(
            taxDocumentId: $taxDocumentId,
            dryRun: true,
            proposals: $proposals,
            linkIds: [],
            counts: $this->countsForProposals($proposals),
        );
    }

    public function acceptBrokerLink(int $linkId, int $userId): FinLotReconciliationLink
    {
        return $this->transitionLink(
            linkId: $linkId,
            state: FinLotReconciliationLink::STATE_ACCEPTED_BROKER,
            userId: $userId,
            allowedCurrentStates: self::MATCHED_LINK_STATES,
            requiresBothLots: true,
            stampAcceptedDecision: true,
        );
    }

    public function acceptAccountOverride(int $linkId, int $userId): FinLotReconciliationLink
    {
        return $this->transitionLink(
            linkId: $linkId,
            state: FinLotReconciliationLink::STATE_ACCEPTED_ACCOUNT_OVERRIDE,
            userId: $userId,
            allowedCurrentStates: self::MATCHED_LINK_STATES,
            requiresBothLots: true,
            stampAcceptedDecision: true,
        );
    }

    public function markDuplicate(int $linkId, int $userId): FinLotReconciliationLink
    {
        return $this->transitionLink(
            linkId: $linkId,
            state: FinLotReconciliationLink::STATE_IGNORED_DUPLICATE,
            userId: $userId,
            allowedCurrentStates: [
                FinLotReconciliationLink::STATE_BROKER_ONLY,
                FinLotReconciliationLink::STATE_ACCOUNT_ONLY,
            ],
            requiresSingleLot: true,
        );
    }

    public function unlinkLot(int $linkId, int $userId): FinLotReconciliationLink
    {
        return $this->transitionLink(
            linkId: $linkId,
            state: FinLotReconciliationLink::STATE_UNLINKED,
            userId: $userId,
        );
    }

    public function relinkLot(int $brokerLotId, int $accountLotId, int $userId): FinLotReconciliationLink
    {
        $brokerLot = FinAccountLot::query()->with('taxDocument')->findOrFail($brokerLotId);
        $accountLot = FinAccountLot::query()->findOrFail($accountLotId);
        $taxDocumentId = $brokerLot->tax_document_id;

        if ($taxDocumentId === null) {
            throw ValidationException::withMessages([
                'broker_lot_id' => 'Broker lot must belong to a tax document.',
            ]);
        }

        $this->validateRelinkTarget($brokerLot, $accountLot);

        return DB::transaction(function () use ($brokerLot, $accountLot, $taxDocumentId): FinLotReconciliationLink {
            $existingLinks = FinLotReconciliationLink::query()
                ->where('tax_document_id', $taxDocumentId)
                ->where(function ($query) use ($brokerLot, $accountLot): void {
                    $query->where('broker_lot_id', $brokerLot->lot_id)
                        ->orWhere('account_lot_id', $accountLot->lot_id);
                })
                ->get();

            $affectedLotIds = $this->linkLotIds($existingLinks);
            $displacedBrokerLotIds = [];
            $displacedAccountLotIds = [];

            foreach ($existingLinks as $existingLink) {
                if ($existingLink->broker_lot_id !== null && (int) $existingLink->broker_lot_id !== (int) $brokerLot->lot_id) {
                    $displacedBrokerLotIds[] = (int) $existingLink->broker_lot_id;
                }
                if ($existingLink->account_lot_id !== null && (int) $existingLink->account_lot_id !== (int) $accountLot->lot_id) {
                    $displacedAccountLotIds[] = (int) $existingLink->account_lot_id;
                }
                $existingLink->delete();
            }

            $deltas = $this->deltas($brokerLot, $accountLot);
            $link = FinLotReconciliationLink::create([
                'tax_document_id' => (int) $taxDocumentId,
                'broker_lot_id' => (int) $brokerLot->lot_id,
                'account_lot_id' => (int) $accountLot->lot_id,
                'state' => $this->stateForDeltas($deltas),
                'match_reason' => $this->matchReason('manual_relink', 1.0, $deltas, 'User manually relinked this broker lot to an account lot.'),
                'accepted_by_user_id' => null,
                'accepted_at' => null,
            ]);

            foreach (array_unique($displacedBrokerLotIds) as $displacedBrokerLotId) {
                FinLotReconciliationLink::create([
                    'tax_document_id' => (int) $taxDocumentId,
                    'broker_lot_id' => $displacedBrokerLotId,
                    'account_lot_id' => null,
                    'state' => FinLotReconciliationLink::STATE_BROKER_ONLY,
                    'match_reason' => $this->matchReason('manual_relink_displaced_broker', 0.0, $this->emptyDeltas(), 'This broker lot was displaced by a manual relink.'),
                ]);
            }

            foreach (array_unique($displacedAccountLotIds) as $displacedAccountLotId) {
                FinLotReconciliationLink::create([
                    'tax_document_id' => (int) $taxDocumentId,
                    'broker_lot_id' => null,
                    'account_lot_id' => $displacedAccountLotId,
                    'state' => FinLotReconciliationLink::STATE_ACCOUNT_ONLY,
                    'match_reason' => $this->matchReason('manual_relink_displaced_account', 0.0, $this->emptyDeltas(), 'This account lot was displaced by a manual relink.'),
                ]);
            }

            $affectedLotIds[] = (int) $brokerLot->lot_id;
            $affectedLotIds[] = (int) $accountLot->lot_id;
            $affectedLotIds = array_merge($affectedLotIds, $displacedBrokerLotIds, $displacedAccountLotIds);
            $this->refreshLotCaches((int) $taxDocumentId, $affectedLotIds);

            return $link->fresh(['brokerLot', 'accountLot']) ?? $link;
        });
    }

    /**
     * @param  int[]  $excludedBrokerLotIds
     * @param  int[]  $excludedAccountLotIds
     * @return list<LotMatchProposal>
     */
    private function proposeForDocument(FileForTaxDocument $taxDocument, array $excludedBrokerLotIds, array $excludedAccountLotIds): array
    {
        $brokerLots = $this->brokerLotsForDocument($taxDocument, $excludedBrokerLotIds);
        $accountLots = $this->accountLotsForDocument($taxDocument, $brokerLots, $excludedAccountLotIds);
        $proposals = [];
        $usedBrokerLotIds = [];
        $usedAccountLotIds = [];

        foreach ([
            'exactMatchProposal',
            'fuzzyAmountsMatchProposal',
            'dateDeltaMatchProposal',
        ] as $matcher) {
            foreach ($brokerLots as $brokerLot) {
                if (isset($usedBrokerLotIds[(int) $brokerLot->lot_id])) {
                    continue;
                }

                $proposal = $this->{$matcher}($brokerLot, $accountLots, $usedAccountLotIds);
                if ($proposal instanceof LotMatchProposal) {
                    $proposals[] = $proposal;
                    $usedBrokerLotIds[(int) $brokerLot->lot_id] = true;
                    if ($proposal->accountLotId !== null) {
                        $usedAccountLotIds[$proposal->accountLotId] = true;
                    }
                }
            }
        }

        foreach ($brokerLots as $brokerLot) {
            if (isset($usedBrokerLotIds[(int) $brokerLot->lot_id])) {
                continue;
            }

            $splitProposals = $this->splitBrokerMatchProposals($brokerLot, $accountLots, $usedAccountLotIds);
            if ($splitProposals !== []) {
                $proposals = array_merge($proposals, $splitProposals);
                $usedBrokerLotIds[(int) $brokerLot->lot_id] = true;
                foreach ($splitProposals as $proposal) {
                    if ($proposal->accountLotId !== null) {
                        $usedAccountLotIds[$proposal->accountLotId] = true;
                    }
                }
            }
        }

        foreach ($accountLots as $accountLot) {
            if (isset($usedAccountLotIds[(int) $accountLot->lot_id])) {
                continue;
            }

            $splitProposals = $this->splitAccountMatchProposals($accountLot, $brokerLots, $usedBrokerLotIds);
            if ($splitProposals !== []) {
                $proposals = array_merge($proposals, $splitProposals);
                $usedAccountLotIds[(int) $accountLot->lot_id] = true;
                foreach ($splitProposals as $proposal) {
                    if ($proposal->brokerLotId !== null) {
                        $usedBrokerLotIds[$proposal->brokerLotId] = true;
                    }
                }
            }
        }

        foreach ($brokerLots as $brokerLot) {
            if (! isset($usedBrokerLotIds[(int) $brokerLot->lot_id])) {
                $proposals[] = new LotMatchProposal(
                    brokerLotId: (int) $brokerLot->lot_id,
                    accountLotId: null,
                    state: FinLotReconciliationLink::STATE_BROKER_ONLY,
                    reasonCode: 'broker_only',
                    score: 0.0,
                    deltas: $this->emptyDeltas(),
                    notes: 'No account-derived lot matched this broker-reported lot.',
                );
            }
        }

        foreach ($accountLots as $accountLot) {
            if (! isset($usedAccountLotIds[(int) $accountLot->lot_id])) {
                $proposals[] = new LotMatchProposal(
                    brokerLotId: null,
                    accountLotId: (int) $accountLot->lot_id,
                    state: FinLotReconciliationLink::STATE_ACCOUNT_ONLY,
                    reasonCode: 'account_only',
                    score: 0.0,
                    deltas: $this->emptyDeltas(),
                    notes: 'No broker-reported lot matched this account-derived lot.',
                );
            }
        }

        return $proposals;
    }

    /**
     * @param  EloquentCollection<int, FinAccountLot>  $accountLots
     * @param  array<int, true>  $usedAccountLotIds
     */
    private function exactMatchProposal(FinAccountLot $brokerLot, EloquentCollection $accountLots, array $usedAccountLotIds): ?LotMatchProposal
    {
        $candidates = $accountLots
            ->filter(fn (FinAccountLot $accountLot): bool => ! isset($usedAccountLotIds[(int) $accountLot->lot_id])
                && $this->sameAccountSymbolQuantity($brokerLot, $accountLot)
                && $this->sameTreatment($brokerLot, $accountLot)
                && $this->sameSaleDate($brokerLot, $accountLot)
                && $this->moneyClose($brokerLot->proceeds, $accountLot->proceeds))
            ->sortBy('lot_id')
            ->values();

        return $candidates->count() === 1
            ? $this->matchedProposal($brokerLot, $candidates->first(), 'exact', 1.0)
            : null;
    }

    /**
     * @param  EloquentCollection<int, FinAccountLot>  $accountLots
     * @param  array<int, true>  $usedAccountLotIds
     */
    private function fuzzyAmountsMatchProposal(FinAccountLot $brokerLot, EloquentCollection $accountLots, array $usedAccountLotIds): ?LotMatchProposal
    {
        $candidates = $accountLots
            ->filter(fn (FinAccountLot $accountLot): bool => ! isset($usedAccountLotIds[(int) $accountLot->lot_id])
                && $this->sameAccountSymbolQuantity($brokerLot, $accountLot)
                && $this->sameTreatment($brokerLot, $accountLot)
                && $this->sameSaleDate($brokerLot, $accountLot)
                && $this->moneyClose($brokerLot->proceeds, $accountLot->proceeds)
                && $this->moneyClose($brokerLot->cost_basis, $accountLot->cost_basis))
            ->sortBy('lot_id')
            ->values();

        return $candidates->count() === 1
            ? $this->matchedProposal($brokerLot, $candidates->first(), 'fuzzy_amounts', 0.95)
            : null;
    }

    /**
     * @param  EloquentCollection<int, FinAccountLot>  $accountLots
     * @param  array<int, true>  $usedAccountLotIds
     */
    private function dateDeltaMatchProposal(FinAccountLot $brokerLot, EloquentCollection $accountLots, array $usedAccountLotIds): ?LotMatchProposal
    {
        $candidates = $accountLots
            ->filter(fn (FinAccountLot $accountLot): bool => ! isset($usedAccountLotIds[(int) $accountLot->lot_id])
                && $this->sameAccountSymbolQuantity($brokerLot, $accountLot)
                && $this->sameTreatment($brokerLot, $accountLot)
                && $this->tradingDayDelta($brokerLot, $accountLot) !== null
                && abs((int) $this->tradingDayDelta($brokerLot, $accountLot)) <= 1
                && ! $this->sameSaleDate($brokerLot, $accountLot)
                && $this->moneyClose($brokerLot->proceeds, $accountLot->proceeds)
                && $this->moneyClose($brokerLot->cost_basis, $accountLot->cost_basis))
            ->sortBy('lot_id')
            ->values();

        return $candidates->count() === 1
            ? $this->matchedProposal($brokerLot, $candidates->first(), 'date_delta', 0.9)
            : null;
    }

    /**
     * @param  EloquentCollection<int, FinAccountLot>  $accountLots
     * @param  array<int, true>  $usedAccountLotIds
     * @return list<LotMatchProposal>
     */
    private function splitBrokerMatchProposals(FinAccountLot $brokerLot, EloquentCollection $accountLots, array $usedAccountLotIds): array
    {
        $candidates = $accountLots
            ->filter(fn (FinAccountLot $accountLot): bool => ! isset($usedAccountLotIds[(int) $accountLot->lot_id])
                && $this->sameAccountSymbol($brokerLot, $accountLot)
                && $this->sameTreatment($brokerLot, $accountLot)
                && $this->sameSaleDate($brokerLot, $accountLot))
            ->sortBy('lot_id')
            ->values();

        if ($candidates->count() < 2 || ! $this->sumMatches($brokerLot, $candidates)) {
            return [];
        }

        return $candidates
            ->map(fn (FinAccountLot $accountLot): LotMatchProposal => $this->matchedProposal($brokerLot, $accountLot, 'split_broker', 0.85, $candidates->count(), FinLotReconciliationLink::STATE_AUTO_MATCHED))
            ->values()
            ->all();
    }

    /**
     * @param  EloquentCollection<int, FinAccountLot>  $brokerLots
     * @param  array<int, true>  $usedBrokerLotIds
     * @return list<LotMatchProposal>
     */
    private function splitAccountMatchProposals(FinAccountLot $accountLot, EloquentCollection $brokerLots, array $usedBrokerLotIds): array
    {
        $candidates = $brokerLots
            ->filter(fn (FinAccountLot $brokerLot): bool => ! isset($usedBrokerLotIds[(int) $brokerLot->lot_id])
                && $this->sameAccountSymbol($brokerLot, $accountLot)
                && $this->sameTreatment($brokerLot, $accountLot)
                && $this->sameSaleDate($brokerLot, $accountLot))
            ->sortBy('lot_id')
            ->values();

        if ($candidates->count() < 2 || ! $this->sumMatches($accountLot, $candidates)) {
            return [];
        }

        return $candidates
            ->map(fn (FinAccountLot $brokerLot): LotMatchProposal => $this->matchedProposal($brokerLot, $accountLot, 'split_account', 0.85, $candidates->count(), FinLotReconciliationLink::STATE_AUTO_MATCHED))
            ->values()
            ->all();
    }

    private function matchedProposal(FinAccountLot $brokerLot, FinAccountLot $accountLot, string $reasonCode, float $score, int $splitCount = 1, ?string $state = null): LotMatchProposal
    {
        $deltas = $this->deltas($brokerLot, $accountLot);

        return new LotMatchProposal(
            brokerLotId: (int) $brokerLot->lot_id,
            accountLotId: (int) $accountLot->lot_id,
            state: $state ?? $this->stateForDeltas($deltas),
            reasonCode: $reasonCode,
            score: $score,
            deltas: $deltas,
            notes: $splitCount > 1 ? "Matched as part of a {$splitCount}-lot split." : null,
        );
    }

    /**
     * @param  array{proceeds: float|null, basis: float|null, wash: float|null, qty: float|null, date_days: int|null}  $deltas
     */
    private function stateForDeltas(array $deltas): string
    {
        foreach (['proceeds', 'basis', 'wash', 'qty'] as $key) {
            $tolerance = $key === 'qty' ? self::QUANTITY_TOLERANCE : self::MONEY_TOLERANCE;
            if ($deltas[$key] !== null && abs((float) $deltas[$key]) > $tolerance) {
                return FinLotReconciliationLink::STATE_NEEDS_REVIEW;
            }
        }

        return FinLotReconciliationLink::STATE_AUTO_MATCHED;
    }

    /**
     * @param  EloquentCollection<int, FinAccountLot>  $lots
     */
    private function sumMatches(FinAccountLot $targetLot, EloquentCollection $lots): bool
    {
        return $this->numericClose($this->sumLots($lots, 'quantity'), $this->number($targetLot->quantity), self::QUANTITY_TOLERANCE)
            && $this->numericClose($this->sumLots($lots, 'proceeds'), $this->number($targetLot->proceeds), self::MONEY_TOLERANCE)
            && $this->numericClose($this->sumLots($lots, 'cost_basis'), $this->number($targetLot->cost_basis), self::MONEY_TOLERANCE);
    }

    /**
     * @param  EloquentCollection<int, FinAccountLot>  $lots
     */
    private function sumLots(EloquentCollection $lots, string $field): float
    {
        return (float) $lots->sum(fn (FinAccountLot $lot): float => $this->number($lot->getAttribute($field)));
    }

    /**
     * @param  string[]  $allowedCurrentStates
     */
    private function transitionLink(
        int $linkId,
        string $state,
        int $userId,
        array $allowedCurrentStates = [],
        bool $requiresBothLots = false,
        bool $requiresSingleLot = false,
        bool $stampAcceptedDecision = false,
    ): FinLotReconciliationLink {
        return DB::transaction(function () use ($linkId, $state, $userId, $allowedCurrentStates, $requiresBothLots, $requiresSingleLot, $stampAcceptedDecision): FinLotReconciliationLink {
            $link = FinLotReconciliationLink::query()->findOrFail($linkId);
            $this->validateTransition($link, $allowedCurrentStates, $requiresBothLots, $requiresSingleLot);

            $acceptedAt = $stampAcceptedDecision ? now() : null;
            $link->update([
                'state' => $state,
                'accepted_by_user_id' => $stampAcceptedDecision ? $userId : null,
                'accepted_at' => $acceptedAt,
            ]);

            if ($link->tax_document_id === null) {
                throw ValidationException::withMessages([
                    'link' => 'Reconciliation link must belong to a tax document.',
                ]);
            }

            $this->refreshLotCaches((int) $link->tax_document_id, $this->linkLotIds(new EloquentCollection([$link])));

            return $link->fresh(['brokerLot', 'accountLot']) ?? $link;
        });
    }

    private function taxDocument(int $taxDocumentId): FileForTaxDocument
    {
        /** @var FileForTaxDocument $taxDocument */
        $taxDocument = FileForTaxDocument::query()
            ->with(['accountLinks.account'])
            ->findOrFail($taxDocumentId);

        return $taxDocument;
    }

    /**
     * @param  int[]  $excludedBrokerLotIds
     * @return EloquentCollection<int, FinAccountLot>
     */
    private function brokerLotsForDocument(FileForTaxDocument $taxDocument, array $excludedBrokerLotIds): EloquentCollection
    {
        return FinAccountLot::query()
            ->where('tax_document_id', $taxDocument->id)
            ->when($excludedBrokerLotIds !== [], fn ($query) => $query->whereNotIn('lot_id', $excludedBrokerLotIds))
            ->where(function ($query): void {
                $query->whereIn('source', [
                    FinAccountLot::SOURCE_BROKER_1099B,
                    FinAccountLot::SOURCE_SYNTHETIC_ADJUSTMENT,
                ])->orWhereIn('lot_source', [
                    FinAccountLot::SOURCE_1099B,
                    FinAccountLot::SOURCE_1099B_UNDERSCORE,
                    'import_1099b',
                ]);
            })
            ->orderBy('acct_id')
            ->orderBy('symbol')
            ->orderBy('sale_date')
            ->orderBy('lot_id')
            ->get();
    }

    /**
     * @param  EloquentCollection<int, FinAccountLot>  $brokerLots
     * @param  int[]  $excludedAccountLotIds
     * @return EloquentCollection<int, FinAccountLot>
     */
    private function accountLotsForDocument(FileForTaxDocument $taxDocument, EloquentCollection $brokerLots, array $excludedAccountLotIds): EloquentCollection
    {
        $accountIds = $brokerLots
            ->pluck('acct_id')
            ->merge($this->taxDocumentAccountIds($taxDocument))
            ->filter()
            ->map(static fn (int|string $accountId): int => (int) $accountId)
            ->unique()
            ->values()
            ->all();

        if ($accountIds === []) {
            return new EloquentCollection;
        }

        return FinAccountLot::query()
            ->whereIn('acct_id', $accountIds)
            ->whereNull('tax_document_id')
            ->whereBetween('sale_date', $this->accountCandidateDateWindow((int) $taxDocument->tax_year))
            ->when($excludedAccountLotIds !== [], fn ($query) => $query->whereNotIn('lot_id', $excludedAccountLotIds))
            ->where(function ($query): void {
                $query->whereNull('source')
                    ->orWhereNotIn('source', [
                        FinAccountLot::SOURCE_BROKER_1099B,
                        FinAccountLot::SOURCE_SYNTHETIC_ADJUSTMENT,
                    ]);
            })
            ->orderBy('acct_id')
            ->orderBy('symbol')
            ->orderBy('sale_date')
            ->orderBy('lot_id')
            ->get();
    }

    /**
     * @return int[]
     */
    private function taxDocumentAccountIds(FileForTaxDocument $taxDocument): array
    {
        $accountIds = [];
        foreach ($taxDocument->accountLinks as $link) {
            if ($link instanceof TaxDocumentAccount && $link->account_id !== null) {
                $accountIds[] = (int) $link->account_id;
            }
        }

        return $accountIds;
    }

    /**
     * @return EloquentCollection<int, FinLotReconciliationLink>
     */
    private function linksForDocument(int $taxDocumentId): EloquentCollection
    {
        return FinLotReconciliationLink::query()
            ->where('tax_document_id', $taxDocumentId)
            ->orderBy('id')
            ->get();
    }

    /**
     * @param  EloquentCollection<int, FinLotReconciliationLink>  $links
     * @return int[]
     */
    private function brokerLotIds(EloquentCollection $links): array
    {
        return $links
            ->pluck('broker_lot_id')
            ->filter()
            ->map(static fn (int|string $lotId): int => (int) $lotId)
            ->unique()
            ->values()
            ->all();
    }

    /**
     * @param  EloquentCollection<int, FinLotReconciliationLink>  $links
     * @return int[]
     */
    private function accountLotIds(EloquentCollection $links): array
    {
        return $links
            ->pluck('account_lot_id')
            ->filter()
            ->map(static fn (int|string $lotId): int => (int) $lotId)
            ->unique()
            ->values()
            ->all();
    }

    /**
     * @param  EloquentCollection<int, FinLotReconciliationLink>  $links
     * @return int[]
     */
    private function linkLotIds(EloquentCollection $links): array
    {
        return array_values(array_unique(array_merge($this->brokerLotIds($links), $this->accountLotIds($links))));
    }

    /**
     * @return int[]
     */
    private function proposalLotIds(LotMatchProposal $proposal): array
    {
        return array_values(array_filter([
            $proposal->brokerLotId,
            $proposal->accountLotId,
        ], static fn (?int $lotId): bool => $lotId !== null));
    }

    private function linkKey(FinLotReconciliationLink $link): string
    {
        return ($link->broker_lot_id ?? 'null').'|'.($link->account_lot_id ?? 'null');
    }

    /**
     * @param  int[]  $lotIds
     */
    private function refreshLotCaches(int $taxDocumentId, array $lotIds): void
    {
        $lotIds = array_values(array_unique(array_filter($lotIds)));
        if ($lotIds === []) {
            return;
        }

        $lotIdLookup = array_fill_keys($lotIds, true);
        $latestLinksByLotId = [];
        $links = FinLotReconciliationLink::query()
            ->where('tax_document_id', $taxDocumentId)
            ->where(function ($query) use ($lotIds): void {
                $query->whereIn('broker_lot_id', $lotIds)
                    ->orWhereIn('account_lot_id', $lotIds);
            })
            ->orderByDesc('id')
            ->get();

        foreach ($links as $link) {
            foreach ([$link->broker_lot_id, $link->account_lot_id] as $linkedLotId) {
                if ($linkedLotId === null) {
                    continue;
                }

                $linkedLotId = (int) $linkedLotId;
                if (isset($lotIdLookup[$linkedLotId]) && ! isset($latestLinksByLotId[$linkedLotId])) {
                    $latestLinksByLotId[$linkedLotId] = $link;
                }
            }
        }

        $existingLotIds = FinAccountLot::query()
            ->whereKey($lotIds)
            ->pluck('lot_id')
            ->map(static fn (int|string $lotId): int => (int) $lotId)
            ->all();
        $statusCases = [];
        $statusBindings = [];
        $supersededCases = [];
        $supersededBindings = [];

        foreach ($existingLotIds as $lotId) {
            $latestLink = $latestLinksByLotId[$lotId] ?? null;
            $statusCases[] = 'WHEN ? THEN ?';
            $statusBindings[] = $lotId;
            $statusBindings[] = $latestLink instanceof FinLotReconciliationLink ? $latestLink->state : null;
            $supersededByLotId = null;

            if (
                $latestLink instanceof FinLotReconciliationLink
                && $latestLink->state === FinLotReconciliationLink::STATE_ACCEPTED_ACCOUNT_OVERRIDE
                && $latestLink->broker_lot_id !== null
                && (int) $latestLink->broker_lot_id === (int) $lotId
            ) {
                $supersededByLotId = $latestLink->account_lot_id !== null ? (int) $latestLink->account_lot_id : null;
            }

            $supersededCases[] = 'WHEN ? THEN ?';
            $supersededBindings[] = $lotId;
            $supersededBindings[] = $supersededByLotId;
        }

        if ($existingLotIds !== []) {
            $wherePlaceholders = implode(', ', array_fill(0, count($existingLotIds), '?'));
            DB::update(
                'UPDATE fin_account_lots
                    SET reconciliation_status = CASE lot_id '.implode(' ', $statusCases).' END,
                        superseded_by_lot_id = CASE lot_id '.implode(' ', $supersededCases).' END,
                        updated_at = ?
                    WHERE lot_id IN ('.$wherePlaceholders.')',
                array_merge($statusBindings, $supersededBindings, [now()], $existingLotIds),
            );
        }
    }

    /**
     * @return array<string, int>
     */
    private function countsForDocument(int $taxDocumentId): array
    {
        $counts = array_fill_keys(self::COUNT_STATES, 0);
        $rows = FinLotReconciliationLink::query()
            ->where('tax_document_id', $taxDocumentId)
            ->selectRaw('state, COUNT(*) as aggregate')
            ->groupBy('state')
            ->pluck('aggregate', 'state')
            ->all();

        foreach ($rows as $state => $count) {
            $counts[(string) $state] = (int) $count;
        }

        return $counts;
    }

    /**
     * @param  list<LotMatchProposal>  $proposals
     * @return array<string, int>
     */
    private function countsForProposals(array $proposals): array
    {
        $counts = array_fill_keys(self::COUNT_STATES, 0);
        foreach ($proposals as $proposal) {
            $counts[$proposal->state] = ($counts[$proposal->state] ?? 0) + 1;
        }

        return $counts;
    }

    private function sameAccountSymbolQuantity(FinAccountLot $brokerLot, FinAccountLot $accountLot): bool
    {
        return $this->sameAccountSymbol($brokerLot, $accountLot)
            && $this->numericClose($this->number($brokerLot->quantity), $this->number($accountLot->quantity), self::QUANTITY_TOLERANCE);
    }

    private function sameAccountSymbol(FinAccountLot $brokerLot, FinAccountLot $accountLot): bool
    {
        return (int) $brokerLot->acct_id === (int) $accountLot->acct_id
            && $this->symbol($brokerLot) === $this->symbol($accountLot);
    }

    private function sameSaleDate(FinAccountLot $brokerLot, FinAccountLot $accountLot): bool
    {
        return $this->lotMatcher->dateValue($brokerLot->sale_date) === $this->lotMatcher->dateValue($accountLot->sale_date);
    }

    private function moneyClose(mixed $left, mixed $right): bool
    {
        return $this->numericClose($this->number($left), $this->number($right), self::MONEY_TOLERANCE);
    }

    private function numericClose(float $left, float $right, float $tolerance): bool
    {
        return abs($left - $right) <= $tolerance;
    }

    private function symbol(FinAccountLot $lot): string
    {
        return strtoupper(trim((string) $lot->symbol));
    }

    private function sameTreatment(FinAccountLot $brokerLot, FinAccountLot $accountLot): bool
    {
        return $this->form8949Box($brokerLot) === $this->form8949Box($accountLot)
            && $this->termValue($brokerLot) === $this->termValue($accountLot);
    }

    private function form8949Box(FinAccountLot $lot): ?string
    {
        $box = strtoupper(trim((string) $lot->form_8949_box));

        return $box === '' ? null : $box;
    }

    private function termValue(FinAccountLot $lot): ?bool
    {
        return $lot->is_short_term === null ? null : (bool) $lot->is_short_term;
    }

    /**
     * @return array{string, string}
     */
    private function accountCandidateDateWindow(int $taxYear): array
    {
        $start = (new \DateTimeImmutable("{$taxYear}-01-01"))->modify('-5 days')->format('Y-m-d');
        $end = (new \DateTimeImmutable("{$taxYear}-12-31"))->modify('+5 days')->format('Y-m-d');

        return [$start, $end];
    }

    private function number(mixed $value): float
    {
        return $this->lotMatcher->numericValue($value);
    }

    /**
     * @return array{proceeds: float|null, basis: float|null, wash: float|null, qty: float|null, date_days: int|null}
     */
    private function deltas(FinAccountLot $brokerLot, FinAccountLot $accountLot): array
    {
        return [
            'proceeds' => round($this->number($accountLot->proceeds) - $this->number($brokerLot->proceeds), 4),
            'basis' => round($this->number($accountLot->cost_basis) - $this->number($brokerLot->cost_basis), 4),
            'wash' => round($this->number($accountLot->wash_sale_disallowed) - $this->number($brokerLot->wash_sale_disallowed), 4),
            'qty' => round($this->number($accountLot->quantity) - $this->number($brokerLot->quantity), 8),
            'date_days' => $this->calendarDayDelta($brokerLot, $accountLot),
        ];
    }

    /**
     * @return array{proceeds: float|null, basis: float|null, wash: float|null, qty: float|null, date_days: int|null}
     */
    private function emptyDeltas(): array
    {
        return [
            'proceeds' => null,
            'basis' => null,
            'wash' => null,
            'qty' => null,
            'date_days' => null,
        ];
    }

    /**
     * @param  array{proceeds: float|null, basis: float|null, wash: float|null, qty: float|null, date_days: int|null}  $deltas
     * @return array{reason_code: string, score: float, deltas: array{proceeds: float|null, basis: float|null, wash: float|null, qty: float|null, date_days: int|null}, notes: string|null}
     */
    private function matchReason(string $reasonCode, float $score, array $deltas, ?string $notes = null): array
    {
        return [
            'reason_code' => $reasonCode,
            'score' => $score,
            'deltas' => $deltas,
            'notes' => $notes,
        ];
    }

    private function calendarDayDelta(FinAccountLot $brokerLot, FinAccountLot $accountLot): ?int
    {
        $brokerDate = $this->lotMatcher->dateValue($brokerLot->sale_date);
        $accountDate = $this->lotMatcher->dateValue($accountLot->sale_date);
        if ($brokerDate === null || $accountDate === null) {
            return null;
        }

        return (int) (new \DateTimeImmutable($brokerDate))->diff(new \DateTimeImmutable($accountDate))->format('%r%a');
    }

    private function tradingDayDelta(FinAccountLot $brokerLot, FinAccountLot $accountLot): ?int
    {
        $brokerDate = $this->lotMatcher->dateValue($brokerLot->sale_date);
        $accountDate = $this->lotMatcher->dateValue($accountLot->sale_date);
        if ($brokerDate === null || $accountDate === null || $brokerDate === $accountDate) {
            return $brokerDate === $accountDate ? 0 : null;
        }

        $start = new \DateTimeImmutable($brokerDate);
        $target = new \DateTimeImmutable($accountDate);
        $direction = $target > $start ? 1 : -1;
        $cursor = $start;
        $tradingDays = 0;

        while ($cursor->format('Y-m-d') !== $target->format('Y-m-d')) {
            $cursor = $cursor->modify(($direction > 0 ? '+' : '-').'1 day');
            if ($this->isWeekday($cursor)) {
                $tradingDays += $direction;
            }

            if (abs($tradingDays) > 1) {
                return $tradingDays;
            }
        }

        return $tradingDays;
    }

    private function isWeekday(\DateTimeImmutable $date): bool
    {
        return (int) $date->format('N') <= 5;
    }

    /**
     * @param  string[]  $allowedCurrentStates
     */
    private function validateTransition(
        FinLotReconciliationLink $link,
        array $allowedCurrentStates,
        bool $requiresBothLots,
        bool $requiresSingleLot,
    ): void {
        if ($allowedCurrentStates !== [] && ! in_array($link->state, $allowedCurrentStates, true)) {
            throw ValidationException::withMessages([
                'state' => "Cannot transition a {$link->state} reconciliation link to the requested state.",
            ]);
        }

        $hasBrokerLot = $link->broker_lot_id !== null;
        $hasAccountLot = $link->account_lot_id !== null;

        if ($requiresBothLots && (! $hasBrokerLot || ! $hasAccountLot)) {
            throw ValidationException::withMessages([
                'link' => 'This transition requires both a broker lot and an account lot.',
            ]);
        }

        if ($requiresSingleLot && ($hasBrokerLot === $hasAccountLot)) {
            throw ValidationException::withMessages([
                'link' => 'This transition requires exactly one linked lot.',
            ]);
        }
    }

    private function validateRelinkTarget(FinAccountLot $brokerLot, FinAccountLot $accountLot): void
    {
        if ((int) $brokerLot->acct_id !== (int) $accountLot->acct_id) {
            throw ValidationException::withMessages([
                'account_lot_id' => 'Account lot must belong to the same account as the broker lot.',
            ]);
        }

        if (! $this->isAccountDerivedRelinkTarget($accountLot)) {
            throw ValidationException::withMessages([
                'account_lot_id' => 'Relink target must be an account-derived lot, not a broker-reported lot.',
            ]);
        }
    }

    private function isAccountDerivedRelinkTarget(FinAccountLot $lot): bool
    {
        if ($lot->tax_document_id !== null) {
            return false;
        }

        if (in_array($lot->source, [FinAccountLot::SOURCE_BROKER_1099B, FinAccountLot::SOURCE_SYNTHETIC_ADJUSTMENT], true)) {
            return false;
        }

        return ! in_array($lot->lot_source, [
            FinAccountLot::SOURCE_1099B,
            FinAccountLot::SOURCE_1099B_UNDERSCORE,
            'import_1099b',
        ], true);
    }
}
