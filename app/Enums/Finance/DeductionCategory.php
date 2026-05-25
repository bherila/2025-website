<?php

namespace App\Enums\Finance;

/**
 * Manual tax-preview categories stored in `fin_user_deductions.category`.
 * Schedule A values map to one (or part of one) Schedule A line:
 *  - state_est_tax   → Line 5a (in addition to W-2 Box 17 withholding)
 *  - sales_tax       → Line 5a (taxpayer elects state income tax OR general sales tax)
 *  - real_estate_tax → Line 5b
 *  - personal_property_tax → Line 5c
 *  - mortgage_interest → Line 8a
 *  - charitable_cash / charitable_noncash → Lines 11 / 12
 *  - other → Line 16
 * Schedule F values are reused as manual inputs for backend tax facts:
 *  - schedule_f_gross_income → Schedule F line 9
 *  - schedule_f_expenses → Schedule F line 33
 * Additional user-entered tax facts:
 *  - form4797_* → Form 4797 user-entered business-property disposition totals
 *  - form8606_* → Form 8606 IRA basis / FMV inputs
 *  - schedule3_* → Schedule 3 user-entered credits and payments
 *
 * Kept in sync with TS constants in `resources/js/lib/tax/deductionCategories.ts`.
 */
enum DeductionCategory: string
{
    case RealEstateTax = 'real_estate_tax';
    case StateEstTax = 'state_est_tax';
    case SalesTax = 'sales_tax';
    case PersonalPropertyTax = 'personal_property_tax';
    case MortgageInterest = 'mortgage_interest';
    case CharitableCash = 'charitable_cash';
    case CharitableNoncash = 'charitable_noncash';
    case Other = 'other';
    case ScheduleFGrossIncome = 'schedule_f_gross_income';
    case ScheduleFExpenses = 'schedule_f_expenses';
    case Form4797PartI1231Gain = 'form4797_part_i_1231_gain';
    case Form4797PartI1231Loss = 'form4797_part_i_1231_loss';
    case Form4797PartIIOrdinaryGain = 'form4797_part_ii_ordinary_gain';
    case Form4797PartIIOrdinaryLoss = 'form4797_part_ii_ordinary_loss';
    case Form4797PartIIIRecapture = 'form4797_part_iii_recapture';
    case Form8606NondeductibleContributions = 'form8606_nondeductible_contributions';
    case Form8606PriorYearBasis = 'form8606_prior_year_basis';
    case Form8606YearEndFmv = 'form8606_year_end_fmv';
    case Schedule3ChildDependentCareCredit = 'schedule3_child_dependent_care_credit';
    case Schedule3EducationCredits = 'schedule3_education_credits';
    case Schedule3RetirementSavingsCredit = 'schedule3_retirement_savings_credit';
    case Schedule3ResidentialCleanEnergyCredit = 'schedule3_residential_clean_energy_credit';
    case Schedule3EnergyEfficientHomeImprovementCredit = 'schedule3_energy_efficient_home_improvement_credit';
    case Schedule3GeneralBusinessCredit = 'schedule3_general_business_credit';
    case Schedule3PriorYearMinimumTaxCredit = 'schedule3_prior_year_minimum_tax_credit';
    case Schedule3OtherNonrefundableCredits = 'schedule3_other_nonrefundable_credits';
    case Schedule3NetPremiumTaxCredit = 'schedule3_net_premium_tax_credit';
    case Schedule3ExtensionPayment = 'schedule3_extension_payment';
    case Schedule3ExcessSocialSecurityWithheld = 'schedule3_excess_social_security_withheld';
    case Schedule3FuelTaxCredit = 'schedule3_fuel_tax_credit';
    case Schedule3OtherRefundableCredits = 'schedule3_other_refundable_credits';

    /** @return list<string> */
    public static function scheduleAValues(): array
    {
        return [
            self::RealEstateTax->value,
            self::StateEstTax->value,
            self::SalesTax->value,
            self::PersonalPropertyTax->value,
            self::MortgageInterest->value,
            self::CharitableCash->value,
            self::CharitableNoncash->value,
            self::Other->value,
        ];
    }

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(fn (self $c): string => $c->value, self::cases());
    }

    /**
     * Categories that roll up into SALT (Schedule A Line 7) — §164(b)(6) aggregates
     * lines 5a (state/local income or general sales tax), 5b (real estate tax),
     * and 5c (personal property tax) before applying the $10,000 cap.
     *
     * @return list<string>
     */
    public static function saltValues(): array
    {
        return [
            self::RealEstateTax->value,
            self::StateEstTax->value,
            self::SalesTax->value,
            self::PersonalPropertyTax->value,
        ];
    }
}
