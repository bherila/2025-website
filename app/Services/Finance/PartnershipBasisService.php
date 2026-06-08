<?php

namespace App\Services\Finance;

use App\Enums\Finance\PartnershipBasisEventType;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinPartnershipBasisEvent;
use App\Models\FinanceTool\FinPartnershipBasisYear;
use App\Models\FinanceTool\FinPartnershipInterest;
use App\Models\FinanceTool\TaxDocumentAccount;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class PartnershipBasisService
{
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
                ->where('tax_year', $year)
                ->where('form_type', 'k1')
                ->get()
                ->each(fn (FileForTaxDocument $document): FinPartnershipInterest => $this->syncK1Document($document, $userId, $year));
        }

        /** @var EloquentCollection<int, FinPartnershipInterest> $interests */
        $interests = FinPartnershipInterest::query()
            ->where('user_id', $userId)
            ->where(function ($query) use ($year): void {
                $query->whereHas('basisEvents', fn ($events) => $events->where('tax_year', $year))
                    ->orWhereHas('basisYears', fn ($basisYears) => $basisYears->where('tax_year', $year));
            })
            ->with(['basisEvents' => fn ($events) => $events->where('tax_year', $year)->orderBy('event_order')->orderBy('id')])
            ->get();

        return $interests->map(fn (FinPartnershipInterest $interest): FinPartnershipBasisYear => $this->recomputeInterestYear($interest, $year));
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
                'review_status' => $prior->review_status === 'locked' ? 'reviewed' : 'needs_review',
                'metadata' => ['prior_basis_year_id' => $prior->id],
            ]);
        }

        $events = FinPartnershipBasisEvent::query()
            ->where('user_id', $interest->user_id)
            ->where('partnership_interest_id', $interest->id)
            ->where('tax_year', $year)
            ->orderBy('event_order')
            ->orderBy('id')
            ->get();

        $beginningOutside = $this->beginningOutsideBasisCents($events, $prior);
        $beginningTaxCapital = $this->capitalBeginningCents($events, 'initial_tax_basis_capital');
        $beginningBookCapital = $this->capitalBeginningCents($events, 'initial_capital_account_value');
        $beginningInside = $this->capitalBeginningNullableCents($events, 'initial_tax_basis_capital');
        $liabilities = $this->liabilityTotals($events);

        $totals = $this->emptyYearTotals();
        $availableOutsideBasis = $beginningOutside;
        $distributionGain = 0;
        $suspendedLoss = 0;

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
        $endingInside = $endingTaxCapital !== 0 ? $endingTaxCapital : $beginningInside;
        $hasLiquidation = $this->hasLiquidationEvent($events);
        $reviewStatus = $this->reviewStatus($events, $distributionGain, $suspendedLoss, $hasLiquidation);
        $liquidationGainLoss = $this->liquidationGainLossCents($events, $availableOutsideBasis, $distributionGain);

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
     * @param  array<string, mixed>  $payload
     */
    public function initializeAccount(FinAccounts $account, int $userId, array $payload): FinPartnershipBasisYear
    {
        $year = (int) $payload['tax_year'];
        $interest = $this->findOrCreateInterest($userId, $account->acct_id, null, (string) ($payload['partnership_name'] ?? $account->acct_name), 'other', null, null, null);
        $this->assertYearEditable($interest, $year);

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

        return $this->recomputeInterestYear($interest, $year);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function createManualEvent(FinAccounts $account, int $userId, array $payload): FinPartnershipBasisEvent
    {
        $year = (int) $payload['tax_year'];
        $interest = $this->resolveManualInterest($account, $userId, isset($payload['partnership_interest_id']) ? (int) $payload['partnership_interest_id'] : null);
        $this->assertYearEditable($interest, $year);

        // Manual events are append-only: two manual events of the same type/year are
        // distinct rows, never collapsed into one.
        $event = $this->appendEvent($interest, array_merge($payload, [
            'source_type' => $payload['source_type'] ?? 'manual',
            'account_id' => $account->acct_id,
        ]));

        $this->recomputeInterestYear($interest, $year);

        return $event;
    }

    public function lockAccountYear(FinAccounts $account, int $userId, int $year): ?FinPartnershipBasisYear
    {
        $basisYear = FinPartnershipBasisYear::query()
            ->where('user_id', $userId)
            ->where('tax_year', $year)
            ->whereHas('partnershipInterest', fn ($query) => $query->where('account_id', $account->acct_id))
            ->first();

        if (! $basisYear instanceof FinPartnershipBasisYear) {
            return null;
        }

        $basisYear->update(['review_status' => 'locked', 'locked_at' => now()]);

        return $basisYear;
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

    private function syncK1Document(FileForTaxDocument $document, int $userId, int $year): FinPartnershipInterest
    {
        $data = is_array($document->parsed_data) ? $document->parsed_data : [];
        $link = $document->accountLinks->first(fn ($candidate): bool => $candidate instanceof TaxDocumentAccount && (int) $candidate->tax_year === $year);
        $accountId = $link instanceof TaxDocumentAccount ? $link->account_id : $document->account_id;
        $interest = $this->findOrCreateInterest(
            $userId,
            $accountId,
            // Box A is the partnership EIN, Box B is the partnership name/address, Box D is
            // the publicly-traded-partnership flag (per the K-1 spec used across the app).
            $this->normalizeEin($data['fields']['A']['value'] ?? null),
            $this->stringField($data, 'B') ?? $this->stringField($data, 'A') ?? 'Partnership',
            $this->mapFormType((string) ($data['formType'] ?? 'K-1-1065')),
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

    private function findOrCreateInterest(int $userId, ?int $accountId, ?string $ein, string $name, string $formType, ?FileForTaxDocument $document, ?TaxDocumentAccount $link, ?bool $isPtp = null): FinPartnershipInterest
    {
        $normalizedName = $this->normalizeName($name);

        // Lock the matching window so concurrent K-1 syncs cannot both miss and create a
        // duplicate when EIN is absent (the unique index does not cover NULL EINs).
        return DB::transaction(function () use ($userId, $accountId, $ein, $name, $normalizedName, $formType, $document, $link, $isPtp): FinPartnershipInterest {
            $query = FinPartnershipInterest::query()
                ->where('user_id', $userId)
                ->where('account_id', $accountId)
                ->lockForUpdate();
            if ($ein !== null) {
                $query->where('partnership_ein', $ein);
            } else {
                $query->whereNull('partnership_ein')->where('normalized_partnership_name', $normalizedName);
            }

            $interest = $query->first();
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
                'amount_cents' => abs($amountCents),
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
            $cents = $this->moneyToCents($data['fields'][$box]['value'] ?? null);
            if ($cents === null || $cents === 0) {
                continue;
            }
            $type = $cents > 0 ? PartnershipBasisEventType::TaxableIncome : PartnershipBasisEventType::DeductibleLoss;
            $push($type, 'k1_field', "fields.{$box}.value", "K-1 Box {$box}", $cents, $box, null, $reviewStatus);
        }

        // ── Guaranteed payments: count once (4c else 4a+4b else 4). Guaranteed payments are
        //    ordinary income to the partner but are NOT a distributive share and do not adjust
        //    outside basis (IRC §707(c)), so they are recorded as a memorandum only. ──
        $gp = $this->moneyToCents($data['fields']['4c']['value'] ?? null);
        if ($gp === null || $gp === 0) {
            $gp4a = $this->moneyToCents($data['fields']['4a']['value'] ?? null) ?? 0;
            $gp4b = $this->moneyToCents($data['fields']['4b']['value'] ?? null) ?? 0;
            $gp = ($gp4a + $gp4b) ?: ($this->moneyToCents($data['fields']['4']['value'] ?? null) ?? 0);
        }
        if ($gp !== 0) {
            $push(PartnershipBasisEventType::Memorandum, 'k1_field', 'fields.4.guaranteed_payments', 'K-1 guaranteed payments (income; no outside-basis effect)', $gp, '4', null, $reviewStatus);
        }

        // ── Section 179 deduction (Box 12) — reduces basis ──
        $box12 = $this->moneyToCents($data['fields']['12']['value'] ?? null);
        if ($box12 !== null && $box12 !== 0) {
            $push(PartnershipBasisEventType::Section179, 'k1_field', 'fields.12.value', 'K-1 Box 12 Section 179 deduction', $box12, '12', null, $reviewStatus);
        }

        // ── Coded boxes ──
        $this->collectK1CodedEvents($data, $reviewStatus, $push);

        // ── Distributions: choose ONE source to avoid double counting. Priority:
        //    normalized basis.distributions → Box 19 codes → capital-account withdrawals. ──
        if ($normalizedDistributions !== []) {
            foreach ($normalizedDistributions as $index => $distribution) {
                if (! is_array($distribution)) {
                    continue;
                }
                $cents = $this->moneyToCents($distribution['partnershipAdjustedBasis'] ?? null) ?? $this->moneyToCents($distribution['amount'] ?? null);
                if ($cents === null || $cents === 0) {
                    continue;
                }
                [$type, $label] = $this->distributionTypeForCode((string) ($distribution['code'] ?? 'A'));
                $push($type, 'k1_code', "basis.distributions.{$index}", $label, $cents, '19', (string) ($distribution['code'] ?? ''), $reviewStatus);
            }
        } elseif (is_array($data['codes']['19'] ?? null) && $data['codes']['19'] !== []) {
            foreach ($data['codes']['19'] as $index => $item) {
                if (! is_array($item)) {
                    continue;
                }
                $cents = $this->moneyToCents($item['value'] ?? null);
                if ($cents === null || $cents === 0) {
                    continue;
                }
                [$type, $label] = $this->distributionTypeForCode((string) ($item['code'] ?? 'A'));
                $push($type, 'k1_code', "codes.19.{$index}.value", $label, $cents, '19', (string) ($item['code'] ?? ''), $reviewStatus);
            }
        } else {
            $withdrawals = $this->moneyToCents($capital['withdrawalsAndDistributions'] ?? null);
            if ($withdrawals !== null && $withdrawals !== 0) {
                $push(PartnershipBasisEventType::CashDistribution, 'k1_field', 'basis.capitalAccount.withdrawalsAndDistributions', 'K-1 capital account withdrawals & distributions', $withdrawals, '19', null, $reviewStatus);
            }
        }

        // ── Capital-account analysis (inside / book capital seeds + reconciliation only) ──
        $beginningCapital = $this->moneyToCents($capital['beginningCapital'] ?? null);
        if ($beginningCapital !== null && $beginningCapital !== 0) {
            $push(PartnershipBasisEventType::InitialTaxBasisCapital, 'k1_field', 'basis.capitalAccount.beginningCapital', 'K-1 beginning capital account', $beginningCapital, null, null, $reviewStatus);
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
        $this->collectK1LiabilityEvent($basis, $reviewStatus, $push);

        return array_values($events);
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  callable(PartnershipBasisEventType, string, string, string, int, ?string, ?string, string, array<string, mixed>=): void  $push
     */
    private function collectK1CodedEvents(array $data, string $reviewStatus, callable $push): void
    {
        foreach (['11', '13', '16', '17', '18', '20', '14', '15'] as $box) {
            $items = is_array($data['codes'][$box] ?? null) ? $data['codes'][$box] : [];
            foreach ($items as $index => $item) {
                if (! is_array($item)) {
                    continue;
                }
                $cents = $this->moneyToCents($item['value'] ?? null);
                if ($cents === null || $cents === 0) {
                    continue;
                }
                $code = strtoupper(trim((string) ($item['code'] ?? '')));
                [$type, $review] = $this->routeK1Code($box, $code, $cents, $reviewStatus);
                $label = "K-1 Box {$box}".($code !== '' ? " Code {$code}" : '');
                $push($type, 'k1_code', "codes.{$box}.{$index}.value", $label, $cents, $box, $code !== '' ? $code : null, $review);
            }
        }
    }

    /**
     * Routing table for coded K-1 boxes → basis event type. Items whose basis treatment
     * cannot be determined from the parsed data (foreign taxes now reported on Schedule K-3,
     * §754/§704(c) detail, AMT/credit codes) are recorded as memorandum and forced to
     * needs_review rather than silently adjusting basis.
     *
     * @return array{0: PartnershipBasisEventType, 1: string}
     */
    private function routeK1Code(string $box, string $code, int $cents, string $reviewStatus): array
    {
        return match ($box) {
            // Box 11 — other income (loss): distributive share, by sign.
            '11' => [$cents > 0 ? PartnershipBasisEventType::TaxableIncome : PartnershipBasisEventType::DeductibleLoss, $reviewStatus],
            // Box 13 — other deductions: reduce basis. Code W is commonly §754 amortization,
            // for which we have no schedule of detail → memorandum / needs_review.
            '13' => $code === 'W'
                ? [PartnershipBasisEventType::Memorandum, 'needs_review']
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
            'B' => [PartnershipBasisEventType::PropertyDistributionBasis, 'K-1 Box 19B property distribution'],
            // 19C is guaranteed payments distributed — not a basis distribution.
            'C' => [PartnershipBasisEventType::Memorandum, 'K-1 Box 19C guaranteed payments (no outside-basis effect)'],
            default => [PartnershipBasisEventType::CashDistribution, 'K-1 Box 19A cash distribution'],
        };
    }

    /**
     * @param  array<string, mixed>  $basis
     * @param  callable(PartnershipBasisEventType, string, string, string, int, ?string, ?string, string, array<string, mixed>=): void  $push
     */
    private function collectK1LiabilityEvent(array $basis, string $reviewStatus, callable $push): void
    {
        $liabilities = is_array($basis['liabilities'] ?? null) ? $basis['liabilities'] : [];
        $beginningRecourse = $this->moneyToCents($liabilities['beginningRecourse'] ?? null) ?? 0;
        $endingRecourse = $this->moneyToCents($liabilities['endingRecourse'] ?? null) ?? 0;
        $beginningQualified = $this->moneyToCents($liabilities['beginningQualifiedNonrecourse'] ?? null) ?? 0;
        $endingQualified = $this->moneyToCents($liabilities['endingQualifiedNonrecourse'] ?? null) ?? 0;
        $beginningNonrecourse = $this->moneyToCents($liabilities['beginningNonrecourse'] ?? null) ?? 0;
        $endingNonrecourse = $this->moneyToCents($liabilities['endingNonrecourse'] ?? null) ?? 0;
        $netLiabilityChange = ($endingRecourse + $endingQualified + $endingNonrecourse) - ($beginningRecourse + $beginningQualified + $beginningNonrecourse);
        if ($netLiabilityChange === 0) {
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
            [
                'beginning_recourse_liability_cents' => $beginningRecourse,
                'ending_recourse_liability_cents' => $endingRecourse,
                'beginning_qualified_nonrecourse_liability_cents' => $beginningQualified,
                'ending_qualified_nonrecourse_liability_cents' => $endingQualified,
                'beginning_nonrecourse_liability_cents' => $beginningNonrecourse,
                'ending_nonrecourse_liability_cents' => $endingNonrecourse,
            ],
        );
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

        FinPartnershipBasisEvent::query()
            ->where('user_id', $interest->user_id)
            ->where('partnership_interest_id', $interest->id)
            ->where('tax_year', $year)
            ->where('tax_document_id', $document->id)
            ->when($link instanceof TaxDocumentAccount, fn ($query) => $query->where('tax_document_account_id', $link->id), fn ($query) => $query->whereNull('tax_document_account_id'))
            ->whereIn('source_type', ['k1_field', 'k1_code'])
            ->whereNotIn('id', $keptIds !== [] ? $keptIds : [0])
            ->delete();
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

    private function basisSideFor(PartnershipBasisEventType $type): string
    {
        return match ($type) {
            PartnershipBasisEventType::InitialTaxBasisCapital, PartnershipBasisEventType::InitialCapitalAccountValue => 'inside',
            PartnershipBasisEventType::Memorandum, PartnershipBasisEventType::ReconciliationAdjustment => 'memorandum',
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
    private function beginningOutsideBasisCents(Collection $events, ?FinPartnershipBasisYear $prior): int
    {
        $manual = $events->first(fn (FinPartnershipBasisEvent $event): bool => $event->event_type === PartnershipBasisEventType::BeginningBasis->value);
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
    private function capitalBeginningCents(Collection $events, string $eventType): int
    {
        $event = $events->first(fn (FinPartnershipBasisEvent $basisEvent): bool => $basisEvent->event_type === $eventType);

        return $event instanceof FinPartnershipBasisEvent ? (int) $event->amount_cents : 0;
    }

    /** @param Collection<int, FinPartnershipBasisEvent> $events */
    private function capitalBeginningNullableCents(Collection $events, string $eventType): ?int
    {
        $event = $events->first(fn (FinPartnershipBasisEvent $basisEvent): bool => $basisEvent->event_type === $eventType);

        return $event instanceof FinPartnershipBasisEvent ? (int) $event->amount_cents : null;
    }

    /** @param Collection<int, FinPartnershipBasisEvent> $events */
    private function endingCapitalCents(Collection $events, int $beginning, string $kind): int
    {
        if ($kind === 'book') {
            return $beginning;
        }

        $currentYear = $events->whereIn('event_type', ['capital_contribution_cash', 'capital_contribution_property_basis', 'taxable_income', 'tax_exempt_income'])->sum('amount_cents')
            - $events->whereIn('event_type', ['cash_distribution', 'property_distribution_basis', 'deductible_loss', 'nondeductible_expense', 'foreign_tax'])->sum('amount_cents');

        return max(0, $beginning + (int) $currentYear);
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
     * Liquidation gain/loss is a review-only estimate: gain equals recognized excess-distribution
     * gain; otherwise the remaining outside basis is a candidate capital loss. The true result
     * depends on the character of property received, so the year is always flagged needs_review.
     *
     * @param  Collection<int, FinPartnershipBasisEvent>  $events
     */
    private function liquidationGainLossCents(Collection $events, int $endingOutside, int $distributionGain): ?int
    {
        if (! $this->hasLiquidationEvent($events)) {
            return null;
        }

        return $distributionGain > 0 ? $distributionGain : -$endingOutside;
    }

    private function eventOrder(string $eventType): int
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
            'sale_exchange', 'liquidation_distribution_cash', 'liquidation_distribution_property' => 70,
            'reconciliation_adjustment', 'memorandum' => 90,
            default => 100,
        };
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
