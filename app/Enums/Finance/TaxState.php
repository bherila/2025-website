<?php

namespace App\Enums\Finance;

/**
 * States with full tax-table support in the Tax Preview (state brackets in
 * `taxBracket.ts`, standard deduction in `standardDeductions.ts`).
 *
 * Kept in sync with the TS constant `SUPPORTED_TAX_STATES` in
 * `resources/js/lib/tax/supportedStates.ts`.
 */
enum TaxState: string
{
    case California = 'CA';
    case NewYork = 'NY';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(fn (self $c): string => $c->value, self::cases());
    }
}
