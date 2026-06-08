<?php

namespace App\Services\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinPartnershipBasisEvent;
use App\Models\FinanceTool\FinPartnershipBasisYear;
use App\Models\FinanceTool\FinPartnershipInterest;
use App\Models\FinanceTool\TaxDocumentAccount;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

class PartnershipBasisService
{
    /** @var array<string, string> */
    private const INCREASE_EVENT_COLUMNS = [
        'initial_cash_contribution' => 'capital_contributions_cents',
        'initial_property_contribution_basis' => 'capital_contributions_cents',
        'capital_contribution_cash' => 'capital_contributions_cents',
        'capital_contribution_property_basis' => 'capital_contributions_cents',
        'taxable_income' => 'taxable_income_increase_cents',
        'tax_exempt_income' => 'tax_exempt_income_increase_cents',
        'liability_increase' => 'liability_increase_cents',
    ];

    /** @var array<string, string> */
    private const DECREASE_EVENT_COLUMNS = [
        'cash_distribution' => 'cash_distributions_cents',
        'property_distribution_basis' => 'property_distributions_basis_cents',
        'marketable_securities_distribution' => 'property_distributions_basis_cents',
        'deemed_distribution_liability_decrease' => 'liability_decrease_cents',
        'liability_decrease' => 'liability_decrease_cents',
        'deductible_loss' => 'deductions_losses_decrease_cents',
        'section179' => 'deductions_losses_decrease_cents',
        'depletion' => 'deductions_losses_decrease_cents',
        'nondeductible_expense' => 'nondeductible_expenses_decrease_cents',
        'foreign_tax' => 'foreign_taxes_decrease_cents',
        'liquidation_distribution_cash' => 'cash_distributions_cents',
        'liquidation_distribution_property' => 'property_distributions_basis_cents',
    ];

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
            $this->recordEvent($interest, [
                'tax_year' => $year,
                'event_order' => -100,
                'basis_side' => 'both',
                'event_type' => 'prior_year_rollforward',
                'amount_cents' => $prior->ending_outside_basis_cents,
                'source_type' => 'carryforward',
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
            if (in_array($event->event_type, ['beginning_basis', 'prior_year_rollforward'], true)) {
                continue;
            }

            $amount = abs((int) $event->amount_cents);
            if (isset(self::INCREASE_EVENT_COLUMNS[$event->event_type])) {
                $totals[self::INCREASE_EVENT_COLUMNS[$event->event_type]] += $amount;
                $availableOutsideBasis += $amount;

                continue;
            }

            if (! isset(self::DECREASE_EVENT_COLUMNS[$event->event_type])) {
                continue;
            }

            $column = self::DECREASE_EVENT_COLUMNS[$event->event_type];
            $totals[$column] += $amount;

            if (in_array($event->event_type, ['cash_distribution', 'property_distribution_basis', 'marketable_securities_distribution', 'deemed_distribution_liability_decrease', 'liability_decrease', 'liquidation_distribution_cash', 'liquidation_distribution_property'], true)) {
                $basisReduction = min($availableOutsideBasis, $amount);
                $availableOutsideBasis -= $basisReduction;
                $distributionGain += $amount - $basisReduction;
            } else {
                $basisReduction = min($availableOutsideBasis, $amount);
                $availableOutsideBasis -= $basisReduction;
                $suspendedLoss += $amount - $basisReduction;
            }
        }

        $endingTaxCapital = $this->endingCapitalCents($events, $beginningTaxCapital, 'tax_basis');
        $endingBookCapital = $this->endingCapitalCents($events, $beginningBookCapital, 'book');
        $endingInside = $endingTaxCapital !== 0 ? $endingTaxCapital : $beginningInside;
        $reviewStatus = $this->reviewStatus($events, $distributionGain, $suspendedLoss);
        $liquidationGainLoss = $this->liquidationGainLossCents($events, $beginningOutside, $availableOutsideBasis, $distributionGain);

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
        $interest = $this->findOrCreateInterest($userId, $account->acct_id, null, (string) ($payload['partnership_name'] ?? $account->acct_name), 'other', null, null);

        foreach ([
            'initial_cash_contribution_cents' => 'initial_cash_contribution',
            'initial_property_contribution_adjusted_basis_cents' => 'initial_property_contribution_basis',
            'initial_tax_basis_capital_cents' => 'initial_tax_basis_capital',
            'initial_book_capital_or_fmv_cents' => 'initial_capital_account_value',
            'initial_outside_basis_override_cents' => 'beginning_basis',
        ] as $key => $eventType) {
            if (! array_key_exists($key, $payload) || $payload[$key] === null) {
                continue;
            }

            $this->recordEvent($interest, [
                'tax_year' => $year,
                'event_order' => $eventType === 'beginning_basis' ? -200 : -150,
                'basis_side' => in_array($eventType, ['initial_tax_basis_capital', 'initial_capital_account_value'], true) ? 'inside' : 'outside',
                'event_type' => $eventType,
                'amount_cents' => (int) $payload[$key],
                'source_type' => 'manual',
                'account_id' => $account->acct_id,
                'source_path' => $key,
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
        $interest = FinPartnershipInterest::query()
            ->where('user_id', $userId)
            ->where('account_id', $account->acct_id)
            ->firstOrFail();

        $event = $this->recordEvent($interest, array_merge($payload, [
            'source_type' => $payload['source_type'] ?? 'manual',
            'account_id' => $account->acct_id,
        ]));

        $this->recomputeInterestYear($interest, (int) $payload['tax_year']);

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
        $events = $interest->relationLoaded('basisEvents') ? $interest->basisEvents : collect();

        return [
            'id' => $basisYear->id,
            'interestId' => $basisYear->partnership_interest_id,
            'partnershipName' => $interest->partnership_name,
            'partnershipEin' => $interest->partnership_ein,
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
            $this->normalizeEin($data['fields']['D']['value'] ?? null),
            $this->stringField($data, 'A') ?? $this->stringField($data, 'B') ?? 'Partnership',
            $this->mapFormType((string) ($data['formType'] ?? 'K-1-1065')),
            $document,
            $link instanceof TaxDocumentAccount ? $link : null,
        );

        $reviewStatus = ($link instanceof TaxDocumentAccount ? $link->is_reviewed : $document->is_reviewed) ? 'reviewed' : 'needs_review';
        $this->syncK1BasisData($interest, $document, $link instanceof TaxDocumentAccount ? $link : null, $data, $year, $reviewStatus);
        $this->syncK1IncomeAndDeductions($interest, $document, $link instanceof TaxDocumentAccount ? $link : null, $data, $year, $reviewStatus);

        return $interest;
    }

    private function findOrCreateInterest(int $userId, ?int $accountId, ?string $ein, string $name, string $formType, ?FileForTaxDocument $document, ?TaxDocumentAccount $link): FinPartnershipInterest
    {
        $normalizedName = $this->normalizeName($name);
        $query = FinPartnershipInterest::query()->where('user_id', $userId)->where('account_id', $accountId);
        if ($ein !== null) {
            $query->where('partnership_ein', $ein);
        } else {
            $query->where('normalized_partnership_name', $normalizedName);
        }

        /** @var FinPartnershipInterest $interest */
        $interest = $query->firstOrCreate([], [
            'user_id' => $userId,
            'account_id' => $accountId,
            'partnership_ein' => $ein,
            'partnership_name' => $name,
            'normalized_partnership_name' => $normalizedName,
            'form_type' => $formType,
            'source_tax_document_id' => $document?->id,
            'source_tax_document_account_id' => $link?->id,
            'metadata' => [],
        ]);

        $interest->fill([
            'partnership_name' => $interest->partnership_name ?: $name,
            'normalized_partnership_name' => $interest->normalized_partnership_name ?: $normalizedName,
            'source_tax_document_id' => $interest->source_tax_document_id ?: $document?->id,
            'source_tax_document_account_id' => $interest->source_tax_document_account_id ?: $link?->id,
        ])->save();

        return $interest;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function syncK1BasisData(FinPartnershipInterest $interest, FileForTaxDocument $document, ?TaxDocumentAccount $link, array $data, int $year, string $reviewStatus): void
    {
        $basis = is_array($data['basis'] ?? null) ? $data['basis'] : [];
        $capital = is_array($basis['capitalAccount'] ?? null) ? $basis['capitalAccount'] : [];
        $liabilities = is_array($basis['liabilities'] ?? null) ? $basis['liabilities'] : [];
        $worksheet = is_array($basis['outsideBasisWorksheet'] ?? null) ? $basis['outsideBasisWorksheet'] : [];
        $distributions = is_array($basis['distributions'] ?? null) ? $basis['distributions'] : [];

        foreach ([
            'beginningCapital' => 'initial_tax_basis_capital',
            'capitalContributedDuringYear' => 'capital_contribution_cash',
            'currentYearNetIncomeLoss' => null,
            'withdrawalsAndDistributions' => 'cash_distribution',
            'endingCapital' => null,
        ] as $key => $eventType) {
            $amount = $this->moneyToCents($capital[$key] ?? null);
            if ($amount === null || $amount === 0) {
                continue;
            }

            if ($key === 'currentYearNetIncomeLoss') {
                $eventType = $amount >= 0 ? 'taxable_income' : 'deductible_loss';
            }

            $this->recordK1Event($interest, $document, $link, $year, $eventType, abs($amount), 'k1_field', "basis.capitalAccount.{$key}", "K-1 capital account {$key}", $reviewStatus, 'capitalAccount');
        }

        foreach ([
            'beginningBasis' => 'beginning_basis',
            'endingBasis' => null,
            'suspendedLossCarryforward' => null,
        ] as $key => $eventType) {
            $amount = $this->moneyToCents($worksheet[$key] ?? null);
            if ($amount === null || $amount === 0 || $eventType === null) {
                continue;
            }
            $this->recordK1Event($interest, $document, $link, $year, $eventType, abs($amount), 'k1_field', "basis.outsideBasisWorksheet.{$key}", "K-1 outside basis worksheet {$key}", $reviewStatus, 'outsideBasisWorksheet');
        }

        foreach ($distributions as $index => $distribution) {
            if (! is_array($distribution)) {
                continue;
            }
            $amount = $this->moneyToCents($distribution['partnershipAdjustedBasis'] ?? null) ?? $this->moneyToCents($distribution['amount'] ?? null);
            if ($amount === null || $amount === 0) {
                continue;
            }

            $this->recordK1Event($interest, $document, $link, $year, 'cash_distribution', abs($amount), 'k1_code', "basis.distributions.{$index}.amount", 'K-1 Box 19 distribution', $reviewStatus, '19', (string) ($distribution['code'] ?? ''));
        }

        $beginningRecourse = $this->moneyToCents($liabilities['beginningRecourse'] ?? null) ?? 0;
        $endingRecourse = $this->moneyToCents($liabilities['endingRecourse'] ?? null) ?? 0;
        $beginningQualified = $this->moneyToCents($liabilities['beginningQualifiedNonrecourse'] ?? null) ?? 0;
        $endingQualified = $this->moneyToCents($liabilities['endingQualifiedNonrecourse'] ?? null) ?? 0;
        $beginningNonrecourse = $this->moneyToCents($liabilities['beginningNonrecourse'] ?? null) ?? 0;
        $endingNonrecourse = $this->moneyToCents($liabilities['endingNonrecourse'] ?? null) ?? 0;
        $netLiabilityChange = ($endingRecourse + $endingQualified + $endingNonrecourse) - ($beginningRecourse + $beginningQualified + $beginningNonrecourse);
        if ($netLiabilityChange !== 0) {
            $this->recordK1Event($interest, $document, $link, $year, $netLiabilityChange > 0 ? 'liability_increase' : 'liability_decrease', abs($netLiabilityChange), 'k1_field', 'basis.liabilities', 'K-1 liability share net change', $reviewStatus, 'liabilities', null, [
                'beginning_recourse_liability_cents' => $beginningRecourse,
                'ending_recourse_liability_cents' => $endingRecourse,
                'beginning_qualified_nonrecourse_liability_cents' => $beginningQualified,
                'ending_qualified_nonrecourse_liability_cents' => $endingQualified,
                'beginning_nonrecourse_liability_cents' => $beginningNonrecourse,
                'ending_nonrecourse_liability_cents' => $endingNonrecourse,
            ]);
        }
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function syncK1IncomeAndDeductions(FinPartnershipInterest $interest, FileForTaxDocument $document, ?TaxDocumentAccount $link, array $data, int $year, string $reviewStatus): void
    {
        foreach (['1', '2', '3', '4a', '4b', '4c', '5', '6a', '7', '8', '9a', '10'] as $box) {
            $amount = $this->moneyToCents($data['fields'][$box]['value'] ?? null);
            if ($amount === null || $amount === 0) {
                continue;
            }
            $this->recordK1Event($interest, $document, $link, $year, $amount > 0 ? 'taxable_income' : 'deductible_loss', abs($amount), 'k1_field', "fields.{$box}.value", "K-1 Box {$box}", $reviewStatus, $box);
        }

        foreach (['18' => 'tax_exempt_income', '19' => 'cash_distribution'] as $box => $eventType) {
            $items = is_array($data['codes'][$box] ?? null) ? $data['codes'][$box] : [];
            foreach ($items as $index => $item) {
                if (! is_array($item)) {
                    continue;
                }
                $amount = $this->moneyToCents($item['value'] ?? null);
                if ($amount === null || $amount === 0) {
                    continue;
                }
                $this->recordK1Event($interest, $document, $link, $year, $eventType, abs($amount), 'k1_code', "codes.{$box}.{$index}.value", "K-1 Box {$box} Code ".(string) ($item['code'] ?? ''), $reviewStatus, (string) $box, (string) ($item['code'] ?? ''));
            }
        }
    }

    /**
     * @param  array<string, mixed>  $metadata
     */
    private function recordK1Event(FinPartnershipInterest $interest, FileForTaxDocument $document, ?TaxDocumentAccount $link, int $year, ?string $eventType, int $amountCents, string $sourceType, string $sourcePath, string $sourceLabel, string $reviewStatus, ?string $box = null, ?string $code = null, array $metadata = []): FinPartnershipBasisEvent
    {
        return $this->recordEvent($interest, [
            'tax_year' => $year,
            'event_order' => $this->eventOrder($eventType ?? 'manual_adjustment'),
            'basis_side' => $eventType === 'initial_tax_basis_capital' ? 'inside' : 'outside',
            'event_type' => $eventType ?? 'manual_adjustment',
            'amount_cents' => $amountCents,
            'source_type' => $sourceType,
            'tax_document_id' => $document->id,
            'tax_document_account_id' => $link?->id,
            'account_id' => $link instanceof TaxDocumentAccount ? $link->account_id : $document->account_id,
            'k1_box' => $box,
            'k1_code' => $code,
            'source_path' => $sourcePath,
            'source_label' => $sourceLabel,
            'review_status' => $reviewStatus,
            'metadata' => $metadata,
        ]);
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function recordEvent(FinPartnershipInterest $interest, array $attributes): FinPartnershipBasisEvent
    {
        $attributes = array_merge([
            'user_id' => $interest->user_id,
            'partnership_interest_id' => $interest->id,
            'event_order' => 0,
            'basis_side' => 'outside',
            'currency' => 'USD',
            'source_type' => 'manual',
            'review_status' => 'needs_review',
            'metadata' => [],
        ], $attributes);

        $identity = [
            'user_id' => $attributes['user_id'],
            'partnership_interest_id' => $attributes['partnership_interest_id'],
            'tax_year' => $attributes['tax_year'],
            'event_type' => $attributes['event_type'],
            'source_type' => $attributes['source_type'],
            'tax_document_id' => $attributes['tax_document_id'] ?? null,
            'tax_document_account_id' => $attributes['tax_document_account_id'] ?? null,
            'account_id' => $attributes['account_id'] ?? null,
            'source_path' => $attributes['source_path'] ?? null,
        ];

        /** @var FinPartnershipBasisEvent $event */
        $event = FinPartnershipBasisEvent::query()->firstOrCreate($identity, $attributes);

        return $event;
    }

    /** @param Collection<int, FinPartnershipBasisEvent> $events */
    private function beginningOutsideBasisCents(Collection $events, ?FinPartnershipBasisYear $prior): int
    {
        $manual = $events->first(fn (FinPartnershipBasisEvent $event): bool => $event->event_type === 'beginning_basis');
        if ($manual instanceof FinPartnershipBasisEvent) {
            return max(0, (int) $manual->amount_cents);
        }

        $carry = $events->first(fn (FinPartnershipBasisEvent $event): bool => $event->event_type === 'prior_year_rollforward');
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
    private function reviewStatus(Collection $events, int $distributionGain, int $suspendedLoss): string
    {
        if ($distributionGain > 0 || $suspendedLoss > 0) {
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

    /** @param Collection<int, FinPartnershipBasisEvent> $events */
    private function liquidationGainLossCents(Collection $events, int $beginningOutside, int $endingOutside, int $distributionGain): ?int
    {
        $hasLiquidation = $events->contains(fn (FinPartnershipBasisEvent $event): bool => in_array($event->event_type, ['liquidation_distribution_cash', 'liquidation_distribution_property'], true));
        if (! $hasLiquidation) {
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

    private function normalizeEin(mixed $value): ?string
    {
        if (! is_string($value) && ! is_numeric($value)) {
            return null;
        }
        $digits = preg_replace('/\D+/', '', (string) $value);

        return $digits !== '' ? $digits : null;
    }

    private function normalizeName(string $name): string
    {
        return strtolower(trim(preg_replace('/\s+/', ' ', $name) ?? $name));
    }

    private function mapFormType(string $formType): string
    {
        return match (strtoupper($formType)) {
            'K-1-1065' => 'k1_1065',
            'K-1-1120S' => 'k1_1120s',
            'K-1-1041' => 'k1_1041',
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
