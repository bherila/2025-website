<?php

namespace App\Support\Finance;

final class FederalStandardDeduction
{
    /**
     * @var array<int, array{single: float, mfj: float, mfs: float, hoh: float}>
     */
    private const array BY_YEAR = [
        2018 => ['single' => 12000.0, 'mfj' => 24000.0, 'mfs' => 12000.0, 'hoh' => 18000.0],
        2019 => ['single' => 12200.0, 'mfj' => 24400.0, 'mfs' => 12200.0, 'hoh' => 18350.0],
        2020 => ['single' => 12400.0, 'mfj' => 24800.0, 'mfs' => 12400.0, 'hoh' => 18650.0],
        2021 => ['single' => 12550.0, 'mfj' => 25100.0, 'mfs' => 12550.0, 'hoh' => 18800.0],
        2022 => ['single' => 12950.0, 'mfj' => 25900.0, 'mfs' => 12950.0, 'hoh' => 19400.0],
        2023 => ['single' => 13850.0, 'mfj' => 27700.0, 'mfs' => 13850.0, 'hoh' => 20800.0],
        2024 => ['single' => 14600.0, 'mfj' => 29200.0, 'mfs' => 14600.0, 'hoh' => 21900.0],
        2025 => ['single' => 15750.0, 'mfj' => 31500.0, 'mfs' => 15750.0, 'hoh' => 23625.0],
        2026 => ['single' => 16100.0, 'mfj' => 32200.0, 'mfs' => 16100.0, 'hoh' => 24150.0],
    ];

    public static function single(int $year): float
    {
        return self::amount($year, 'single');
    }

    public static function marriedFilingJointly(int $year): float
    {
        return self::amount($year, 'mfj');
    }

    public static function marriedFilingSeparately(int $year): float
    {
        return self::amount($year, 'mfs');
    }

    public static function headOfHousehold(int $year): float
    {
        return self::amount($year, 'hoh');
    }

    private static function amount(int $year, string $status): float
    {
        if (array_key_exists($year, self::BY_YEAR)) {
            return self::BY_YEAR[$year][$status];
        }

        $latestYear = max(array_keys(self::BY_YEAR));

        return $year > $latestYear ? self::BY_YEAR[$latestYear][$status] : 0.0;
    }
}
