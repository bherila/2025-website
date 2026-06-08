<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Enums\Finance\PartnershipBasisEventType;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinPartnershipBasisEvent;
use App\Models\FinanceTool\FinPartnershipBasisYear;
use App\Models\FinanceTool\FinPartnershipInterest;
use App\Services\Finance\MoneyMath;
use App\Services\Finance\PartnershipBasisReconciliationService;
use App\Services\Finance\PartnershipBasisService;
use App\Services\Finance\TaxPreviewFacts\Data\Form8949RowFact;
use App\Services\Finance\TaxPreviewFacts\Data\PartnershipBasisEventFact;
use App\Services\Finance\TaxPreviewFacts\Data\PartnershipBasisFacts;
use App\Services\Finance\TaxPreviewFacts\Data\PartnershipBasisInterestFacts;
use App\Services\Finance\TaxPreviewFacts\Data\PartnershipBasisWorksheetFacts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

class PartnershipBasisFactsBuilder
{
    public function __construct(
        private readonly PartnershipBasisService $partnershipBasisService,
        private readonly PartnershipBasisReconciliationService $reconciliationService,
    ) {}

    /**
     * Build partnership-basis facts. This is a READ path: it returns already-synced basis
     * rollforwards without mutating any basis state. Re-syncing from K-1 documents happens only
     * through the explicit recompute/initialize/event endpoints.
     *
     * @param  iterable<FileForTaxDocument>  $k1Docs
     */
    public function build(int $userId, int $year, iterable $k1Docs): PartnershipBasisFacts
    {
        $basisYears = $this->partnershipBasisService->basisYearsForUserYear($userId, $year);

        $interests = [];
        $distributionGainSources = [];
        $liquidationGainLossSources = [];
        $form8949Rows = [];
        /** @var array<int, Collection<int, FinPartnershipBasisYear>> $basisYearsByAccount */
        $basisYearsByAccount = [];

        foreach ($basisYears as $basisYear) {
            $interests[] = $this->interestFact($basisYear);

            $interest = $basisYear->partnershipInterest;
            if ($interest === null) {
                continue;
            }
            if ($interest->account_id !== null) {
                $basisYearsByAccount[$interest->account_id] ??= collect();
                $basisYearsByAccount[$interest->account_id]->push($basisYear);
            }
            $partnerName = $interest->partnership_name;
            $events = $interest->relationLoaded('basisEvents') ? $interest->basisEvents : collect();

            $gain = (int) $basisYear->distribution_gain_cents;
            if ($gain > 0) {
                $dispositionDate = $this->latestDistributionDate($events);
                $holdingPeriod = $this->partnershipBasisService->holdingPeriod($interest, (int) $basisYear->tax_year, $events, $dispositionDate);
                [$routing, $box, $isShortTerm] = $this->dispositionRouting($holdingPeriod);
                $gainDollars = MoneyMath::fromCents($gain);

                $distributionGainSources[] = new TaxFactSource(
                    id: "partnership-basis-{$basisYear->id}-excess-distribution-gain",
                    label: "{$partnerName} — excess distribution gain",
                    amount: $gainDollars,
                    sourceType: TaxFactSourceType::PartnershipExcessDistributionGain,
                    accountId: $interest->account_id,
                    formType: 'k1',
                    box: '19',
                    routing: $routing,
                    routingReason: $this->dispositionRoutingReason($holdingPeriod),
                    isReviewed: false,
                    reviewStatus: 'needs_review',
                );

                // A determinable holding period produces a Form 8949 disposition row (the §731 gain
                // is gain from the deemed sale of the interest); an indeterminate first-year gain is
                // surfaced for review only and is never summed into Schedule D.
                if ($box !== null) {
                    $form8949Rows[] = new Form8949RowFact(
                        form8949Box: $box,
                        description: "{$partnerName} — cash distribution in excess of outside basis (IRC §731)",
                        dateAcquired: $this->interestStartDate($interest),
                        dateSold: $dispositionDate?->toDateString() ?? sprintf('%d-12-31', $basisYear->tax_year),
                        proceeds: $gainDollars,
                        costBasis: 0.0,
                        adjustmentCode: null,
                        adjustmentAmount: 0.0,
                        gainOrLoss: $gainDollars,
                        isShortTerm: $isShortTerm,
                        isCovered: false,
                        isSummaryRow: false,
                        accountName: $partnerName,
                        taxDocumentId: null,
                        sourceTransactionId: "partnership-basis-{$basisYear->id}-excess-distribution-gain",
                    );
                }
            }

            if ($basisYear->liquidation_gain_loss_cents !== null) {
                $liquidationGainLossSources[] = new TaxFactSource(
                    id: "partnership-basis-{$basisYear->id}-liquidation-gain-loss",
                    label: "{$partnerName} — liquidation gain/loss (estimate)",
                    amount: MoneyMath::fromCents((int) $basisYear->liquidation_gain_loss_cents),
                    sourceType: TaxFactSourceType::PartnershipLiquidationGainLoss,
                    accountId: $interest->account_id,
                    formType: 'k1',
                    routing: TaxFactRouting::NeedsReviewScheduleDLine5Or12,
                    routingReason: 'Liquidation gain/loss is an estimate from remaining outside basis; confirm the character of property received before reporting on Schedule D.',
                    isReviewed: false,
                    reviewStatus: 'needs_review',
                );
            }
        }

        $reconciliations = [];
        foreach ($basisYearsByAccount as $accountId => $accountBasisYears) {
            $reconciliation = $this->reconciliationService->reconcile((int) $accountId, $year, $accountBasisYears);
            if ($reconciliation->hasReconcilableData) {
                $reconciliations[] = $reconciliation;
            }
        }

        return new PartnershipBasisFacts(
            year: $year,
            interests: $interests,
            distributionGainSources: $distributionGainSources,
            liquidationGainLossSources: $liquidationGainLossSources,
            form8949Rows: $form8949Rows,
            reconciliations: $reconciliations,
        );
    }

