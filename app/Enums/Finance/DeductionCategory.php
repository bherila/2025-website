<?php

namespace App\Enums\Finance;

/**
 * Schedule A deduction categories stored in `fin_user_deductions.category`.
 * Each value maps to one (or part of one) Schedule A line:
 *  - real_estate_tax → Line 5b
 *  - state_est_tax   → Line 5a (in addition to W-2 Box 17 withholding)
 *  - sales_tax       → Line 5c
 *  - mortgage_interest → Line 8a
 *  - charitable_cash / charitable_noncash → Lines 11 / 12
 *  - other → Line 16
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
