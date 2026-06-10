<?php

namespace App\Services\Finance;

use App\Enums\Finance\PartnershipBasisEventType;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinPartnershipBasisEvent;
use App\Models\FinanceTool\FinPartnershipBasisYear;
use App\Models\FinanceTool\FinPartnershipInterest;
use App\Models\FinanceTool\TaxDocumentAccount;
use Carbon\CarbonImmutable;
use DateTimeInterface;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class PartnershipBasisService
{
    public const HOLDING_PERIOD_LONG = 'long';

    public const HOLDING_PERIOD_SHORT = 'short';

    public const HOLDING_PERIOD_INDETERMINATE = 'indeterminate';

    public function __construct(private readonly PartnershipBasisReconciliationService $reconciliationService) {}

    /**
     * Flat (non-coded) K-1 boxes whose distributive-share amount adjusts outside
     * basis as ordinary income/loss. Guaranteed payments (4/4a/4b/4c), qualified-
     * dividend and capital-gain component boxes (6b, 9b, 9c) are deliberately
     * excluded — they are either not distributive shares or are components already
     * counted in their parent box.
     *
     * @var string[]
     */
    private const K1_INCOME_BOXES = ['1', '2', '3', '5', '6a', '7', '8', '9a', '10'];

    private const SUSPENDED_LOSS_RELEASE_SOURCE_PATH = 'carryforward.suspended_loss_release';

    /**
     * @param  iterable<FileForTaxDocument>|null  $documents
     * @return Collection<int, FinPartnershipBasisYear>
     */
    public function recomputeForUserYear(int $userId, int $year, ?iterable $documents = null): Collection
    {
        if ($documents !== null) {
            foreach ($documents as $document) {
                $this->syncK1Document($document, $userId, $year);
            }
        } else {
            FileForTaxDocument::query()
                ->with(['accountLinks.account'])
                ->where('user_id', $userId)
                ->where(function ($query) use ($year): void {
                    $query->where(function ($documents) use ($year): void {
                        $documents->where('tax_year', $year)
                            ->where('form_type', 'k1');
                    })->orWhereHas('accountLinks', function ($links) use ($year): void {
                        $links->where('tax_year', $year)
                            ->where('form_type', 'k1');
                    });
                })
                ->get()
                ->each(fn (FileForTaxDocument $document): ?FinPartnershipInterest => $this->syncK1Document($document, $userId, $year));
        }

        /** @var EloquentCollection<int, FinPartnershipInterest> $interests */
        $interests = FinPartnershipInterest::query()
            ->where('user_id', $userId)
            ->where(function ($query) use ($year): void {
                $query->whereHas('basisEvents', fn ($events) => $events->where('tax_year', $year))
                    ->orWhereHas('basisYears', fn ($basisYears) => $basisYears->where('tax_year', $year))
                    ->orWhereHas('basisYears', fn ($basisYears) => $basisYears->where('tax_year', $year - 1));
            })
            ->with(['basisEvents' => fn ($events) => $events->where('tax_year', $year)->orderBy('event_order')->orderBy('id')])
            ->get();

        return $interests->map(function (FinPartnershipInterest $interest) use ($year): FinPartnershipBasisYear {
            $this->recomputeInterestYearRange($interest, $year, $year);

            /** @var FinPartnershipBasisYear $basisYear */
            $basisYear = FinPartnershipBasisYear::query()
                ->where('user_id', $interest->user_id)
                ->where('partnership_interest_id', $interest->id)
                ->where('tax_year', $year)
                ->firstOrFail();

            return $basisYear;
        });
    }

    /**
     * Read-only fetch of the already-synced basis rollforwards for a user/year, with their
     * interest and year-scoped events eager-loaded. Used by read paths (Tax Preview facts)
     * that must never mutate basis state.
     *
     * @return EloquentCollection<int, FinPartnershipBasisYear>
     */
    public function basisYearsForUserYear(int $userId, int $year): EloquentCollection
    {
        return FinPartnershipBasisYear::query()
            ->with(['partnershipInterest', 'partnershipInterest.basisEvents' => fn ($events) => $events->where('tax_year', $year)->orderBy('event_order')->orderBy('id')])
            ->where('user_id', $userId)
            ->where('tax_year', $year)
            ->orderBy('partnership_interest_id')
            ->get();
    }

    public function recomputeInterestYear(FinPartnershipInterest $interest, int $year): FinPartnershipBasisYear
    {
        $existing = FinPartnershipBasisYear::query()
            ->where('user_id', $interest->user_id)
            ->where('partnership_interest_id', $interest->id)
            ->where('tax_year', $year)
            ->first();

        if ($existing instanceof FinPartnershipBasisYear && $existing->locked_at !== null) {
            return $existing;
        }

        $prior = FinPartnershipBasisYear::query()
            ->where('user_id', $interest->user_id)
            ->where('partnership_interest_id', $interest->id)
            ->where('tax_year', $year - 1)
            ->first();

        if ($prior instanceof FinPartnershipBasisYear) {
            // updateOrCreate (not firstOrCreate) so the carryforward amount is refreshed
            // whenever the prior year's ending basis changes after a downstream recompute.
            $this->upsertEvent($interest, [
                'tax_year' => $year,
                'source_type' => 'carryforward',
                'source_path' => 'carryforward.prior_year_rollforward',
            ], [
                'event_order' => -100,
                'basis_side' => 'both',
                'event_type' => PartnershipBasisEventType::PriorYearRollforward->value,
                'amount_cents' => $prior->ending_outside_basis_cents,
                'source_label' => sprintf('%d beginning outside basis from %d ending outside basis', $year, $year - 1),
                'review_status' => in_array($prior->review_status, ['reviewed', 'locked'], true) ? 'reviewed' : 'needs_review',
                'metadata' => ['prior_basis_year_id' => $prior->id],
            ]);
        }

        $events = $this->basisEventsForInterestYear($interest, $year);

        $beginningOutside = $this->beginningOutsideBasisCents($events, $prior);
        $beginningTaxCapital = $this->capitalBeginningCents($events, 'initial_tax_basis_capital', $prior instanceof FinPartnershipBasisYear ? (int) $prior->ending_tax_basis_capital_cents : 0);
        $beginningBookCapital = $this->capitalBeginningCents($events, 'initial_capital_account_value', $prior instanceof FinPartnershipBasisYear ? (int) $prior->ending_book_capital_cents : 0);
        $beginningInside = $this->capitalBeginningNullableCents($events, 'initial_tax_basis_capital', $prior instanceof FinPartnershipBasisYear ? (int) $prior->ending_inside_basis_cents : null);
        $liabilities = $this->liabilityTotals($events);

        $totals = $this->emptyYearTotals();
        $availableOutsideBasis = $beginningOutside;
        $distributionGain = 0;
        $suspendedLoss = $prior instanceof FinPartnershipBasisYear ? max(0, (int) $prior->suspended_loss_carryforward_cents) : 0;

        foreach ($events as $event) {
            $type = PartnershipBasisEventType::tryFrom((string) $event->event_type);
            if ($type === null || in_array($type, [PartnershipBasisEventType::BeginningBasis, PartnershipBasisEventType::PriorYearRollforward], true)) {
                continue;
            }

            $amount = abs((int) $event->amount_cents);
            $column = $type->summaryColumn();
            if ($column !== null) {
                $totals[$column] += $amount;
            }

            switch ($type->basisEffect()) {
                case PartnershipBasisEventType::BASIS_EFFECT_INCREASE:
                    $availableOutsideBasis += $amount;
                    break;
                case PartnershipBasisEventType::BASIS_EFFECT_DECREASE_GAIN:
                    // Cash / marketable-securities / deemed distributions: excess over basis is gain.
                    $reduction = min($availableOutsideBasis, $amount);
                    $availableOutsideBasis -= $reduction;
                    $distributionGain += $amount - $reduction;
                    break;
                case PartnershipBasisEventType::BASIS_EFFECT_DECREASE_REALLOCATE:
                    // Property distributions reduce basis (floored at zero) but do not create gain.
                    $availableOutsideBasis -= min($availableOutsideBasis, $amount);
                    break;
                case PartnershipBasisEventType::BASIS_EFFECT_DECREASE_SUSPEND:
                    // Losses/deductions limited to basis; excess is suspended and carried forward.
                    $reduction = min($availableOutsideBasis, $amount);
                    $availableOutsideBasis -= $reduction;
                    $suspendedLoss += $amount - $reduction;
                    break;
            }
        }

        $endingTaxCapital = $this->endingCapitalCents($events, $beginningTaxCapital, 'tax_basis');
        $endingBookCapital = $this->endingCapitalCents($events, $beginningBookCapital, 'book');
        $releasedSuspendedLoss = 0;
        if ($suspendedLoss > 0 && $availableOutsideBasis > 0) {
            $releasedSuspendedLoss = min($availableOutsideBasis, $suspendedLoss);
            $availableOutsideBasis -= $releasedSuspendedLoss;
            $suspendedLoss -= $releasedSuspendedLoss;
            $totals['deductions_losses_decrease_cents'] += $releasedSuspendedLoss;
            $this->upsertSuspendedLossReleaseEvent($interest, $year, $releasedSuspendedLoss, $prior);
        } else {
            $this->deleteSuspendedLossReleaseEvent($interest, $year);
        }
        $events = $this->basisEventsForInterestYear($interest, $year);

        $hasLiquidation = $this->hasLiquidationEvent($events);
        $reviewStatus = $this->reviewStatus($events, $distributionGain, $suspendedLoss, $hasLiquidation);
        $liquidationGainLoss = $this->liquidationGainLossCents($events, $availableOutsideBasis, $distributionGain);
        if ($hasLiquidation) {
            $availableOutsideBasis = 0;
        }
        $endingInside = $endingTaxCapital;

        $values = array_merge($totals, [
            'user_id' => $interest->user_id,
            'partnership_interest_id' => $interest->id,
            'tax_year' => $year,
            'beginning_outside_basis_cents' => $beginningOutside,
            'ending_outside_basis_cents' => $availableOutsideBasis,
            'beginning_tax_basis_capital_cents' => $beginningTaxCapital,
            'ending_tax_basis_capital_cents' => $endingTaxCapital,
            'beginning_book_capital_cents' => $beginningBookCapital,
            'ending_book_capital_cents' => $endingBookCapital,
            'beginning_inside_basis_cents' => $beginningInside,
            'ending_inside_basis_cents' => $endingInside,
            'inside_basis_confidence' => $this->insideBasisConfidence($events),
            'beginning_recourse_liability_cents' => $liabilities['beginning_recourse_liability_cents'],
            'ending_recourse_liability_cents' => $liabilities['ending_recourse_liability_cents'],
            'beginning_nonrecourse_liability_cents' => $liabilities['beginning_nonrecourse_liability_cents'],
            'ending_nonrecourse_liability_cents' => $liabilities['ending_nonrecourse_liability_cents'],
            'beginning_qualified_nonrecourse_liability_cents' => $liabilities['beginning_qualified_nonrecourse_liability_cents'],
            'ending_qualified_nonrecourse_liability_cents' => $liabilities['ending_qualified_nonrecourse_liability_cents'],
            'distribution_gain_cents' => $distributionGain,
            'suspended_loss_carryforward_cents' => $suspendedLoss,
            'liquidation_gain_loss_cents' => $liquidationGainLoss,
            'review_status' => $reviewStatus,
            'is_stale' => false,
            'source_hash' => hash('sha256', $events->map(fn (FinPartnershipBasisEvent $event): string => implode('|', [$event->id, $event->event_type, $event->amount_cents, $event->updated_at?->toJSON()]))->implode(';')),
        ]);

        /** @var FinPartnershipBasisYear $basisYear */
        $basisYear = FinPartnershipBasisYear::query()->updateOrCreate([
            'user_id' => $interest->user_id,
            'partnership_interest_id' => $interest->id,
            'tax_year' => $year,
        ], $values);

        FinPartnershipBasisYear::query()
            ->where('user_id', $interest->user_id)
            ->where('partnership_interest_id', $interest->id)
            ->where('tax_year', '>', $year)
            ->whereNull('locked_at')
            ->update(['is_stale' => true, 'review_status' => 'needs_review']);

        return $basisYear;
    }

    /**
     * Holding period of the partnership interest as of a disposition date, used to characterise
     * §731 gain on the deemed sale/exchange of the interest. Long-term when held more than one
     * year. When no acquisition date is recorded, falls back to the cross-year carryforward proxy
     * (a prior-year rollforward proves the interest crossed a year boundary) and is indeterminate
     * in the interest's first tracked year so first-year gains stay review-only until confirmed.
     *
     * POLICY (confirmed, issue #954): indeterminate holding period means the gain is review-only
     * and is NEVER automatically summed into Schedule D or Form 8949. The taxpayer must set
     * `interest_start_date` (or the system must detect a prior-year rollforward) before the gain
     * is reported. Do not change this to a conservative short-term default — a silent automatic
     * classification is worse than an explicit review flag when the acquisition date is unknown.
     *
     * @param  Collection<int, FinPartnershipBasisEvent>  $events
     */
    public function holdingPeriod(FinPartnershipInterest $interest, int $year, Collection $events, ?CarbonImmutable $dispositionDate = null): string
    {
        $disposition = $dispositionDate ?? CarbonImmutable::create($year, 12, 31);
        $start = $interest->interest_start_date;
        if ($start !== null) {
            // Long-term requires holding more than one year; exactly one year is short-term.
            return CarbonImmutable::parse($start)->addYear()->lessThan($disposition)
                ? self::HOLDING_PERIOD_LONG
                : self::HOLDING_PERIOD_SHORT;
        }

        // Without an acquisition date, a prior-year rollforward event proves the interest crossed
        // a December 31 boundary, which is sufficient to conclude long-term. If neither signal is
        // present (first tracked year, no rollforward) the holding period is genuinely unknown and
        // callers must treat the result as indeterminate and exclude it from Schedule D totals.
        $crossedYearBoundary = $events->contains(
            fn (FinPartnershipBasisEvent $event): bool => $event->event_type === PartnershipBasisEventType::PriorYearRollforward->value,
        );

        return $crossedYearBoundary ? self::HOLDING_PERIOD_LONG : self::HOLDING_PERIOD_INDETERMINATE;
    }

    /**
     * Update interest-level attributes (holding-period dates, identity, classification flags) that
     * are not part of the annual rollforward. Returns the refreshed interest.
     *
     * @param  array<string, mixed>  $payload
     */
    public function updateInterest(FinAccounts $account, int $userId, int $interestId, array $payload): FinPartnershipInterest
    {
        /** @var FinPartnershipInterest $interest */
        $interest = FinPartnershipInterest::query()
            ->where('id', $interestId)
            ->where('user_id', $userId)
            ->where('account_id', $account->acct_id)
            ->firstOrFail();

        $attributes = array_intersect_key($payload, array_flip([
            'partnership_name',
            'partnership_ein',
            'interest_start_date',
            'interest_end_date',
            'is_ptp',
            'is_trader_fund',
        ]));

        if (array_key_exists('partnership_ein', $attributes)) {
            $attributes['partnership_ein'] = $this->normalizeEin($attributes['partnership_ein']);
        }
        if (array_key_exists('partnership_name', $attributes) && is_string($attributes['partnership_name'])) {
            $attributes['normalized_partnership_name'] = $this->normalizeName($attributes['partnership_name']);
        }

        $interest->fill($attributes)->save();

        return $interest->refresh();
    }

    /**
     * @return array<string, mixed>
     */
    public function interestToArray(FinPartnershipInterest $interest): array
    {
        return [
            'interestId' => $interest->id,
            'partnershipName' => $interest->partnership_name,
            'partnershipEin' => $interest->partnership_ein,
            'interestStartDate' => $this->dateToString($interest->interest_start_date),
            'interestEndDate' => $this->dateToString($interest->interest_end_date),
            'isPtp' => (bool) $interest->is_ptp,
            'isTraderFund' => (bool) $interest->is_trader_fund,
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function initializeAccount(FinAccounts $account, int $userId, array $payload): FinPartnershipBasisYear
    {
        $year = (int) $payload['tax_year'];
        $interest = $this->findOrCreateInterest($userId, $account->acct_id, null, (string) ($payload['partnership_name'] ?? $account->acct_name), 'other', null, null, null);
        $this->assertYearEditable($interest, $year);

        if (array_key_exists('interest_start_date', $payload) && $payload['interest_start_date'] !== null) {
            $interest->forceFill(['interest_start_date' => $payload['interest_start_date']])->save();
        }

        foreach ([
            'initial_cash_contribution_cents' => PartnershipBasisEventType::InitialCashContribution,
            'initial_property_contribution_adjusted_basis_cents' => PartnershipBasisEventType::InitialPropertyContributionBasis,
            'initial_tax_basis_capital_cents' => PartnershipBasisEventType::InitialTaxBasisCapital,
            'initial_book_capital_or_fmv_cents' => PartnershipBasisEventType::InitialCapitalAccountValue,
            'initial_outside_basis_override_cents' => PartnershipBasisEventType::BeginningBasis,
        ] as $key => $eventType) {
            if (! array_key_exists($key, $payload) || $payload[$key] === null) {
                continue;
            }

            // Initialization events are idempotent: re-initializing the account updates the
            // existing seed rather than appending a duplicate (each carries a stable source_path).
            $this->upsertEvent($interest, [
                'tax_year' => $year,
                'source_type' => 'manual',
                'source_path' => "initialization.{$key}",
            ], [
                'event_order' => $eventType === PartnershipBasisEventType::BeginningBasis ? -200 : -150,
                'basis_side' => in_array($eventType, [PartnershipBasisEventType::InitialTaxBasisCapital, PartnershipBasisEventType::InitialCapitalAccountValue], true) ? 'inside' : 'outside',
                'event_type' => $eventType->value,
                'amount_cents' => (int) $payload[$key],
                'account_id' => $account->acct_id,
                'source_label' => Str::headline($key),
                'review_status' => (string) ($payload['initialization_review_status'] ?? 'needs_review'),
                'notes' => $payload['notes'] ?? null,
            ]);
        }

        $this->recomputeInterestYearRange($interest, $year, $year);

        /** @var FinPartnershipBasisYear $basisYear */
        $basisYear = FinPartnershipBasisYear::query()
            ->where('user_id', $interest->user_id)
            ->where('partnership_interest_id', $interest->id)
            ->where('tax_year', $year)
            ->firstOrFail();

        return $basisYear;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function createManualEvent(FinAccounts $account, int $userId, array $payload): FinPartnershipBasisEvent
    {
        $year = (int) $payload['tax_year'];
        $interest = $this->resolveManualInterest($account, $userId, isset($payload['partnership_interest_id']) ? (int) $payload['partnership_interest_id'] : null);
        $this->assertYearEditable($interest, $year);
        $eventType = PartnershipBasisEventType::from((string) $payload['event_type']);

        // Manual events are append-only: two manual events of the same type/year are
        // distinct rows, never collapsed into one.
        $event = $this->appendEvent($interest, array_merge($payload, [
            'event_order' => $payload['event_order'] ?? $this->eventOrder($eventType->value),
            'basis_side' => $payload['basis_side'] ?? $this->basisSideFor($eventType),
            'source_type' => $payload['source_type'] ?? 'manual',
            'account_id' => $account->acct_id,
        ]));

        $this->recomputeInterestYearRange($interest, $year, $year);

        return $event;
    }

    /**
     * Accept a reconciliation candidate (a contribution or distribution surfaced from the account's
     * transaction feed) and create a reviewed manual basis event carrying the candidate's source
     * provenance. Idempotent: if an event already exists for the same source reference (line_item_id,
     * statement_id, or statement_investment_id) the existing event is returned without creating a
     * duplicate. The reconciliation service itself remains read-only — this is the single write path.
     *
     * @param  array<string, mixed>  $payload  Validated accept payload from the controller.
     */
    public function acceptReconciliationCandidate(FinAccounts $account, int $userId, array $payload): FinPartnershipBasisEvent
    {
        $year = (int) $payload['tax_year'];
        $interest = $this->resolveManualInterest($account, $userId, isset($payload['partnership_interest_id']) ? (int) $payload['partnership_interest_id'] : null);
        $this->assertYearEditable($interest, $year);

        // Idempotency guard: return any existing event that was already created from the same
        // source reference so that re-accepting a candidate is a no-op rather than a duplicate.
        $existing = $this->findExistingCandidateEvent($interest, $year, $payload);
        if ($existing instanceof FinPartnershipBasisEvent) {
            return $existing;
        }

        $eventType = PartnershipBasisEventType::from((string) $payload['event_type']);

        /** @var FinPartnershipBasisEvent $event */
        $event = $this->appendEvent($interest, [
            'tax_year' => $year,
            'event_type' => $eventType->value,
            'event_order' => $payload['event_order'] ?? $this->eventOrder($eventType->value),
            'basis_side' => $payload['basis_side'] ?? $this->basisSideFor($eventType),
            'amount_cents' => (int) $payload['amount_cents'],
            'source_type' => 'account_transaction',
            'account_id' => $account->acct_id,
            'line_item_id' => $payload['line_item_id'] ?? null,
            'statement_id' => $payload['statement_id'] ?? null,
            'statement_investment_id' => $payload['statement_investment_id'] ?? null,
            'event_date' => $payload['event_date'] ?? null,
            'source_label' => $payload['source_label'] ?? null,
            'notes' => $payload['notes'] ?? null,
            // Accepted candidates are immediately marked reviewed so the rollforward reflects
            // the partner's explicit acceptance rather than requiring a second review step.
            'review_status' => 'reviewed',
            'metadata' => array_merge(
                ['accepted_from_reconciliation_candidate' => true],
                isset($payload['metadata']) && is_array($payload['metadata']) ? $payload['metadata'] : [],
            ),
        ]);

        $this->recomputeInterestYearRange($interest, $year, $year);

        return $event;
    }

    /**
     * Find an existing basis event that was already created from the same reconciliation candidate
     * source reference, used to enforce idempotency on the accept path.
     *
     * @param  array<string, mixed>  $payload
     */
    private function findExistingCandidateEvent(FinPartnershipInterest $interest, int $year, array $payload): ?FinPartnershipBasisEvent
    {
        $query = FinPartnershipBasisEvent::query()
            ->where('user_id', $interest->user_id)
            ->where('partnership_interest_id', $interest->id)
            ->where('tax_year', $year)
            ->where('source_type', 'account_transaction');

        $lineItemId = $payload['line_item_id'] ?? null;
        $statementId = $payload['statement_id'] ?? null;
        $statementInvestmentId = $payload['statement_investment_id'] ?? null;

        // A line item id uniquely identifies the source row, so when it is
        // present match on it alone. Falling back to the coarser statement-level
        // keys here would let a later candidate with a different line_item_id be
        // suppressed by an already-seeded event that merely shares a statement.
        if ($lineItemId !== null) {
            $match = (clone $query)->where('line_item_id', (int) $lineItemId)->first();

            return $match instanceof FinPartnershipBasisEvent ? $match : null;
        }

        if ($statementInvestmentId !== null) {
            $match = (clone $query)->where('statement_investment_id', (int) $statementInvestmentId)->first();
            if ($match instanceof FinPartnershipBasisEvent) {
                return $match;
            }
        }

        if ($statementId !== null) {
            $match = (clone $query)->where('statement_id', (int) $statementId)->first();
            if ($match instanceof FinPartnershipBasisEvent) {
                return $match;
            }
        }

        return null;
    }

    /**
     * Batch-seed outside-basis contribution and distribution events from an account's transaction
     * feed. Iterates the reconciliation candidates (contributions and distributions) produced by
     * PartnershipBasisReconciliationService for the given account/year and creates one basis event
     * per un-seeded line item using the same path as acceptReconciliationCandidate(). Idempotent:
     * a second call skips every line item that already has a seeded event and only creates the
     * remainder.
     *
     * @return array{created: int, skipped: int}
     */
    public function seedOutsideBasisFromTransactions(FinAccounts $account, int $userId, int $year): array
    {
        // resolveManualInterest() already blocks accounts holding more than one
        // partnership interest (bulk seed has no way to pick a target), so the
        // multi-interest case is rejected before we touch any candidates.
        $interest = $this->resolveManualInterest($account, $userId, null);
        $this->assertYearEditable($interest, $year);

        // Bulk seed writes reviewed account_transaction events with only same-source
        // idempotency; it cannot tell whether a transaction already corresponds to a
        // K-1-reported contribution/distribution. If the year already carries any
        // K-1-sourced contribution/distribution event, seeding could reduce/increase
        // outside basis twice, so disable bulk seed and require per-candidate review.
        $hasK1ContributionOrDistribution = FinPartnershipBasisEvent::query()
            ->where('user_id', $userId)
            ->where('partnership_interest_id', $interest->id)
            ->where('tax_year', $year)
            ->whereIn('source_type', ['k1_field', 'k1_code'])
            ->whereIn('event_type', $this->contributionDistributionEventTypes())
            ->exists();

        if ($hasK1ContributionOrDistribution) {
            throw ValidationException::withMessages([
                'seed' => 'Bulk seed is disabled because this year already contains K-1-sourced contribution/distribution events. Accept candidates individually to avoid double-counting outside basis.',
            ]);
        }

        $basisYears = FinPartnershipBasisYear::query()
            ->where('user_id', $userId)
            ->where('tax_year', $year)
            ->whereHas('partnershipInterest', fn ($query) => $query->where('account_id', $account->acct_id))
            ->get();

        $reconciliation = $this->reconciliationService->reconcile((int) $account->acct_id, $year, $basisYears);
        $candidates = array_merge($reconciliation->contributionCandidates, $reconciliation->distributionCandidates);

        $created = 0;
        $skipped = 0;

        foreach ($candidates as $candidate) {
            // Only line-item-backed candidates can be seeded (they carry a stable idempotency key).
            if ($candidate->lineItemId === null) {
                $skipped++;

                continue;
            }

            $payload = [
                'line_item_id' => $candidate->lineItemId,
                'statement_id' => $candidate->statementId,
                'statement_investment_id' => $candidate->statementInvestmentId,
            ];

            $existingEvent = $this->findExistingCandidateEvent($interest, $year, $payload);
            if ($existingEvent instanceof FinPartnershipBasisEvent) {
                $skipped++;

                continue;
            }

            $eventType = PartnershipBasisEventType::from($candidate->suggestedEventType);

            $this->appendEvent($interest, [
                'tax_year' => $year,
                'event_type' => $eventType->value,
                'event_order' => $this->eventOrder($eventType->value),
                'basis_side' => $this->basisSideFor($eventType),
                'amount_cents' => (int) round($candidate->amount * 100),
                'source_type' => 'account_transaction',
                'account_id' => $account->acct_id,
                'line_item_id' => $candidate->lineItemId,
                'statement_id' => $candidate->statementId,
                'statement_investment_id' => $candidate->statementInvestmentId,
                'event_date' => $candidate->date,
                'source_label' => $candidate->description,
                'review_status' => 'reviewed',
                'metadata' => ['seeded_from_transactions' => true],
            ]);

            $created++;
        }

        if ($created > 0) {
            $this->recomputeInterestYearRange($interest, $year, $year);
        }

        return ['created' => $created, 'skipped' => $skipped];
    }

    /** @return EloquentCollection<int, FinPartnershipBasisYear> */
    public function lockAccountYear(FinAccounts $account, int $userId, int $year): EloquentCollection
    {
        $basisYears = FinPartnershipBasisYear::query()
            ->where('user_id', $userId)
            ->where('tax_year', $year)
            ->whereHas('partnershipInterest', fn ($query) => $query->where('account_id', $account->acct_id))
            ->get();

        $basisYears->each(fn (FinPartnershipBasisYear $basisYear): bool => $basisYear->update(['review_status' => 'locked', 'locked_at' => now(), 'locked_by_user_id' => $userId]));

        return $basisYears;
    }

    /**
     * Clear the lock on an account's basis year(s) so the rollforward can be amended (e.g. after an
     * amended K-1). Recomputes each affected interest from the unlocked year forward so the freshly
     * editable year and everything downstream reflect current sources.
     *
     * @return EloquentCollection<int, FinPartnershipBasisYear>
     */
    public function unlockAccountYear(FinAccounts $account, int $userId, int $year, string $reason, ?string $amendmentReason = null, ?int $amendedSourceDocumentId = null): EloquentCollection
    {
        $basisYears = FinPartnershipBasisYear::query()
            ->with('partnershipInterest')
            ->where('user_id', $userId)
            ->where('tax_year', $year)
            ->whereNotNull('locked_at')
            ->whereHas('partnershipInterest', fn ($query) => $query->where('account_id', $account->acct_id))
            ->get();

        $basisYears->each(fn (FinPartnershipBasisYear $basisYear): bool => $basisYear->update([
            'review_status' => 'needs_review',
            'locked_at' => null,
            'unlocked_at' => now(),
            'unlocked_by_user_id' => $userId,
            'unlock_reason' => $reason,
            'amendment_reason' => $amendmentReason,
            'amended_source_document_id' => $amendedSourceDocumentId,
        ]));

        $basisYears->pluck('partnershipInterest')
            ->filter(fn ($interest): bool => $interest instanceof FinPartnershipInterest)
            ->unique('id')
            ->each(fn (FinPartnershipInterest $interest) => $this->recomputeInterestYearRange($interest, $year));

        return $basisYears->fresh();
    }

    /**
     * Recompute an interest's rollforward for every year from $fromYear through its latest basis
     * year (ascending). A single recomputeInterestYear() refreshes only one year, so moving an event
     * across a gap requires re-walking the chain in order; intervening years feed the next year's
     * beginning basis, and locked years are skipped (left frozen) by recomputeInterestYear().
     */
    public function recomputeInterestYearRange(FinPartnershipInterest $interest, int $fromYear, ?int $throughYear = null): void
    {
        $maxBasisYear = (int) FinPartnershipBasisYear::query()
            ->where('user_id', $interest->user_id)
            ->where('partnership_interest_id', $interest->id)
            ->max('tax_year');

        $maxEventYear = (int) FinPartnershipBasisEvent::query()
            ->where('user_id', $interest->user_id)
            ->where('partnership_interest_id', $interest->id)
            ->max('tax_year');

        $endYear = max($fromYear, $throughYear ?? 0, $maxBasisYear, $maxEventYear);

        for ($currentYear = $fromYear; $currentYear <= $endYear; $currentYear++) {
            $this->recomputeInterestYear($interest, $currentYear);
        }
    }

    /**
     * @return Collection<int, array{interest: FinPartnershipInterest, from_year: int}>
     */
    public function documentBasisRecomputeRanges(FileForTaxDocument $document, ?int $taxDocumentAccountId = null): Collection
    {
        return FinPartnershipBasisEvent::query()
            ->with('partnershipInterest')
            ->where('user_id', $document->user_id)
            ->where('tax_document_id', $document->id)
            ->when($taxDocumentAccountId !== null, fn ($query) => $query->where('tax_document_account_id', $taxDocumentAccountId))
            ->get()
            ->groupBy('partnership_interest_id')
            ->map(function (Collection $events): ?array {
                $event = $events->first();
                if (! $event instanceof FinPartnershipBasisEvent || ! $event->partnershipInterest instanceof FinPartnershipInterest) {
                    return null;
                }

                return [
                    'interest' => $event->partnershipInterest,
                    'from_year' => (int) $events->min('tax_year'),
                ];
            })
            ->filter()
            ->values();
    }

    public function deleteDocumentBasisEvents(FileForTaxDocument $document, ?int $taxDocumentAccountId = null): void
    {
        FinPartnershipBasisEvent::query()
            ->where('user_id', $document->user_id)
            ->where('tax_document_id', $document->id)
            ->when($taxDocumentAccountId !== null, fn ($query) => $query->where('tax_document_account_id', $taxDocumentAccountId))
            ->delete();
    }

    /**
     * @param  Collection<int, array{interest: FinPartnershipInterest, from_year: int}>  $ranges
     */
    public function recomputeDocumentBasisRanges(Collection $ranges): void
    {
        $ranges->each(function (array $range): void {
            $this->recomputeInterestYearRange($range['interest'], $range['from_year']);
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function accountBasisData(FinAccounts $account, int $userId, int $year): array
    {
        $basisYears = FinPartnershipBasisYear::query()
            ->with(['partnershipInterest', 'partnershipInterest.basisEvents' => fn ($events) => $events->where('tax_year', $year)->orderBy('event_order')->orderBy('id')])
            ->where('user_id', $userId)
            ->where('tax_year', $year)
            ->whereHas('partnershipInterest', fn ($query) => $query->where('account_id', $account->acct_id))
            ->get();

        return [
            'year' => $year,
            'account' => ['id' => $account->acct_id, 'name' => $account->acct_name],
            'interests' => $basisYears->map(fn (FinPartnershipBasisYear $basisYear): array => $this->basisYearToArray($basisYear))->values()->all(),
            'reconciliation' => $this->reconciliationService->reconcile((int) $account->acct_id, $year, $basisYears)->toArray(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function basisYearToArray(FinPartnershipBasisYear $basisYear): array
    {
        $interest = $basisYear->partnershipInterest;
        $events = $interest->relationLoaded('basisEvents')
            ? $interest->basisEvents
            : $interest->basisEvents()->where('tax_year', $basisYear->tax_year)->orderBy('event_order')->orderBy('id')->get();

        return [
            'id' => $basisYear->id,
            'interestId' => $basisYear->partnership_interest_id,
            'partnershipName' => $interest->partnership_name,
            'partnershipEin' => $interest->partnership_ein,
            'accountId' => $interest->account_id,
            'interestStartDate' => $this->dateToString($interest->interest_start_date),
            'interestEndDate' => $this->dateToString($interest->interest_end_date),
            'isPtp' => (bool) $interest->is_ptp,
            'holdingPeriod' => $this->holdingPeriod($interest, (int) $basisYear->tax_year, $events),
            'taxYear' => $basisYear->tax_year,
            'beginningOutsideBasis' => MoneyMath::fromCents((int) $basisYear->beginning_outside_basis_cents),
            'endingOutsideBasis' => MoneyMath::fromCents((int) $basisYear->ending_outside_basis_cents),
            'beginningTaxBasisCapital' => MoneyMath::fromCents((int) $basisYear->beginning_tax_basis_capital_cents),
            'endingTaxBasisCapital' => MoneyMath::fromCents((int) $basisYear->ending_tax_basis_capital_cents),
            'beginningBookCapital' => MoneyMath::fromCents((int) $basisYear->beginning_book_capital_cents),
            'endingBookCapital' => MoneyMath::fromCents((int) $basisYear->ending_book_capital_cents),
            'insideBasisConfidence' => $basisYear->inside_basis_confidence,
            'capitalContributions' => MoneyMath::fromCents((int) $basisYear->capital_contributions_cents),
            'taxableIncomeIncrease' => MoneyMath::fromCents((int) $basisYear->taxable_income_increase_cents),
            'taxExemptIncomeIncrease' => MoneyMath::fromCents((int) $basisYear->tax_exempt_income_increase_cents),
            'liabilityIncrease' => MoneyMath::fromCents((int) $basisYear->liability_increase_cents),
            'cashDistributions' => MoneyMath::fromCents((int) $basisYear->cash_distributions_cents),
            'propertyDistributionsBasis' => MoneyMath::fromCents((int) $basisYear->property_distributions_basis_cents),
            'liabilityDecrease' => MoneyMath::fromCents((int) $basisYear->liability_decrease_cents),
            'deductionsLossesDecrease' => MoneyMath::fromCents((int) $basisYear->deductions_losses_decrease_cents),
            'nondeductibleExpensesDecrease' => MoneyMath::fromCents((int) $basisYear->nondeductible_expenses_decrease_cents),
            'foreignTaxesDecrease' => MoneyMath::fromCents((int) $basisYear->foreign_taxes_decrease_cents),
            'distributionGain' => MoneyMath::fromCents((int) $basisYear->distribution_gain_cents),
            'suspendedLossCarryforward' => MoneyMath::fromCents((int) $basisYear->suspended_loss_carryforward_cents),
            'liquidationGainLoss' => $basisYear->liquidation_gain_loss_cents === null ? null : MoneyMath::fromCents((int) $basisYear->liquidation_gain_loss_cents),
            'reviewStatus' => $basisYear->review_status,
            'isStale' => (bool) $basisYear->is_stale,
            'lockedAt' => $basisYear->locked_at,
            'lockedByUserId' => $basisYear->locked_by_user_id,
            'unlockedAt' => $basisYear->unlocked_at,
            'unlockedByUserId' => $basisYear->unlocked_by_user_id,
            'unlockReason' => $basisYear->unlock_reason,
            'amendmentReason' => $basisYear->amendment_reason,
            'amendedSourceDocumentId' => $basisYear->amended_source_document_id,
            'events' => $events->map(fn (FinPartnershipBasisEvent $event): array => $this->eventToArray($event))->values()->all(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function eventToArray(FinPartnershipBasisEvent $event): array
    {
        return [
            'id' => $event->id,
            'taxYear' => $event->tax_year,
            'eventDate' => $event->event_date,
            'eventOrder' => $event->event_order,
            'basisSide' => $event->basis_side,
            'eventType' => $event->event_type,
            'amount' => MoneyMath::fromCents((int) $event->amount_cents),
            'amountCents' => (int) $event->amount_cents,
            'currency' => $event->currency,
            'sourceType' => $event->source_type,
            'taxDocumentId' => $event->tax_document_id,
            'taxDocumentAccountId' => $event->tax_document_account_id,
            'accountId' => $event->account_id,
            'lineItemId' => $event->line_item_id,
            'statementId' => $event->statement_id,
            'statementInvestmentId' => $event->statement_investment_id,
            'k1Box' => $event->k1_box,
            'k1Code' => $event->k1_code,
            'sourcePath' => $event->source_path,
            'sourceLabel' => $event->source_label,
            'notes' => $event->notes,
            'reviewStatus' => $event->review_status,
            'metadata' => $event->metadata,
        ];
    }

    private function syncK1Document(FileForTaxDocument $document, int $userId, int $year): ?FinPartnershipInterest
    {
        $document->loadMissing(['accountLinks.account']);
        $parentData = is_array($document->parsed_data) ? $document->parsed_data : [];
        $k1Links = $document->accountLinks->filter(fn ($link): bool => $link instanceof TaxDocumentAccount && $link->form_type === 'k1' && (int) $link->tax_year === $year);

        if ($document->form_type === 'k1') {
            return $this->syncK1Payload($document, $userId, $year, $parentData, $k1Links->first());
        }

        if ($k1Links->isEmpty()) {
            $this->pruneDocumentK1Events($userId, $document, $year);

            return null;
        }

        $syncedInterest = null;
        foreach ($k1Links as $link) {
            $data = $this->k1PayloadForLink($parentData, $link);
            if ($data === null) {
                $this->pruneDocumentK1Events($userId, $document, $year, linkId: $link->id, scopeToLink: true);

                continue;
            }

            $syncedInterest = $this->syncK1Payload($document, $userId, $year, $data, $link);
        }

        return $syncedInterest;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function syncK1Payload(FileForTaxDocument $document, int $userId, int $year, array $data, ?TaxDocumentAccount $link): ?FinPartnershipInterest
    {
        if (K1LegacyTransformer::isLegacy($data)) {
            $data = K1LegacyTransformer::transform($data);
        }

        $formType = $this->mapFormType((string) ($data['formType'] ?? 'K-1-1065'));
        if ($formType !== 'k1_1065') {
            $this->pruneDocumentK1Events($userId, $document, $year, linkId: $link?->id, scopeToLink: true);

            return null;
        }

        $accountId = $link instanceof TaxDocumentAccount ? $link->account_id : $document->account_id;
        $interest = $this->findOrCreateInterest(
            $userId,
            $accountId,
            // Box A is the partnership EIN, Box B is the partnership name/address, Box D is
            // the publicly-traded-partnership flag (per the K-1 spec used across the app).
            $this->normalizeEin($data['fields']['A']['value'] ?? null),
            $this->stringField($data, 'B') ?? $this->stringField($data, 'A') ?? 'Partnership',
            $formType,
            $document,
            $link instanceof TaxDocumentAccount ? $link : null,
            $this->truthyFlag($data['fields']['D']['value'] ?? null),
        );

        // Never mutate a locked year's source events; the locked total stands until amended.
        if ($this->yearIsLocked($interest, $year)) {
            return $interest;
        }

        $reviewStatus = ($link instanceof TaxDocumentAccount ? $link->is_reviewed : $document->is_reviewed) ? 'reviewed' : 'needs_review';
        $sourceEvents = $this->collectK1SourceEvents($data, $year, $reviewStatus, $document, $link instanceof TaxDocumentAccount ? $link : null, $accountId);
        $this->syncK1Events($interest, $document, $link instanceof TaxDocumentAccount ? $link : null, $year, $sourceEvents);

        return $interest;
    }

    /**
     * @param  array<mixed>  $parentData
     * @return array<string, mixed>|null
     */
    private function k1PayloadForLink(array $parentData, TaxDocumentAccount $link): ?array
    {
        $entries = $this->containerEntries($parentData);
        $candidates = array_values(array_filter($entries, function (array $entry): bool {
            $entryFormType = (string) ($entry['form_type'] ?? $entry['formType'] ?? '');
            $payload = is_array($entry['parsed_data'] ?? null) ? $entry['parsed_data'] : [];
            $payloadFormType = (string) ($payload['formType'] ?? '');

            return $entryFormType === 'k1' || $this->mapFormType($payloadFormType) === 'k1_1065';
        }));

        $entry = null;
        if (count($candidates) === 1) {
            $entry = $candidates[0];
        }

        if ($entry === null && $link->ai_identifier !== null) {
            $entry = $this->singleMatchingEntry($candidates, 'account_identifier', $link->ai_identifier);
        }

        if ($entry === null && $link->ai_account_name !== null) {
            $entry = $this->singleMatchingEntry($candidates, 'account_name', $link->ai_account_name);
        }

        if (! is_array($entry)) {
            return null;
        }

        $payload = $entry['parsed_data'] ?? $entry;

        return is_array($payload) && ! array_is_list($payload) ? $payload : null;
    }

    /**
     * @param  array<mixed>  $parentData
     * @return array<int, array<string, mixed>>
     */
    private function containerEntries(array $parentData): array
    {
        if (array_is_list($parentData)) {
            return $this->arrayEntries($parentData);
        }

        if (isset($parentData['accounts']) && is_array($parentData['accounts']) && array_is_list($parentData['accounts'])) {
            return $this->arrayEntries($parentData['accounts']);
        }

        return [];
    }

    /**
     * @param  array<mixed>  $entries
     * @return array<int, array<string, mixed>>
     */
    private function arrayEntries(array $entries): array
    {
        $arrayEntries = [];
        foreach ($entries as $entry) {
            if (is_array($entry) && ! array_is_list($entry)) {
                $arrayEntries[] = $entry;
            }
        }

        return $arrayEntries;
    }

    /**
     * @param  array<int, array<string, mixed>>  $entries
     * @return array<string, mixed>|null
     */
    private function singleMatchingEntry(array $entries, string $key, string $value): ?array
    {
        $matches = array_values(array_filter($entries, fn (array $entry): bool => ($entry[$key] ?? null) === $value));

        return count($matches) === 1 ? $matches[0] : null;
    }

    private function findOrCreateInterest(int $userId, ?int $accountId, ?string $ein, string $name, string $formType, ?FileForTaxDocument $document, ?TaxDocumentAccount $link, ?bool $isPtp = null): FinPartnershipInterest
    {
        $normalizedName = $this->normalizeName($name);

        // Lock the matching window so concurrent K-1 syncs cannot both miss and create a
        // duplicate when EIN is absent (the unique index does not cover NULL EINs).
        return DB::transaction(function () use ($userId, $accountId, $ein, $name, $normalizedName, $formType, $document, $link, $isPtp): FinPartnershipInterest {
            $base = fn () => FinPartnershipInterest::query()
                ->where('user_id', $userId)
                ->where('account_id', $accountId)
                ->lockForUpdate();

            // Match in priority order so a manual interest seeded before the K-1 (null EIN) and the
            // later K-1 (with EIN) for the same account+name resolve to ONE interest, in both
            // directions, instead of splitting opening basis onto a duplicate row:
            //   1. exact EIN (when the K-1 carries one)
            //   2. a null-EIN row with the same normalized name (manual init before the K-1 synced)
            //   3. when no EIN is supplied (UI init), any row with the same name (init after sync)
            $interest = null;
            if ($ein !== null) {
                $interest = $base()->where('partnership_ein', $ein)->first()
                    ?? $base()->whereNull('partnership_ein')->where('normalized_partnership_name', $normalizedName)->first();
            } else {
                $interest = $base()->whereNull('partnership_ein')->where('normalized_partnership_name', $normalizedName)->first()
                    ?? $base()->where('normalized_partnership_name', $normalizedName)->first();
            }

            if (! $interest instanceof FinPartnershipInterest) {
                /** @var FinPartnershipInterest $interest */
                $interest = FinPartnershipInterest::query()->create([
                    'user_id' => $userId,
                    'account_id' => $accountId,
                    'partnership_ein' => $ein,
                    'partnership_name' => $name,
                    'normalized_partnership_name' => $normalizedName,
                    'form_type' => $formType,
                    'is_ptp' => $isPtp ?? false,
                    'source_tax_document_id' => $document?->id,
                    'source_tax_document_account_id' => $link?->id,
                    'metadata' => [],
                ]);

                return $interest;
            }

            $interest->fill([
                'partnership_name' => $interest->partnership_name ?: $name,
                'normalized_partnership_name' => $interest->normalized_partnership_name ?: $normalizedName,
                'partnership_ein' => $interest->partnership_ein ?: $ein,
                'is_ptp' => $isPtp ?? $interest->is_ptp,
                'source_tax_document_id' => $interest->source_tax_document_id ?: $document?->id,
                'source_tax_document_account_id' => $interest->source_tax_document_account_id ?: $link?->id,
            ])->save();

            return $interest;
        });
    }

    /**
     * Build the full set of basis events implied by the current parsed K-1, applying a
     * routing table from box/code to event type and de-duplicating overlapping sources so
     * the same dollar amount is never counted twice.
     *
     * @param  array<string, mixed>  $data
     * @return array<int, array<string, mixed>>
     */
    private function collectK1SourceEvents(array $data, int $year, string $reviewStatus, FileForTaxDocument $document, ?TaxDocumentAccount $link, ?int $accountId): array
    {
        /** @var array<string, array<string, mixed>> $events keyed by source_path */
        $events = [];

        $push = function (PartnershipBasisEventType $type, string $sourceType, string $path, string $label, int $amountCents, ?string $box, ?string $code, string $review, array $metadata = []) use (&$events, $year, $document, $link, $accountId): void {
            $events[$path] = [
                'tax_year' => $year,
                'event_order' => $this->eventOrder($type->value),
                'basis_side' => $this->basisSideFor($type),
                'event_type' => $type->value,
                'amount_cents' => $this->preserveSignedAmount($type) ? $amountCents : abs($amountCents),
                'source_type' => $sourceType,
                'tax_document_id' => $document->id,
                'tax_document_account_id' => $link?->id,
                'account_id' => $accountId,
                'k1_box' => $box,
                'k1_code' => $code,
                'source_path' => $path,
                'source_label' => $label,
                'review_status' => $review,
                'metadata' => $metadata,
            ];
        };

        $basis = is_array($data['basis'] ?? null) ? $data['basis'] : [];
        $capital = is_array($basis['capitalAccount'] ?? null) ? $basis['capitalAccount'] : [];
        $worksheet = is_array($basis['outsideBasisWorksheet'] ?? null) ? $basis['outsideBasisWorksheet'] : [];
        $normalizedDistributions = is_array($basis['distributions'] ?? null) ? $basis['distributions'] : [];

        // ── Distributive-share income/loss (flat boxes) — canonical income source ──
        foreach (self::K1_INCOME_BOXES as $box) {
            $cents = $this->k1FieldCents($data, $box);
            if ($cents === null || $cents === 0) {
                continue;
            }
            $type = $cents > 0 ? PartnershipBasisEventType::TaxableIncome : PartnershipBasisEventType::DeductibleLoss;
            $push($type, 'k1_field', "fields.{$box}.value", "K-1 Box {$box}", $cents, $box, null, $reviewStatus);
        }

        // ── Guaranteed payments: count once (4c else 4a+4b else 4). Guaranteed payments are
        //    ordinary income to the partner but are NOT a distributive share and do not adjust
        //    outside basis (IRC §707(c)), so they are recorded as a memorandum only. ──
        $gp = $this->k1FieldCents($data, '4c');
        if ($gp === null || $gp === 0) {
            $gp4a = $this->k1FieldCents($data, '4a') ?? 0;
            $gp4b = $this->k1FieldCents($data, '4b') ?? 0;
            $gp = ($gp4a + $gp4b) ?: ($this->k1FieldCents($data, '4') ?? 0);
        }
        if ($gp !== 0) {
            $push(PartnershipBasisEventType::Memorandum, 'k1_field', 'fields.4.guaranteed_payments', 'K-1 guaranteed payments (income; no outside-basis effect)', $gp, '4', null, $reviewStatus);
        }

        // ── Section 179 deduction (Box 12) — reduces basis ──
        $box12 = $this->k1FieldCents($data, '12');
        if ($box12 !== null && $box12 !== 0) {
            $push(PartnershipBasisEventType::Section179, 'k1_field', 'fields.12.value', 'K-1 Box 12 Section 179 deduction', $box12, '12', null, $reviewStatus);
        }

        // ── Foreign taxes paid or accrued — §705(a)(2)(B)/§901 expenditure that reduces outside
        //    basis. Priority: Box 21 (K-1 face total) → K-3 Part III Section 4 grandTotalUSD
        //    (country detail; used when Box 21 is absent, e.g. because the partnership omitted the
        //    summary and moved all detail to the K-3). When neither source is parseable the item
        //    stays memorandum / needs_review via the Box 16 coded-event path. ──
        $box21 = $this->k1FieldCents($data, '21');
        if ($box21 !== null && $box21 !== 0) {
            $push(PartnershipBasisEventType::ForeignTax, 'k1_field', 'fields.21.value', 'K-1 Box 21 foreign taxes paid or accrued', $box21, '21', null, $reviewStatus);
        } else {
            $k3ForeignTaxCents = $this->k3ForeignTaxCents($data);
            if ($k3ForeignTaxCents !== null && $k3ForeignTaxCents !== 0) {
                $push(PartnershipBasisEventType::ForeignTax, 'k1_field', 'k3.part3_section4.grandTotalUSD', 'K-3 Part III Section 4 foreign taxes paid or accrued', $k3ForeignTaxCents, 'K-3', null, $reviewStatus);
            }
        }

        // ── Coded boxes ──
        $this->collectK1CodedEvents($data, $reviewStatus, $push);

        // ── Distributions: choose ONE usable source to avoid double counting. Priority:
        //    normalized basis.distributions → Box 19 codes → capital-account withdrawals. ──
        $recordedDistribution = false;
        if ($normalizedDistributions !== []) {
            $handledOverrideCodes = [];
            foreach ($normalizedDistributions as $index => $distribution) {
                if (! is_array($distribution)) {
                    continue;
                }
                $code = strtoupper(trim((string) ($distribution['code'] ?? 'A')));
                $code = $code !== '' ? $code : 'A';
                [$type, $label] = $this->distributionTypeForCode($code);

                $override = $this->sourceOverrideCents($data, sprintf('code:19:%s', $code));
                if ($override !== null) {
                    if (isset($handledOverrideCodes[$code])) {
                        continue;
                    }
                    $handledOverrideCodes[$code] = true;
                    $recordedDistribution = true;
                    if ($override !== 0) {
                        $push($type, 'k1_code', "codes.19.{$code}.override", "{$label} (reviewed override)", $override, '19', $code, $reviewStatus);
                    }

                    continue;
                }

                $cents = $this->moneyToCents($distribution['partnershipAdjustedBasis'] ?? null) ?? $this->moneyToCents($distribution['amount'] ?? null);
                if ($cents === null || $cents === 0) {
                    continue;
                }
                $push($type, 'k1_code', "basis.distributions.{$index}", $label, $cents, '19', $code, $reviewStatus);
                $recordedDistribution = true;
            }
        }

        if (! $recordedDistribution && is_array($data['codes']['19'] ?? null) && $data['codes']['19'] !== []) {
            foreach ($this->groupCodeItems($data, '19') as $code => $entries) {
                [$type, $label] = $this->distributionTypeForCode($code !== '' ? $code : 'A');

                $override = $this->sourceOverrideCents($data, sprintf('code:19:%s', $code));
                if ($override !== null) {
                    $recordedDistribution = true;
                    if ($override !== 0) {
                        $push($type, 'k1_code', "codes.19.{$code}.override", $label, $override, '19', $code !== '' ? $code : null, $reviewStatus);
                    }

                    continue;
                }

                foreach ($entries as $entry) {
                    $cents = $this->moneyToCents($entry['item']['value'] ?? null);
                    if ($cents === null || $cents === 0) {
                        continue;
                    }
                    $push($type, 'k1_code', "codes.19.{$entry['index']}.value", $label, $cents, '19', $code !== '' ? $code : null, $reviewStatus);
                    $recordedDistribution = true;
                }
            }
        }

        if (! $recordedDistribution) {
            $withdrawals = $this->moneyToCents($capital['withdrawalsAndDistributions'] ?? null);
            if ($withdrawals !== null && $withdrawals !== 0) {
                $push(PartnershipBasisEventType::CashDistribution, 'k1_field', 'basis.capitalAccount.withdrawalsAndDistributions', 'K-1 capital account withdrawals & distributions', $withdrawals, '19', null, $reviewStatus);
            }
        }

        // ── Capital-account analysis (inside / book capital seeds + reconciliation only) ──
        $capitalMethod = $this->normalizedCapitalAccountMethod($capital);
        $isTaxBasisCapital = $this->isTaxBasisCapitalMethod($capitalMethod);
        $beginningCapital = $this->moneyToCents($capital['beginningCapital'] ?? null);
        if ($beginningCapital !== null && $beginningCapital !== 0) {
            $push(
                $isTaxBasisCapital ? PartnershipBasisEventType::InitialTaxBasisCapital : PartnershipBasisEventType::InitialCapitalAccountValue,
                'k1_field',
                'basis.capitalAccount.beginningCapital',
                $isTaxBasisCapital ? 'K-1 beginning tax-basis capital account' : 'K-1 beginning book/704(b) capital account',
                $beginningCapital,
                null,
                null,
                $reviewStatus,
                ['capital_account_method' => $capitalMethod],
            );
        }
        $endingCapital = $this->moneyToCents($capital['endingCapital'] ?? null);
        if ($endingCapital !== null) {
            $metadata = [
                'capital_account_method' => $capitalMethod,
                'ending_book_capital_cents' => $endingCapital,
            ];
            if ($isTaxBasisCapital) {
                $metadata['ending_tax_basis_capital_cents'] = $endingCapital;
            }
            $push(PartnershipBasisEventType::ReconciliationAdjustment, 'k1_field', 'basis.capitalAccount.endingCapital', 'K-1 ending capital account', $endingCapital, null, null, $reviewStatus, $metadata);
        }
        $contributed = $this->moneyToCents($capital['capitalContributedDuringYear'] ?? null);
        if ($contributed !== null && $contributed !== 0) {
            $push(PartnershipBasisEventType::CapitalContributionCash, 'k1_field', 'basis.capitalAccount.capitalContributedDuringYear', 'K-1 capital contributed during year', $contributed, null, null, $reviewStatus);
        }
        // Capital-account net income is reconciliation data only; the distributive-share boxes
        // above are the authoritative income source, so this is a memorandum (never double-counted).
        $netIncome = $this->moneyToCents($capital['currentYearNetIncomeLoss'] ?? null);
        if ($netIncome !== null && $netIncome !== 0) {
            $push(PartnershipBasisEventType::ReconciliationAdjustment, 'k1_field', 'basis.capitalAccount.currentYearNetIncomeLoss', 'K-1 capital account net income (reconciliation only)', $netIncome, null, null, $reviewStatus);
        }

        // ── Outside-basis worksheet (when the partnership provides one) ──
        $beginningBasis = $this->moneyToCents($worksheet['beginningBasis'] ?? null);
        if ($beginningBasis !== null && $beginningBasis !== 0) {
            $push(PartnershipBasisEventType::BeginningBasis, 'k1_field', 'basis.outsideBasisWorksheet.beginningBasis', 'K-1 outside basis worksheet beginning basis', $beginningBasis, null, null, $reviewStatus);
        }

        // ── Liabilities: net share change is a deemed contribution/distribution ──
        $this->collectK1LiabilityEvent($data, $basis, $reviewStatus, $push);

        return array_values($events);
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  callable(PartnershipBasisEventType, string, string, string, int, ?string, ?string, string, array<string, mixed>=): void  $push
     */
    private function collectK1CodedEvents(array $data, string $reviewStatus, callable $push): void
    {
        foreach (['11', '13', '16', '17', '18', '20', '14', '15'] as $box) {
            foreach ($this->groupCodeItems($data, $box) as $code => $entries) {
                $codeLabel = $code !== '' ? " Code {$code}" : '';

                // An All-in-One source override is an aggregate per box+code, so it replaces ALL raw
                // items of that code with one reviewed amount rather than overriding each in turn.
                $override = $this->sourceOverrideCents($data, sprintf('code:%s:%s', $box, $code));
                if ($override !== null) {
                    if ($override === 0) {
                        continue;
                    }
                    [$type, $review] = $this->routeK1Code($box, $code, $override, $reviewStatus);
                    $push($type, 'k1_code', "codes.{$box}.{$code}.override", "K-1 Box {$box}{$codeLabel} (reviewed override)", $override, $box, $code !== '' ? $code : null, $review);

                    continue;
                }

                foreach ($entries as $entry) {
                    $cents = $this->moneyToCents($entry['item']['value'] ?? null);
                    if ($cents === null || $cents === 0) {
                        continue;
                    }
                    [$type, $review] = $this->routeK1Code($box, $code, $cents, $reviewStatus);
                    $push($type, 'k1_code', "codes.{$box}.{$entry['index']}.value", "K-1 Box {$box}{$codeLabel}", $cents, $box, $code !== '' ? $code : null, $review);
                }
            }
        }
    }

    /**
     * Group a coded box's raw items by normalized (uppercased) code so source-value overrides,
     * which are keyed per box+code, can replace every raw row of a code at once.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, array<int, array{index: int|string, item: array<string, mixed>}>>
     */
    private function groupCodeItems(array $data, string $box): array
    {
        $items = is_array($data['codes'][$box] ?? null) ? $data['codes'][$box] : [];

        $byCode = [];
        foreach ($items as $index => $item) {
            if (! is_array($item)) {
                continue;
            }
            $byCode[strtoupper(trim((string) ($item['code'] ?? '')))][] = ['index' => $index, 'item' => $item];
        }

        return $byCode;
    }

    /**
     * Routing table for coded K-1 boxes → basis event type. Items whose basis treatment
     * cannot be determined from the parsed data (foreign taxes now reported on Schedule K-3,
     * §704(c) detail, AMT/credit codes) are recorded as memorandum and forced to
     * needs_review rather than silently adjusting basis.
     *
     * @return array{0: PartnershipBasisEventType, 1: string}
     */
    private function routeK1Code(string $box, string $code, int $cents, string $reviewStatus): array
    {
        return match ($box) {
            // Box 11 — other income (loss): distributive share, by sign.
            '11' => [$cents > 0 ? PartnershipBasisEventType::TaxableIncome : PartnershipBasisEventType::DeductibleLoss, $reviewStatus],
            // Box 13 — other deductions: reduce basis. Code W is commonly §754/§743(b) step-up
            // amortization, which is tracked as its own memorandum detail row (separate from the
            // other code-L portfolio deductions) so each §754 item carries its own amount and
            // source document for review. Every other code-L item is a basis deduction.
            '13' => $code === 'W'
                ? [PartnershipBasisEventType::Section754StepUpAmortization, 'needs_review']
                : [PartnershipBasisEventType::DeductibleLoss, $reviewStatus],
            // Box 18 — A tax-exempt income (↑), B nondeductible expenses (↓), C preproductive (review).
            '18' => match ($code) {
                'A' => [PartnershipBasisEventType::TaxExemptIncome, $reviewStatus],
                'B' => [PartnershipBasisEventType::NondeductibleExpense, $reviewStatus],
                default => [PartnershipBasisEventType::Memorandum, 'needs_review'],
            },
            // Box 16 foreign transactions live on Schedule K-3; box 17 AMT, box 14 SE earnings,
            // box 15 credits, and box 20 informational items do not adjust outside basis here.
            '16', '20' => [PartnershipBasisEventType::Memorandum, 'needs_review'],
            default => [PartnershipBasisEventType::Memorandum, $reviewStatus],
        };
    }

    /**
     * @return array{0: PartnershipBasisEventType, 1: string}
     */
    private function distributionTypeForCode(string $code): array
    {
        return match (strtoupper(trim($code))) {
            'B', 'C', 'G' => [PartnershipBasisEventType::PropertyDistributionBasis, sprintf('K-1 Box 19%s property distribution', strtoupper(trim($code)))],
            'D', 'E' => [PartnershipBasisEventType::DeemedDistributionLiabilityDecrease, sprintf('K-1 Box 19%s deemed liability distribution', strtoupper(trim($code)))],
            default => [PartnershipBasisEventType::CashDistribution, 'K-1 Box 19A cash distribution'],
        };
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  array<string, mixed>  $basis
     * @param  callable(PartnershipBasisEventType, string, string, string, int, ?string, ?string, string, array<string, mixed>=): void  $push
     */
    private function collectK1LiabilityEvent(array $data, array $basis, string $reviewStatus, callable $push): void
    {
        $liabilities = is_array($basis['liabilities'] ?? null) ? $basis['liabilities'] : [];
        $beginningRecourse = $this->moneyToCents($liabilities['beginningRecourse'] ?? null) ?? 0;
        $endingRecourse = $this->moneyToCents($liabilities['endingRecourse'] ?? null) ?? 0;
        $beginningQualified = $this->moneyToCents($liabilities['beginningQualifiedNonrecourse'] ?? null) ?? 0;
        $endingQualified = $this->moneyToCents($liabilities['endingQualifiedNonrecourse'] ?? null) ?? 0;
        $beginningNonrecourse = $this->moneyToCents($liabilities['beginningNonrecourse'] ?? null) ?? 0;
        $endingNonrecourse = $this->moneyToCents($liabilities['endingNonrecourse'] ?? null) ?? 0;
        $netLiabilityChange = ($endingRecourse + $endingQualified + $endingNonrecourse) - ($beginningRecourse + $beginningQualified + $beginningNonrecourse);
        $metadata = [
            'beginning_recourse_liability_cents' => $beginningRecourse,
            'ending_recourse_liability_cents' => $endingRecourse,
            'beginning_qualified_nonrecourse_liability_cents' => $beginningQualified,
            'ending_qualified_nonrecourse_liability_cents' => $endingQualified,
            'beginning_nonrecourse_liability_cents' => $beginningNonrecourse,
            'ending_nonrecourse_liability_cents' => $endingNonrecourse,
        ];
        if ($netLiabilityChange === 0) {
            if (array_sum(array_map('abs', $metadata)) > 0) {
                $push(
                    PartnershipBasisEventType::Memorandum,
                    'k1_field',
                    'basis.liabilities',
                    'K-1 liability share balances',
                    0,
                    null,
                    null,
                    $reviewStatus,
                    $metadata,
                );
            }

            return;
        }

        if ($netLiabilityChange < 0 && $this->hasExplicitBox19LiabilityDistribution($data)) {
            $push(
                PartnershipBasisEventType::Memorandum,
                'k1_field',
                'basis.liabilities',
                'K-1 liability share balances (decrease reported separately on Box 19)',
                0,
                null,
                null,
                $reviewStatus,
                array_merge($metadata, ['basis_effect_reported_by_box_19' => true]),
            );

            return;
        }

        $push(
            $netLiabilityChange > 0 ? PartnershipBasisEventType::LiabilityIncrease : PartnershipBasisEventType::LiabilityDecrease,
            'k1_field',
            'basis.liabilities',
            'K-1 liability share net change',
            $netLiabilityChange,
            null,
            null,
            $reviewStatus,
            $metadata,
        );
    }

    /** @param array<string, mixed> $data */
    private function hasExplicitBox19LiabilityDistribution(array $data): bool
    {
        foreach (['D', 'E'] as $code) {
            if ($this->hasNonZeroBox19LiabilityDistributionCode($data, $code)) {
                return true;
            }
        }

        return false;
    }

    /** @param array<string, mixed> $data */
    private function hasNonZeroBox19LiabilityDistributionCode(array $data, string $code): bool
    {
        $override = $this->sourceOverrideCents($data, "code:19:{$code}");
        if ($override !== null) {
            return $override !== 0;
        }

        $basis = is_array($data['basis'] ?? null) ? $data['basis'] : [];
        $distributions = is_array($basis['distributions'] ?? null) ? $basis['distributions'] : [];
        foreach ($distributions as $distribution) {
            if (! is_array($distribution) || strtoupper(trim((string) ($distribution['code'] ?? ''))) !== $code) {
                continue;
            }

            $cents = $this->moneyToCents($distribution['partnershipAdjustedBasis'] ?? null) ?? $this->moneyToCents($distribution['amount'] ?? null);
            if ($cents !== null && $cents !== 0) {
                return true;
            }
        }

        foreach ($this->groupCodeItems($data, '19')[$code] ?? [] as $entry) {
            $cents = $this->moneyToCents($entry['item']['value'] ?? null);
            if ($cents !== null && $cents !== 0) {
                return true;
            }
        }

        return false;
    }

    /**
     * Upsert (and prune) the K-1-sourced basis events for one document/link/year. Source
     * events present on a prior parse but absent now are deleted so re-extraction or edits
     * leave no ghost rows; amounts and review status are refreshed in place.
     *
     * @param  array<int, array<string, mixed>>  $sourceEvents
     */
    private function syncK1Events(FinPartnershipInterest $interest, FileForTaxDocument $document, ?TaxDocumentAccount $link, int $year, array $sourceEvents): void
    {
        $keptIds = [];
        foreach ($sourceEvents as $attributes) {
            $event = $this->upsertEvent($interest, [
                'tax_year' => $year,
                'source_type' => $attributes['source_type'],
                'tax_document_id' => $document->id,
                'tax_document_account_id' => $link?->id,
                'source_path' => $attributes['source_path'],
            ], $attributes);
            $keptIds[] = $event->id;
        }

        $this->pruneDocumentK1Events($interest->user_id, $document, $year, $keptIds, $link?->id, true);
    }

    /**
     * @param  int[]  $keptIds
     */
    private function pruneDocumentK1Events(int $userId, FileForTaxDocument $document, int $year, array $keptIds = [], ?int $linkId = null, bool $scopeToLink = false): void
    {
        FinPartnershipBasisEvent::query()
            ->where('user_id', $userId)
            ->where('tax_year', $year)
            ->where('tax_document_id', $document->id)
            ->whereIn('source_type', ['k1_field', 'k1_code'])
            ->when($scopeToLink, function ($query) use ($linkId): void {
                if ($linkId === null) {
                    $query->whereNull('tax_document_account_id');

                    return;
                }

                $query->where('tax_document_account_id', $linkId);
            })
            ->when($keptIds !== [], fn ($query) => $query->whereNotIn('id', $keptIds))
            ->delete();
    }

    /** @return Collection<int, FinPartnershipBasisEvent> */
    private function basisEventsForInterestYear(FinPartnershipInterest $interest, int $year): Collection
    {
        return FinPartnershipBasisEvent::query()
            ->where('user_id', $interest->user_id)
            ->where('partnership_interest_id', $interest->id)
            ->where('tax_year', $year)
            ->orderBy('event_order')
            ->orderBy('id')
            ->get();
    }

    /**
     * @param  array<string, mixed>  $identity
     * @param  array<string, mixed>  $attributes
     */
    private function upsertEvent(FinPartnershipInterest $interest, array $identity, array $attributes): FinPartnershipBasisEvent
    {
        // Identity fields are authoritative on the persisted row so the defaults (e.g. source_type
        // 'manual') never clobber the matching key and break a later updateOrCreate lookup.
        $values = array_merge($this->eventDefaults($interest), $attributes, $identity);

        /** @var FinPartnershipBasisEvent $event */
        $event = FinPartnershipBasisEvent::query()->updateOrCreate(
            array_merge(['user_id' => $interest->user_id, 'partnership_interest_id' => $interest->id], $identity),
            $values,
        );

        return $event;
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function appendEvent(FinPartnershipInterest $interest, array $attributes): FinPartnershipBasisEvent
    {
        /** @var FinPartnershipBasisEvent $event */
        $event = FinPartnershipBasisEvent::query()->create(array_merge($this->eventDefaults($interest), $attributes));

        return $event;
    }

    /**
     * @return array<string, mixed>
     */
    private function eventDefaults(FinPartnershipInterest $interest): array
    {
        return [
            'user_id' => $interest->user_id,
            'partnership_interest_id' => $interest->id,
            'event_order' => 0,
            'basis_side' => 'outside',
            'currency' => 'USD',
            'source_type' => 'manual',
            'review_status' => 'needs_review',
            'metadata' => [],
        ];
    }

    private function resolveManualInterest(FinAccounts $account, int $userId, ?int $interestId): FinPartnershipInterest
    {
        $query = FinPartnershipInterest::query()
            ->where('user_id', $userId)
            ->where('account_id', $account->acct_id);

        if ($interestId !== null) {
            /** @var FinPartnershipInterest $interest */
            $interest = (clone $query)->where('id', $interestId)->firstOrFail();

            return $interest;
        }

        $interests = $query->orderBy('id')->get();
        if ($interests->count() > 1) {
            throw ValidationException::withMessages([
                'partnership_interest_id' => 'This account holds more than one partnership interest; specify partnership_interest_id for the manual event.',
            ]);
        }

        $interest = $interests->first();
        if (! $interest instanceof FinPartnershipInterest) {
            throw ValidationException::withMessages([
                'partnership_interest_id' => 'No partnership interest exists for this account yet; initialize basis before adding manual events.',
            ]);
        }

        return $interest;
    }

    private function yearIsLocked(FinPartnershipInterest $interest, int $year): bool
    {
        return FinPartnershipBasisYear::query()
            ->where('user_id', $interest->user_id)
            ->where('partnership_interest_id', $interest->id)
            ->where('tax_year', $year)
            ->whereNotNull('locked_at')
            ->exists();
    }

    public function assertYearEditable(FinPartnershipInterest $interest, int $year): void
    {
        if ($this->yearIsLocked($interest, $year)) {
            throw ValidationException::withMessages([
                'tax_year' => "Tax year {$year} is locked for this partnership interest; unlock it before recording new events.",
            ]);
        }
    }

    /**
     * Event types that represent a capital contribution or a distribution — the
     * categories a bank-transaction candidate could duplicate against a K-1.
     *
     * @return array<int, string>
     */
    private function contributionDistributionEventTypes(): array
    {
        return [
            PartnershipBasisEventType::InitialCashContribution->value,
            PartnershipBasisEventType::InitialPropertyContributionBasis->value,
            PartnershipBasisEventType::CapitalContributionCash->value,
            PartnershipBasisEventType::CapitalContributionPropertyBasis->value,
            PartnershipBasisEventType::CashDistribution->value,
            PartnershipBasisEventType::PropertyDistributionBasis->value,
            PartnershipBasisEventType::MarketableSecuritiesDistribution->value,
            PartnershipBasisEventType::DeemedDistributionLiabilityDecrease->value,
            PartnershipBasisEventType::LiquidationDistributionCash->value,
            PartnershipBasisEventType::LiquidationDistributionProperty->value,
        ];
    }

    private function basisSideFor(PartnershipBasisEventType $type): string
    {
        return match ($type) {
            PartnershipBasisEventType::InitialTaxBasisCapital, PartnershipBasisEventType::InitialCapitalAccountValue,
            PartnershipBasisEventType::ManualIncreaseToTaxCapital, PartnershipBasisEventType::ManualDecreaseToTaxCapital,
            PartnershipBasisEventType::ManualIncreaseToBookCapital, PartnershipBasisEventType::ManualDecreaseToBookCapital => 'inside',
            // §754/§743(b) step-up amortization adjusts the partner's share of
            // inside basis in partnership assets and flows through income/loss
            // allocations; it is a memorandum detail with no direct outside-basis
            // effect, so it must not sit on the outside-basis side.
            PartnershipBasisEventType::Memorandum, PartnershipBasisEventType::ReconciliationAdjustment, PartnershipBasisEventType::ManualReconciliationNote, PartnershipBasisEventType::Section754StepUpAmortization => 'memorandum',
            PartnershipBasisEventType::PriorYearRollforward => 'both',
            default => 'outside',
        };
    }

    /** @param Collection<int, FinPartnershipBasisEvent> $events */
    private function hasLiquidationEvent(Collection $events): bool
    {
        return $events->contains(fn (FinPartnershipBasisEvent $event): bool => in_array($event->event_type, [
            PartnershipBasisEventType::LiquidationDistributionCash->value,
            PartnershipBasisEventType::LiquidationDistributionProperty->value,
            PartnershipBasisEventType::SaleExchange->value,
        ], true));
    }

    /** @param Collection<int, FinPartnershipBasisEvent> $events */
    private function hasSaleExchangeEvent(Collection $events): bool
    {
        return $events->contains(fn (FinPartnershipBasisEvent $event): bool => $event->event_type === PartnershipBasisEventType::SaleExchange->value);
    }

    /** @param Collection<int, FinPartnershipBasisEvent> $events */
    private function beginningOutsideBasisCents(Collection $events, ?FinPartnershipBasisYear $prior): int
    {
        $manual = $events->filter(fn (FinPartnershipBasisEvent $event): bool => $event->event_type === PartnershipBasisEventType::BeginningBasis->value)->last();
        if ($manual instanceof FinPartnershipBasisEvent) {
            return max(0, (int) $manual->amount_cents);
        }

        $carry = $events->first(fn (FinPartnershipBasisEvent $event): bool => $event->event_type === PartnershipBasisEventType::PriorYearRollforward->value);
        if ($carry instanceof FinPartnershipBasisEvent) {
            return max(0, (int) $carry->amount_cents);
        }

        return $prior instanceof FinPartnershipBasisYear ? max(0, (int) $prior->ending_outside_basis_cents) : 0;
    }

    /** @param Collection<int, FinPartnershipBasisEvent> $events */
    private function capitalBeginningCents(Collection $events, string $eventType, int $fallback = 0): int
    {
        $event = $events->filter(fn (FinPartnershipBasisEvent $basisEvent): bool => $basisEvent->event_type === $eventType)->last();

        return $event instanceof FinPartnershipBasisEvent ? (int) $event->amount_cents : $fallback;
    }

    /** @param Collection<int, FinPartnershipBasisEvent> $events */
    private function capitalBeginningNullableCents(Collection $events, string $eventType, ?int $fallback = null): ?int
    {
        $event = $events->filter(fn (FinPartnershipBasisEvent $basisEvent): bool => $basisEvent->event_type === $eventType)->last();

        return $event instanceof FinPartnershipBasisEvent ? (int) $event->amount_cents : $fallback;
    }

    /** @param Collection<int, FinPartnershipBasisEvent> $events */
    private function endingCapitalCents(Collection $events, int $beginning, string $kind): int
    {
        $metadataKey = $kind === 'book' ? 'ending_book_capital_cents' : 'ending_tax_basis_capital_cents';

        // Magnitudes (like the outside-basis rollforward) so a signed manual amount cannot flip a
        // decrease into an increase.
        $absSum = fn (array $eventTypes): int => (int) $events
            ->whereIn('event_type', $eventTypes)
            ->sum(fn (FinPartnershipBasisEvent $event): int => abs((int) $event->amount_cents));

        // Manual capital corrections always apply — even on top of a reported K-1 ending — so the
        // saved adjustment has the effect the UI advertises.
        $manualDelta = $kind === 'book'
            ? $absSum(['manual_increase_to_book_capital']) - $absSum(['manual_decrease_to_book_capital'])
            : $absSum(['manual_increase_to_tax_capital']) - $absSum(['manual_decrease_to_tax_capital']);

        // An explicit reported ending (from a K-1 / reconciliation event) wins for the non-manual
        // base; the manual correction layers on top.
        $explicitEnding = $events->filter(function (FinPartnershipBasisEvent $event) use ($metadataKey): bool {
            $metadata = $event->getAttribute('metadata');

            return is_array($metadata) && isset($metadata[$metadataKey]) && is_numeric($metadata[$metadataKey]);
        })->last();
        if ($explicitEnding instanceof FinPartnershipBasisEvent) {
            $metadata = $explicitEnding->getAttribute('metadata');

            return (int) $metadata[$metadataKey] + $manualDelta;
        }

        if ($kind === 'book') {
            // Book / §704(b) capital moves only on an explicit K-1 ending (handled above) or a
            // manual book-capital adjustment; nothing in the outside-basis rollforward touches it.
            return $beginning + $manualDelta;
        }

        // Tax-basis capital uses the same increase/decrease set as outside basis EXCEPT liability
        // share changes (which affect outside basis but not tax-basis capital). §179 and depletion
        // reduce capital even when basis-limited, so they must be subtracted here too. Manual
        // OUTSIDE-basis adjustments are intentionally excluded — they move outside basis only;
        // manual_*_to_tax_capital is the explicit lever for tax-basis capital.
        $currentYear = $absSum([
            'capital_contribution_cash',
            'capital_contribution_property_basis',
            'taxable_income',
            'tax_exempt_income',
            'manual_increase_to_tax_capital',
        ]) - $absSum([
            'cash_distribution',
            'property_distribution_basis',
            'marketable_securities_distribution',
            'deductible_loss',
            'nondeductible_expense',
            'foreign_tax',
            'section179',
            'depletion',
            'manual_decrease_to_tax_capital',
        ]);

        return $beginning + $currentYear;
    }

    /**
     * @param  Collection<int, FinPartnershipBasisEvent>  $events
     * @return array<string, int>
     */
    private function liabilityTotals(Collection $events): array
    {
        $totals = [
            'beginning_recourse_liability_cents' => 0,
            'ending_recourse_liability_cents' => 0,
            'beginning_nonrecourse_liability_cents' => 0,
            'ending_nonrecourse_liability_cents' => 0,
            'beginning_qualified_nonrecourse_liability_cents' => 0,
            'ending_qualified_nonrecourse_liability_cents' => 0,
        ];

        foreach ($events as $event) {
            $metadata = $event->getAttribute('metadata');
            if (! is_array($metadata)) {
                continue;
            }
            foreach ($totals as $key => $value) {
                if (isset($metadata[$key]) && is_numeric($metadata[$key])) {
                    $totals[$key] = (int) $metadata[$key];
                }
            }
        }

        return $totals;
    }

    /**
     * @return array<string, int>
     */
    private function emptyYearTotals(): array
    {
        return [
            'capital_contributions_cents' => 0,
            'taxable_income_increase_cents' => 0,
            'tax_exempt_income_increase_cents' => 0,
            'liability_increase_cents' => 0,
            'cash_distributions_cents' => 0,
            'property_distributions_basis_cents' => 0,
            'liability_decrease_cents' => 0,
            'deductions_losses_decrease_cents' => 0,
            'nondeductible_expenses_decrease_cents' => 0,
            'foreign_taxes_decrease_cents' => 0,
        ];
    }

    /** @param Collection<int, FinPartnershipBasisEvent> $events */
    private function reviewStatus(Collection $events, int $distributionGain, int $suspendedLoss, bool $hasLiquidation): string
    {
        // Excess distributions, suspended losses, and liquidation/sale events always warrant
        // human review (gain recognition and liquidation are conservative, review-only).
        if ($distributionGain > 0 || $suspendedLoss > 0 || $hasLiquidation) {
            return 'needs_review';
        }

        if ($events->contains(fn (FinPartnershipBasisEvent $event): bool => $event->review_status !== 'reviewed')) {
            return 'needs_review';
        }

        return 'reviewed';
    }

    /** @param Collection<int, FinPartnershipBasisEvent> $events */
    private function insideBasisConfidence(Collection $events): string
    {
        if ($events->contains(fn (FinPartnershipBasisEvent $event): bool => $event->event_type === 'initial_tax_basis_capital' && $event->source_type === 'manual')) {
            return 'manual';
        }

        if ($events->contains(fn (FinPartnershipBasisEvent $event): bool => $event->event_type === 'initial_tax_basis_capital')) {
            return 'reported';
        }

        return 'unknown';
    }

    /**
     * Liquidation / sale gain/loss is a review-only estimate. A sale or exchange realizes proceeds
     * plus liability relief less selling expenses against the outside basis immediately before sale.
     * With no sale proceeds it is recognized excess-distribution gain, or otherwise the remaining
     * outside basis as a candidate capital loss. The true result depends on the character of
     * property received, so the year is always flagged needs_review.
     *
     * @param  Collection<int, FinPartnershipBasisEvent>  $events
     */
    private function liquidationGainLossCents(Collection $events, int $endingOutside, int $distributionGain): ?int
    {
        if (! $this->hasLiquidationEvent($events)) {
            return null;
        }

        // A sale/exchange event is authoritative for amount realized, even when selling expenses exceed
        // proceeds plus liability relief and the amount realized is negative — that simply yields a
        // larger capital loss. Gate on the PRESENCE of a sale/exchange event, not on a positive amount
        // realized, so a legitimately negative amount realized flows through signed (matching the Form
        // 8949 row) rather than being dropped to the distribution/remaining-basis fallback.
        if ($this->hasSaleExchangeEvent($events)) {
            return $this->saleExchangeAmountRealizedTotalCents($events) - $endingOutside;
        }

        return $distributionGain > 0 ? $distributionGain : -$endingOutside;
    }

    /** @param Collection<int, FinPartnershipBasisEvent> $events */
    private function saleExchangeAmountRealizedTotalCents(Collection $events): int
    {
        return (int) $events
            ->where('event_type', PartnershipBasisEventType::SaleExchange->value)
            ->sum(fn (FinPartnershipBasisEvent $event): int => PartnershipBasisSaleExchangeMath::amountRealizedCents($event));
    }

    public function eventOrder(string $eventType): int
    {
        return match ($eventType) {
            'beginning_basis', 'prior_year_rollforward' => -100,
            'initial_cash_contribution', 'initial_property_contribution_basis', 'initial_capital_account_value', 'initial_tax_basis_capital' => -90,
            'capital_contribution_cash', 'capital_contribution_property_basis' => 10,
            'taxable_income', 'tax_exempt_income' => 20,
            'liability_increase' => 30,
            'cash_distribution', 'property_distribution_basis', 'marketable_securities_distribution' => 40,
            'liability_decrease', 'deemed_distribution_liability_decrease' => 50,
            'deductible_loss', 'section179', 'depletion', 'nondeductible_expense', 'foreign_tax' => 60,
            'suspended_loss_released' => 80,
            'sale_exchange', 'liquidation_distribution_cash', 'liquidation_distribution_property' => 70,
            'manual_increase_to_outside_basis' => 25,
            'manual_increase_to_tax_capital', 'manual_increase_to_book_capital' => 26,
            'manual_decrease_to_outside_basis' => 65,
            'manual_decrease_to_tax_capital', 'manual_decrease_to_book_capital' => 66,
            'manual_reconciliation_note', 'reconciliation_adjustment', 'memorandum' => 90,
            default => 100,
        };
    }

    private function preserveSignedAmount(PartnershipBasisEventType $type): bool
    {
        return in_array($type, [
            PartnershipBasisEventType::InitialTaxBasisCapital,
            PartnershipBasisEventType::InitialCapitalAccountValue,
            PartnershipBasisEventType::ReconciliationAdjustment,
            PartnershipBasisEventType::ManualReconciliationNote,
            PartnershipBasisEventType::Memorandum,
            PartnershipBasisEventType::SuspendedLossReleased,
        ], true);
    }

    /**
     * @param  array<string, mixed>  $capital
     */
    private function normalizedCapitalAccountMethod(array $capital): ?string
    {
        $method = $capital['method'] ?? null;
        if (! is_string($method) || trim($method) === '') {
            return null;
        }

        return strtolower(str_replace(['-', ' '], '_', trim($method)));
    }

    private function isTaxBasisCapitalMethod(?string $method): bool
    {
        return $method === null || in_array($method, ['tax', 'tax_basis', 'tax_basis_capital'], true);
    }

    private function upsertSuspendedLossReleaseEvent(FinPartnershipInterest $interest, int $year, int $amountCents, ?FinPartnershipBasisYear $prior): void
    {
        $this->upsertEvent($interest, [
            'tax_year' => $year,
            'source_type' => 'carryforward',
            'source_path' => self::SUSPENDED_LOSS_RELEASE_SOURCE_PATH,
        ], [
            'event_order' => $this->eventOrder(PartnershipBasisEventType::SuspendedLossReleased->value),
            'basis_side' => 'outside',
            'event_type' => PartnershipBasisEventType::SuspendedLossReleased->value,
            'amount_cents' => $amountCents,
            'source_label' => sprintf('%d released suspended loss from prior-year carryforward', $year),
            'review_status' => $prior instanceof FinPartnershipBasisYear && $prior->review_status === 'reviewed' ? 'reviewed' : 'needs_review',
            'metadata' => [
                'prior_basis_year_id' => $prior?->id,
                'released_suspended_loss_cents' => $amountCents,
            ],
        ]);
    }

    private function deleteSuspendedLossReleaseEvent(FinPartnershipInterest $interest, int $year): void
    {
        FinPartnershipBasisEvent::query()
            ->where('user_id', $interest->user_id)
            ->where('partnership_interest_id', $interest->id)
            ->where('tax_year', $year)
            ->where('source_type', 'carryforward')
            ->where('source_path', self::SUSPENDED_LOSS_RELEASE_SOURCE_PATH)
            ->delete();
    }

    /** @param array<string, mixed> $data */
    private function stringField(array $data, string $key): ?string
    {
        $value = $data['fields'][$key]['value'] ?? null;
        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        return trim(explode("\n", $value)[0]);
    }

    private function truthyFlag(mixed $value): bool
    {
        if (is_bool($value)) {
            return $value;
        }

        if (is_string($value)) {
            return in_array(strtolower(trim($value)), ['1', 'true', 'yes', 'x', 'checked'], true);
        }

        return (bool) $value;
    }

    private function normalizeEin(mixed $value): ?string
    {
        if (! is_string($value) && ! is_numeric($value)) {
            return null;
        }
        $digits = preg_replace('/\D+/', '', (string) $value);

        return $digits !== '' && $digits !== null ? $digits : null;
    }

    private function normalizeName(string $name): string
    {
        return strtolower(trim(preg_replace('/\s+/', ' ', $name) ?? $name));
    }

    private function mapFormType(string $formType): string
    {
        return match (strtoupper($formType)) {
            'K-1-1065', '1065' => 'k1_1065',
            'K-1-1120S', '1120S' => 'k1_1120s',
            'K-1-1041', '1041' => 'k1_1041',
            default => 'other',
        };
    }

    private function dateToString(DateTimeInterface|string|null $value): ?string
    {
        return $value === null ? null : CarbonImmutable::parse($value)->toDateString();
    }

    /**
     * Reviewed All-in-One source value for a K-1 key (e.g. `field:1`, `code:13:W`), in cents, or
     * null when there is no override. Mirrors the override helpers the other tax-fact builders use
     * so the basis rollforward reflects corrected K-1 values instead of the raw extraction.
     *
     * @param  array<string, mixed>  $data
     */
    private function sourceOverrideCents(array $data, string $key): ?int
    {
        $overrides = $data['sourceValueOverrides'] ?? null;
        if (! is_array($overrides)) {
            return null;
        }

        $override = $overrides[$key] ?? null;
        if (! is_array($override) || ! array_key_exists('value', $override)) {
            return null;
        }

        return $this->moneyToCents($override['value']);
    }

    /**
     * Override-aware read of a flat K-1 box value, in cents.
     *
     * @param  array<string, mixed>  $data
     */
    private function k1FieldCents(array $data, string $box): ?int
    {
        return $this->sourceOverrideCents($data, "field:{$box}") ?? $this->moneyToCents($data['fields'][$box]['value'] ?? null);
    }

    /**
     * Extract the total foreign-taxes-paid/accrued amount from K-3 Part III Section 4
     * (sectionId = 'part3_section4') and return it in cents, or null when the K-3 section
     * is absent or the amount cannot be parsed. Returns null (not zero) so callers can
     * distinguish "not present" from "explicitly zero".
     *
     * @param  array<string, mixed>  $data
     */
    private function k3ForeignTaxCents(array $data): ?int
    {
        // A reviewer correction to the K-3 foreign-tax total must win over the
        // raw extraction, mirroring Form1116FactsBuilder, so outside basis and
        // Form 1116 stay aligned after the override.
        $override = $this->sourceOverrideCents($data, 'k3:foreign-tax-total');
        if ($override !== null) {
            return $override;
        }

        $sections = $data['k3']['sections'] ?? null;
        if (! is_array($sections)) {
            return null;
        }

        $sectionData = null;
        foreach ($sections as $section) {
            if (is_array($section) && ($section['sectionId'] ?? null) === 'part3_section4' && is_array($section['data'] ?? null)) {
                $sectionData = $section['data'];
                break;
            }
        }

        if ($sectionData === null) {
            return null;
        }

        // Prefer the top-level pre-computed total / country list (the shape
        // emitted by K3SectionAssembler).
        $cents = $this->k3ForeignTaxCentsFromTaxData($sectionData);
        if ($cents !== null) {
            return $cents;
        }

        // Fall back to the canonical nested shape, where the totals live under a
        // foreign-tax sub-object (e.g. data.line1_foreignTaxesPaid.grandTotalUSD
        // / .countries), mirroring how Form1116FactsBuilder reads K-3 Part III
        // Section 4. Without this, a nested-only payload yields no foreign_tax
        // basis-decrease event and outside basis is overstated.
        foreach ($sectionData as $key => $value) {
            if (! is_array($value)) {
                continue;
            }
            if (! str_contains((string) $key, 'foreignTax') && ! str_contains((string) $key, 'foreign_tax')) {
                continue;
            }
            $cents = $this->k3ForeignTaxCentsFromTaxData($value);
            if ($cents !== null) {
                return $cents;
            }
        }

        return null;
    }

    /**
     * Extract foreign-tax cents from a K-3 tax-data array, preferring the
     * pre-computed grandTotalUSD and falling back to summing per-country amounts.
     *
     * @param  array<string, mixed>  $taxData
     */
    private function k3ForeignTaxCentsFromTaxData(array $taxData): ?int
    {
        $grandTotal = $taxData['grandTotalUSD'] ?? null;
        if (is_numeric($grandTotal) && (float) $grandTotal !== 0.0) {
            return $this->moneyToCents($grandTotal);
        }

        if (is_array($taxData['countries'] ?? null)) {
            $total = 0.0;
            foreach ($taxData['countries'] as $country) {
                if (! is_array($country)) {
                    continue;
                }
                $amount = $country['amount_usd'] ?? $country['total'] ?? $country['passiveForeign'] ?? null;
                if (is_numeric($amount)) {
                    $total += (float) $amount;
                }
            }

            return $total !== 0.0 ? $this->moneyToCents($total) : null;
        }

        return null;
    }

    private function moneyToCents(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_int($value) || is_float($value)) {
            return MoneyMath::toCents($value);
        }

        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);
        if ($trimmed === '') {
            return null;
        }

        $negative = str_starts_with($trimmed, '(') && str_ends_with($trimmed, ')');
        $normalized = str_replace([',', '$', '(', ')'], '', $trimmed);
        if (! is_numeric($normalized)) {
            return null;
        }

        $cents = MoneyMath::toCents($normalized);

        return $negative ? -abs($cents) : $cents;
    }
}
