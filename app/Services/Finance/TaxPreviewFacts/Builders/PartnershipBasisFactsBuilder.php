<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinPartnershipBasisEvent;
use App\Models\FinanceTool\FinPartnershipBasisYear;
use App\Services\Finance\MoneyMath;
use App\Services\Finance\PartnershipBasisService;
use App\Services\Finance\TaxPreviewFacts\Data\PartnershipBasisEventFact;
use App\Services\Finance\TaxPreviewFacts\Data\PartnershipBasisFacts;
use App\Services\Finance\TaxPreviewFacts\Data\PartnershipBasisInterestFacts;
use App\Services\Finance\TaxPreviewFacts\Data\PartnershipBasisWorksheetFacts;

class PartnershipBasisFactsBuilder
{
    public function __construct(private readonly PartnershipBasisService $partnershipBasisService) {}

    /** @param iterable<FileForTaxDocument> $k1Docs */
    public function build(int $userId, int $year, iterable $k1Docs): PartnershipBasisFacts
    {
        $basisYears = $this->partnershipBasisService->recomputeForUserYear($userId, $year, $k1Docs);

        return new PartnershipBasisFacts(
            year: $year,
            interests: $basisYears->map(fn (FinPartnershipBasisYear $basisYear): PartnershipBasisInterestFacts => $this->interestFact($basisYear))->values()->all(),
        );
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
