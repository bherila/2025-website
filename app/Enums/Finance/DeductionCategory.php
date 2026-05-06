<?php

namespace App\Enums\Finance;

/**
 * Manual tax-preview categories stored in `fin_user_deductions.category`.
 * Schedule A values map to one (or part of one) Schedule A line:
 *  - real_estate_tax → Line 5b
 *  - state_est_tax   → Line 5a (in addition to W-2 Box 17 withholding)
 *  - sales_tax       → Line 5c
 *  - mortgage_interest → Line 8a
 *  - charitable_cash / charitable_noncash → Lines 11 / 12
 *  - other → Line 16
 * Schedule F values are reused as manual inputs for backend tax facts:
 *  - schedule_f_gross_income → Schedule F line 9
 *  - schedule_f_expenses → Schedule F line 33
 *
 * Kept in sync with TS constants in `resources/js/lib/tax/deductionCategories.ts`.
 */
enum DeductionCategory: string
{
    case RealEstateTax = 'real_estate_tax';
    case StateEstTax = 'state_est_tax';
    case SalesTax = 'sales_tax';
    case MortgageInterest = 'mortgage_interest';
    case CharitableCash = 'charitable_cash';
    case CharitableNoncash = 'charitable_noncash';
    case Other = 'other';
    case ScheduleFGrossIncome = 'schedule_f_gross_income';
    case ScheduleFExpenses = 'schedule_f_expenses';

    /** @return list<string> */
    public static function scheduleAValues(): array
    {
        return [
            self::RealEstateTax->value,
            self::StateEstTax->value,
            self::SalesTax->value,
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
     * Categories that roll up into SALT (Schedule A Line 7).
     *
     * @return list<string>
     */
    public static function saltValues(): array
    {
        return [
            self::RealEstateTax->value,
            self::StateEstTax->value,
            self::SalesTax->value,
        ];
    }
}
