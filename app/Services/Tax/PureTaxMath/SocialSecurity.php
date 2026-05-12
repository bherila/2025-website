<?php

namespace App\Services\Tax\PureTaxMath;

final class SocialSecurity
{
    public static function taxablePortion(FilingStatus $status, float $ssBenefit, float $otherIncome, float $taxExemptInterest = 0.0): float
    {
        $ssBenefit = max(0.0, $ssBenefit);
        if ($ssBenefit === 0.0) {
            return 0.0;
        }

        $base = $status->socialSecurityBaseAmount();
        $adjustedBase = $status->socialSecurityAdjustedBaseAmount();
        $provisionalIncome = max(0.0, $otherIncome) + max(0.0, $taxExemptInterest) + ($ssBenefit * 0.5);

        if ($provisionalIncome <= $base) {
            return 0.0;
        }

        if ($provisionalIncome <= $adjustedBase) {
            return round(min($ssBenefit * 0.5, ($provisionalIncome - $base) * 0.5), 2);
        }

        $firstTierTaxable = min($ssBenefit * 0.5, ($adjustedBase - $base) * 0.5);

        return round(min($ssBenefit * 0.85, $firstTierTaxable + (($provisionalIncome - $adjustedBase) * 0.85)), 2);
    }
}