    /**
     * Map a determined holding period to Schedule D routing, Form 8949 box, and short-term flag.
     * Form 8949 box C = short-term not reported on a 1099-B → Schedule D line 3; box F = long-term
     * not reported on a 1099-B → Schedule D line 10. An indeterminate period yields no box (the gain
     * is left for review and excluded from Schedule D totals).
     *
     * @return array{0: TaxFactRouting, 1: ?string, 2: bool}
     */
    private function dispositionRouting(string $holdingPeriod): array
    {
        return match ($holdingPeriod) {
            PartnershipBasisService::HOLDING_PERIOD_LONG => [TaxFactRouting::ScheduleDLine10, 'F', false],
            PartnershipBasisService::HOLDING_PERIOD_SHORT => [TaxFactRouting::ScheduleDLine3, 'C', true],
            default => [TaxFactRouting::NeedsReviewScheduleDLine5Or12, null, false],
        };
    }

    private function dispositionRoutingReason(string $holdingPeriod): string
    {
        return match ($holdingPeriod) {
            PartnershipBasisService::HOLDING_PERIOD_LONG => 'Cash distribution in excess of outside basis is long-term gain from the deemed sale of the partnership interest (held more than one year); reported on Form 8949 Part II (box F) and Schedule D line 10.',
            PartnershipBasisService::HOLDING_PERIOD_SHORT => 'Cash distribution in excess of outside basis is short-term gain from the deemed sale of the partnership interest (held one year or less); reported on Form 8949 Part I (box C) and Schedule D line 3.',
            default => 'Cash distribution in excess of outside basis is gain from the sale of the partnership interest; set the interest acquisition date to confirm the holding period before Schedule D routing.',
        };
    }

    /**
     * Latest dated cash-distribution event in the year, used as the deemed disposition date for
     * holding-period and Form 8949 sold-date purposes on §731 excess cash-distribution gain. Only
     * gain-triggering (cash / marketable-securities / liquidation-cash) distributions count —
     * property distributions reduce basis without creating cash gain, so their dates must not move
     * the gain's holding period. Null when no qualifying distribution carries a date.
     *
     * @param  Collection<int, FinPartnershipBasisEvent>  $events
     */
    private function latestDistributionDate(Collection $events): ?CarbonImmutable
    {
        $distributionTypes = [
            PartnershipBasisEventType::CashDistribution->value,
            PartnershipBasisEventType::MarketableSecuritiesDistribution->value,
            PartnershipBasisEventType::LiquidationDistributionCash->value,
        ];

        $latest = null;
        foreach ($events as $event) {
            if (! in_array($event->event_type, $distributionTypes, true) || $event->event_date === null) {
                continue;
            }
            $candidate = CarbonImmutable::parse($event->event_date);
            if ($latest === null || $candidate->greaterThan($latest)) {
                $latest = $candidate;
            }
        }

        return $latest;
    }

