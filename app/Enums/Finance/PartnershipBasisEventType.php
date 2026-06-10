<?php

namespace App\Enums\Finance;

/**
 * Source-level events in the partnership outside-basis ledger
 * (fin_partnership_basis_events.event_type).
 *
 * The rollforward in PartnershipBasisService::recomputeInterestYear() classifies
 * each event by its basis effect:
 *
 *  - increase  → adds to outside basis (contributions, distributive-share income,
 *                tax-exempt income, liability increases)
 *  - decreaseGain → reduces basis; any excess over available basis is recognized
 *                as gain from the sale/exchange of the interest (cash & marketable-
 *                securities distributions, deemed distributions from liability
 *                decreases). IRC §731(a)(1).
 *  - decreaseReallocate → reduces basis, floored at zero, with NO gain on excess
 *                (property distributions reduce basis by the partnership's adjusted
 *                basis in the property; §732/§733).
 *  - decreaseSuspend → reduces basis; any excess is suspended and carried forward
 *                (losses, deductions, nondeductible expenses, foreign taxes, §179,
 *                depletion).
 *  - none      → memorandum / reconciliation rows preserved for audit but with no
 *                outside-basis effect (prior-year carryforward marker, capital-
 *                account net income used only for reconciliation, guaranteed
 *                payments, §754/§743(b) step-up amortization (Section754StepUpAmortization —
 *                tracked as its own memorandum detail row rather than lumped with other
 *                Box 13 code-L deductions, since the partner-level outside-basis effect of
 *                the inside-basis adjustment is offset by the income/loss it shelters),
 *                AMT/credit informational
 *                codes, and the manual tax-capital / book-capital adjustments,
 *                which move only the capital columns — see
 *                PartnershipBasisService::endingCapitalCents() — never outside basis).
 */
enum PartnershipBasisEventType: string
{
    case BeginningBasis = 'beginning_basis';
    case PriorYearRollforward = 'prior_year_rollforward';
    case InitialCashContribution = 'initial_cash_contribution';
    case InitialPropertyContributionBasis = 'initial_property_contribution_basis';
    case InitialCapitalAccountValue = 'initial_capital_account_value';
    case InitialTaxBasisCapital = 'initial_tax_basis_capital';
    case CapitalContributionCash = 'capital_contribution_cash';
    case CapitalContributionPropertyBasis = 'capital_contribution_property_basis';
    case TaxableIncome = 'taxable_income';
    case TaxExemptIncome = 'tax_exempt_income';
    case LiabilityIncrease = 'liability_increase';
    case LiabilityDecrease = 'liability_decrease';
    case CashDistribution = 'cash_distribution';
    case PropertyDistributionBasis = 'property_distribution_basis';
    case MarketableSecuritiesDistribution = 'marketable_securities_distribution';
    case DeemedDistributionLiabilityDecrease = 'deemed_distribution_liability_decrease';
    case DeductibleLoss = 'deductible_loss';
    case NondeductibleExpense = 'nondeductible_expense';
    case ForeignTax = 'foreign_tax';
    case Section179 = 'section179';
    case Depletion = 'depletion';
    case Section754StepUpAmortization = 'section754_stepup_amortization';
    case SuspendedLossReleased = 'suspended_loss_released';
    case SaleExchange = 'sale_exchange';
    case LiquidationDistributionCash = 'liquidation_distribution_cash';
    case LiquidationDistributionProperty = 'liquidation_distribution_property';
    case ManualIncreaseToOutsideBasis = 'manual_increase_to_outside_basis';
    case ManualDecreaseToOutsideBasis = 'manual_decrease_to_outside_basis';
    case ManualIncreaseToTaxCapital = 'manual_increase_to_tax_capital';
    case ManualDecreaseToTaxCapital = 'manual_decrease_to_tax_capital';
    case ManualIncreaseToBookCapital = 'manual_increase_to_book_capital';
    case ManualDecreaseToBookCapital = 'manual_decrease_to_book_capital';
    case ManualReconciliationNote = 'manual_reconciliation_note';
    case ReconciliationAdjustment = 'reconciliation_adjustment';
    case Memorandum = 'memorandum';

