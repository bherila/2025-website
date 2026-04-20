<?php

namespace App\Support\Finance;

/**
 * Accepted tax-year range for Finance validation rules.
 * Bumped when the front-end adds a new year's brackets / standard deduction.
 */
final class TaxYearRange
{
    public const MIN = 2018;

    public const MAX = 2030;

    /** @return array{0: int, 1: int} */
    public static function bounds(): array
    {
        return [self::MIN, self::MAX];
    }
}