    private function interestStartDate(FinPartnershipInterest $interest): ?string
    {
        $start = $interest->interest_start_date;

        return $start === null ? null : CarbonImmutable::parse($start)->toDateString();
    }

    private function interestFact(FinPartnershipBasisYear $basisYear): PartnershipBasisInterestFacts
    {
        $basisYear->loadMissing(['partnershipInterest.basisEvents' => fn ($events) => $events->where('tax_year', $basisYear->tax_year)->orderBy('event_order')->orderBy('id')]);
        $interest = $basisYear->partnershipInterest;

        return new PartnershipBasisInterestFacts(
            interestId: (int) $basisYear->partnership_interest_id,
            partnershipName: $interest->partnership_name,
            partnershipEin: $interest->partnership_ein,
            accountId: $interest->account_id,
            taxYear: (int) $basisYear->tax_year,
            beginningTaxBasisCapital: MoneyMath::fromCents((int) $basisYear->beginning_tax_basis_capital_cents),
            endingTaxBasisCapital: MoneyMath::fromCents((int) $basisYear->ending_tax_basis_capital_cents),
            beginningBookCapital: MoneyMath::fromCents((int) $basisYear->beginning_book_capital_cents),
            endingBookCapital: MoneyMath::fromCents((int) $basisYear->ending_book_capital_cents),
            insideBasisConfidence: (string) $basisYear->inside_basis_confidence,
            reviewStatus: (string) $basisYear->review_status,
            isStale: (bool) $basisYear->is_stale,
            worksheet: new PartnershipBasisWorksheetFacts(
                beginningOutsideBasis: MoneyMath::fromCents((int) $basisYear->beginning_outside_basis_cents),
                capitalContributions: MoneyMath::fromCents((int) $basisYear->capital_contributions_cents),
                taxableIncomeIncrease: MoneyMath::fromCents((int) $basisYear->taxable_income_increase_cents),
                taxExemptIncomeIncrease: MoneyMath::fromCents((int) $basisYear->tax_exempt_income_increase_cents),
                liabilityIncrease: MoneyMath::fromCents((int) $basisYear->liability_increase_cents),
                cashDistributions: MoneyMath::fromCents((int) $basisYear->cash_distributions_cents),
                propertyDistributionsBasis: MoneyMath::fromCents((int) $basisYear->property_distributions_basis_cents),
                liabilityDecrease: MoneyMath::fromCents((int) $basisYear->liability_decrease_cents),
                deductionsLossesDecrease: MoneyMath::fromCents((int) $basisYear->deductions_losses_decrease_cents),
                nondeductibleExpensesDecrease: MoneyMath::fromCents((int) $basisYear->nondeductible_expenses_decrease_cents),
                foreignTaxesDecrease: MoneyMath::fromCents((int) $basisYear->foreign_taxes_decrease_cents),
                distributionGain: MoneyMath::fromCents((int) $basisYear->distribution_gain_cents),
                suspendedLossCarryforward: MoneyMath::fromCents((int) $basisYear->suspended_loss_carryforward_cents),
                endingOutsideBasis: MoneyMath::fromCents((int) $basisYear->ending_outside_basis_cents),
                liquidationGainLoss: $basisYear->liquidation_gain_loss_cents === null ? null : MoneyMath::fromCents((int) $basisYear->liquidation_gain_loss_cents),
            ),
            events: $interest?->basisEvents->map(fn (FinPartnershipBasisEvent $event): PartnershipBasisEventFact => new PartnershipBasisEventFact(
                id: (int) $event->id,
                taxYear: (int) $event->tax_year,
                eventType: (string) $event->event_type,
                basisSide: (string) $event->basis_side,
                amount: MoneyMath::fromCents((int) $event->amount_cents),
                sourceType: (string) $event->source_type,
                taxDocumentId: $event->tax_document_id,
                taxDocumentAccountId: $event->tax_document_account_id,
                accountId: $event->account_id,
                k1Box: $event->k1_box,
                k1Code: $event->k1_code,
                sourcePath: $event->source_path,
                sourceLabel: $event->source_label,
                reviewStatus: (string) $event->review_status,
            ))->values()->all() ?? [],
        );
    }
}
