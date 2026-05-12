<?php

namespace App\Services\Tax\PureTaxMath;

final class Inflation
{
    public static function projectThreshold(float $thresholdNow, int $fromYear, int $toYear, float $inflationRate): float
    {
        if ($toYear <= $fromYear || $inflationRate <= 0.0) {
            return $thresholdNow;
        }

        return round($thresholdNow * ((1.0 + $inflationRate) ** ($toYear - $fromYear)), 2);
    }
}
