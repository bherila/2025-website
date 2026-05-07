<?php

namespace App\Support\Finance;

use App\Services\Finance\MoneyMath;
use InvalidArgumentException;

final class FederalIncomeTax
{
    /**
     * @var array<int, array{single: list<array{0: float, 1: float}>, mfj: list<array{0: float, 1: float}>}>
     */
    private const array ORDINARY_BRACKETS = [
        2024 => [
            'single' => [[11600.0, 0.10], [47150.0, 0.12], [100525.0, 0.22], [191950.0, 0.24], [243725.0, 0.32], [609350.0, 0.35], [PHP_FLOAT_MAX, 0.37]],
            'mfj' => [[23200.0, 0.10], [94300.0, 0.12], [201050.0, 0.22], [383900.0, 0.24], [487450.0, 0.32], [731200.0, 0.35], [PHP_FLOAT_MAX, 0.37]],
        ],
        2025 => [
            'single' => [[11925.0, 0.10], [48475.0, 0.12], [103350.0, 0.22], [197300.0, 0.24], [250525.0, 0.32], [626350.0, 0.35], [PHP_FLOAT_MAX, 0.37]],
            'mfj' => [[23850.0, 0.10], [96950.0, 0.12], [206700.0, 0.22], [394600.0, 0.24], [501050.0, 0.32], [751600.0, 0.35], [PHP_FLOAT_MAX, 0.37]],
        ],
        2026 => [
            'single' => [[12400.0, 0.10], [50400.0, 0.12], [105700.0, 0.22], [201775.0, 0.24], [256200.0, 0.32], [640600.0, 0.35], [PHP_FLOAT_MAX, 0.37]],
            'mfj' => [[24800.0, 0.10], [100800.0, 0.12], [211400.0, 0.22], [403550.0, 0.24], [512400.0, 0.32], [768700.0, 0.35], [PHP_FLOAT_MAX, 0.37]],
        ],
    ];

    /**
     * @var array<int, array{single: array{zero: float, fifteen: float}, mfj: array{zero: float, fifteen: float}}>
     */
    private const array CAPITAL_GAIN_THRESHOLDS = [
        2024 => [
            'single' => ['zero' => 47025.0, 'fifteen' => 518900.0],
            'mfj' => ['zero' => 94050.0, 'fifteen' => 583750.0],
        ],
        2025 => [
            'single' => ['zero' => 48350.0, 'fifteen' => 533400.0],
            'mfj' => ['zero' => 96700.0, 'fifteen' => 600050.0],
        ],
        2026 => [
            'single' => ['zero' => 49450.0, 'fifteen' => 545500.0],
            'mfj' => ['zero' => 98900.0, 'fifteen' => 613700.0],
        ],
    ];

    public static function regularTax(float $taxableIncome, int $year, bool $isMarried, float $qualifiedDividends = 0.0, float $netCapitalGain = 0.0): float
    {
        $taxableIncome = max(0.0, $taxableIncome);
        $ordinaryTax = self::ordinaryTax($taxableIncome, $year, $isMarried);
        $preferentialIncome = min($taxableIncome, MoneyMath::sum([
            max(0.0, $qualifiedDividends),
            max(0.0, $netCapitalGain),
        ]));

        if ($preferentialIncome <= 0.0) {
            return $ordinaryTax;
        }

        return min($ordinaryTax, self::qualifiedDividendCapitalGainTax($taxableIncome, $preferentialIncome, $year, $isMarried));
    }

    public static function ordinaryTax(float $taxableIncome, int $year, bool $isMarried): float
    {
        $rows = self::ORDINARY_BRACKETS[self::tableYear(self::ORDINARY_BRACKETS, $year)][$isMarried ? 'mfj' : 'single'];
        $tax = 0.0;
        $previousTop = 0.0;

        foreach ($rows as [$top, $rate]) {
            if ($taxableIncome <= $previousTop) {
                break;
            }

            $taxableAtRate = min($taxableIncome, $top) - $previousTop;
            $tax = MoneyMath::sum([$tax, $taxableAtRate * $rate]);
            $previousTop = $top;
        }

        return $tax;
    }

    private static function qualifiedDividendCapitalGainTax(float $taxableIncome, float $preferentialIncome, int $year, bool $isMarried): float
    {
        $thresholds = self::CAPITAL_GAIN_THRESHOLDS[self::tableYear(self::CAPITAL_GAIN_THRESHOLDS, $year)][$isMarried ? 'mfj' : 'single'];
        $ordinaryIncome = max(0.0, MoneyMath::subtract($taxableIncome, $preferentialIncome));
        $tax = self::ordinaryTax($ordinaryIncome, $year, $isMarried);
        $remainingPreferentialIncome = $preferentialIncome;
        $stackPosition = $ordinaryIncome;

        $zeroRateAmount = min($remainingPreferentialIncome, max(0.0, MoneyMath::subtract($thresholds['zero'], $stackPosition)));
        $remainingPreferentialIncome = MoneyMath::subtract($remainingPreferentialIncome, $zeroRateAmount);
        $stackPosition = MoneyMath::sum([$stackPosition, $zeroRateAmount]);

        $fifteenRateAmount = min($remainingPreferentialIncome, max(0.0, MoneyMath::subtract($thresholds['fifteen'], $stackPosition)));
        $remainingPreferentialIncome = MoneyMath::subtract($remainingPreferentialIncome, $fifteenRateAmount);

        return MoneyMath::sum([
            $tax,
            $fifteenRateAmount * 0.15,
            max(0.0, $remainingPreferentialIncome) * 0.20,
        ]);
    }

    /**
     * @param  array<int, mixed>  $table
     */
    private static function tableYear(array $table, int $year): int
    {
        if (array_key_exists($year, $table)) {
            return $year;
        }

        $years = array_keys($table);
        sort($years);

        throw new InvalidArgumentException(sprintf(
            'Federal income tax tables are not configured for year %d (supported: %d–%d).',
            $year,
            $years[0],
            $years[array_key_last($years)],
        ));
    }
}
