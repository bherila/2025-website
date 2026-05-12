<?php

namespace App\Services\Tax\PureTaxMath;

final class Niit
{
    private const float RATE = 0.038;

    public static function tax(FilingStatus $status, float $magi, float $investmentIncome): float
    {
        $magiExcess = max(0.0, $magi - $status->niitThreshold());

        return round(min(max(0.0, $investmentIncome), $magiExcess) * self::RATE, 2);
    }
}