    public const BASIS_EFFECT_INCREASE = 'increase';

    public const BASIS_EFFECT_DECREASE_GAIN = 'decrease_gain';

    public const BASIS_EFFECT_DECREASE_REALLOCATE = 'decrease_reallocate';

    public const BASIS_EFFECT_DECREASE_SUSPEND = 'decrease_suspend';

    public const BASIS_EFFECT_NONE = 'none';

    /** @return string[] */
    public static function values(): array
    {
        return array_map(static fn (self $case): string => $case->value, self::cases());
    }

    /**
     * How this event adjusts outside basis during the annual rollforward.
     */
    public function basisEffect(): string
    {
        return match ($this) {
            self::InitialCashContribution,
            self::InitialPropertyContributionBasis,
            self::CapitalContributionCash,
            self::CapitalContributionPropertyBasis,
            self::TaxableIncome,
            self::TaxExemptIncome,
            self::LiabilityIncrease,
            self::ManualIncreaseToOutsideBasis => self::BASIS_EFFECT_INCREASE,

            self::CashDistribution,
            self::MarketableSecuritiesDistribution,
            self::DeemedDistributionLiabilityDecrease,
            self::LiabilityDecrease,
            self::LiquidationDistributionCash => self::BASIS_EFFECT_DECREASE_GAIN,

            self::PropertyDistributionBasis,
            self::LiquidationDistributionProperty,
            self::ManualDecreaseToOutsideBasis => self::BASIS_EFFECT_DECREASE_REALLOCATE,

            self::DeductibleLoss,
            self::NondeductibleExpense,
            self::ForeignTax,
            self::Section179,
            self::Depletion => self::BASIS_EFFECT_DECREASE_SUSPEND,

            // beginning_basis / prior_year_rollforward seed the opening basis and are
            // handled separately; everything else is memorandum-only.
            default => self::BASIS_EFFECT_NONE,
        };
    }

    /**
     * Year-summary column on fin_partnership_basis_years this event contributes to,
     * or null for memorandum/opening rows that do not roll into a summary bucket.
     */
    public function summaryColumn(): ?string
    {
        return match ($this) {
            self::InitialCashContribution,
            self::InitialPropertyContributionBasis,
            self::CapitalContributionCash,
            self::CapitalContributionPropertyBasis,
            self::ManualIncreaseToOutsideBasis => 'capital_contributions_cents',
            self::TaxableIncome => 'taxable_income_increase_cents',
            self::TaxExemptIncome => 'tax_exempt_income_increase_cents',
            self::LiabilityIncrease => 'liability_increase_cents',
            self::CashDistribution,
            self::LiquidationDistributionCash => 'cash_distributions_cents',
            self::PropertyDistributionBasis,
            self::MarketableSecuritiesDistribution,
            self::LiquidationDistributionProperty => 'property_distributions_basis_cents',
            self::LiabilityDecrease,
            self::DeemedDistributionLiabilityDecrease => 'liability_decrease_cents',
            self::DeductibleLoss,
            self::Section179,
            self::Depletion => 'deductions_losses_decrease_cents',
            self::NondeductibleExpense => 'nondeductible_expenses_decrease_cents',
            self::ForeignTax => 'foreign_taxes_decrease_cents',
            self::ManualDecreaseToOutsideBasis => 'deductions_losses_decrease_cents',
            default => null,
        };
    }

    public function isLiquidation(): bool
    {
        return $this === self::LiquidationDistributionCash || $this === self::LiquidationDistributionProperty;
    }

    /**
     * §754/§743(b) step-up amortization (commonly Box 13 code W) tracked as its own
     * memorandum detail row, separate from the other Box 13 code-L portfolio deductions.
     */
    public function isSection754StepUp(): bool
    {
        return $this === self::Section754StepUpAmortization;
    }
}
