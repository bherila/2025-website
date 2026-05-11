<?php

namespace App\Services\Tax\PureTaxMath;

final class StandardDeduction
{
    /**
     * @var array<int, array{single: float, mfj: float, hoh: float}>
     */
    private const array BY_YEAR = [
        2025 => ['single' => 15750.0, 'mfj' => 31500.0, 'hoh' => 23625.0],
        2026 => ['single' => 16100.0, 'mfj' => 32200.0, 'hoh' => 24150.0],
    ];

    public static function amount(int $year, FilingStatus $status, float $inflationRate = 0.0): float
    {
        $tableYear = self::tableYear($year);
        $amount = self::BY_YEAR[$tableYear][$status->bracketKey()];

        return Inflation::projectThreshold($amount, $tableYear, $year, $inflationRate);
    }

    private static function tableYear(int $year): int
    {
        if (array_key_exists($year, self::BY_YEAR)) {
            return $year;
        }

        $years = array_keys(self::BY_YEAR);
        sort($years);

        return $year < $years[0]
            ? $years[0]
            : $years[array_key_last($years)];
    }
}
