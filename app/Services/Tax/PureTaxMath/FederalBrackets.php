<?php

namespace App\Services\Tax\PureTaxMath;

final class FederalBrackets
{
    /**
     * Bracket tops are taxable-income ceilings.
     *
     * @var array<int, array{single: list<array{0: float, 1: float}>, mfj: list<array{0: float, 1: float}>, hoh: list<array{0: float, 1: float}>}>
     */
    private const array ORDINARY_BRACKETS = [
        2025 => [
            'single' => [[11925.0, 0.10], [48475.0, 0.12], [103350.0, 0.22], [197300.0, 0.24], [250525.0, 0.32], [626350.0, 0.35], [PHP_FLOAT_MAX, 0.37]],
            'mfj' => [[23850.0, 0.10], [96950.0, 0.12], [206700.0, 0.22], [394600.0, 0.24], [501050.0, 0.32], [751600.0, 0.35], [PHP_FLOAT_MAX, 0.37]],
            'hoh' => [[17000.0, 0.10], [64850.0, 0.12], [103350.0, 0.22], [197300.0, 0.24], [250500.0, 0.32], [626350.0, 0.35], [PHP_FLOAT_MAX, 0.37]],
        ],
        2026 => [
            'single' => [[12400.0, 0.10], [50400.0, 0.12], [105700.0, 0.22], [201775.0, 0.24], [256200.0, 0.32], [640600.0, 0.35], [PHP_FLOAT_MAX, 0.37]],
            'mfj' => [[24800.0, 0.10], [100800.0, 0.12], [211400.0, 0.22], [403550.0, 0.24], [512400.0, 0.32], [768700.0, 0.35], [PHP_FLOAT_MAX, 0.37]],
            'hoh' => [[17700.0, 0.10], [67450.0, 0.12], [105700.0, 0.22], [201775.0, 0.24], [256200.0, 0.32], [640600.0, 0.35], [PHP_FLOAT_MAX, 0.37]],
        ],
    ];

    /**
     * @var array<int, array{single: array{zero: float, fifteen: float}, mfj: array{zero: float, fifteen: float}, hoh: array{zero: float, fifteen: float}}>
     */
    private const array CAPITAL_GAIN_THRESHOLDS = [
        2025 => [
            'single' => ['zero' => 48350.0, 'fifteen' => 533400.0],
            'mfj' => ['zero' => 96700.0, 'fifteen' => 600050.0],
            'hoh' => ['zero' => 64750.0, 'fifteen' => 566700.0],
        ],
        2026 => [
            'single' => ['zero' => 49450.0, 'fifteen' => 545500.0],
            'mfj' => ['zero' => 98900.0, 'fifteen' => 613700.0],
            'hoh' => ['zero' => 66350.0, 'fifteen' => 579700.0],
        ],
    ];

    public static function taxOnOrdinary(int $year, FilingStatus $status, float $taxableOrdinary, float $standardDeduction = 0.0, float $inflationRate = 0.0): float
    {
        $taxableIncome = max(0.0, $taxableOrdinary - $standardDeduction);
        $tax = 0.0;
        $previousTop = 0.0;

        foreach (self::ordinaryRows($year, $status, $inflationRate) as [$top, $rate]) {
            if ($taxableIncome <= $previousTop) {
                break;
            }

            $taxableAtRate = min($taxableIncome, $top) - $previousTop;
            $tax += $taxableAtRate * $rate;
            $previousTop = $top;
        }

        return round($tax, 2);
    }

    public static function taxOnLongTermGains(int $year, FilingStatus $status, float $ordinaryStack, float $gainsStack, float $inflationRate = 0.0): float
    {
        $remainingGains = max(0.0, $gainsStack);
        $ordinaryStack = max(0.0, $ordinaryStack);
        $thresholds = self::capitalGainThresholds($year, $status, $inflationRate);
        $tax = 0.0;

        $zeroRateAmount = min($remainingGains, max(0.0, $thresholds['zero'] - $ordinaryStack));
        $remainingGains -= $zeroRateAmount;
        $stackPosition = $ordinaryStack + $zeroRateAmount;

        $fifteenRateAmount = min($remainingGains, max(0.0, $thresholds['fifteen'] - $stackPosition));
        $remainingGains -= $fifteenRateAmount;
        $tax += $fifteenRateAmount * 0.15;
        $tax += max(0.0, $remainingGains) * 0.20;

        return round($tax, 2);
    }

    public static function taxOnCombined(int $year, FilingStatus $status, float $taxableIncome, float $preferentialIncome, float $inflationRate = 0.0): float
    {
        $preferentialIncome = min(max(0.0, $preferentialIncome), max(0.0, $taxableIncome));
        $ordinaryStack = max(0.0, $taxableIncome - $preferentialIncome);

        return round(
            self::taxOnOrdinary($year, $status, $ordinaryStack, 0.0, $inflationRate)
            + self::taxOnLongTermGains($year, $status, $ordinaryStack, $preferentialIncome, $inflationRate),
            2,
        );
    }

    public static function ordinaryBracketCeiling(int $year, FilingStatus $status, float $rate, float $inflationRate = 0.0): float
    {
        foreach (self::ordinaryRows($year, $status, $inflationRate) as [$top, $rowRate]) {
            if (abs($rowRate - $rate) < 0.0001) {
                return $top;
            }
        }

        return self::ordinaryRows($year, $status, $inflationRate)[array_key_last(self::ordinaryRows($year, $status, $inflationRate))][0];
    }

    public static function capitalGainZeroRateCeiling(int $year, FilingStatus $status, float $inflationRate = 0.0): float
    {
        return self::capitalGainThresholds($year, $status, $inflationRate)['zero'];
    }

    public static function capitalGainFifteenRateCeiling(int $year, FilingStatus $status, float $inflationRate = 0.0): float
    {
        return self::capitalGainThresholds($year, $status, $inflationRate)['fifteen'];
    }

    /**
     * @return list<array{0: float, 1: float}>
     */
    private static function ordinaryRows(int $year, FilingStatus $status, float $inflationRate): array
    {
        $tableYear = self::tableYear(self::ORDINARY_BRACKETS, $year);
        $rows = self::ORDINARY_BRACKETS[$tableYear][$status->bracketKey()];

        if ($year === $tableYear || $inflationRate <= 0.0) {
            return $rows;
        }

        return array_map(
            static fn (array $row): array => [$row[0] === PHP_FLOAT_MAX ? PHP_FLOAT_MAX : Inflation::projectThreshold($row[0], $tableYear, $year, $inflationRate), $row[1]],
            $rows,
        );
    }

    /**
     * @return array{zero: float, fifteen: float}
     */
    private static function capitalGainThresholds(int $year, FilingStatus $status, float $inflationRate): array
    {
        $tableYear = self::tableYear(self::CAPITAL_GAIN_THRESHOLDS, $year);
        $thresholds = self::CAPITAL_GAIN_THRESHOLDS[$tableYear][$status->bracketKey()];

        if ($year === $tableYear || $inflationRate <= 0.0) {
            return $thresholds;
        }

        return [
            'zero' => Inflation::projectThreshold($thresholds['zero'], $tableYear, $year, $inflationRate),
            'fifteen' => Inflation::projectThreshold($thresholds['fifteen'], $tableYear, $year, $inflationRate),
        ];
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

        return $year < $years[0]
            ? $years[0]
            : $years[array_key_last($years)];
    }
}
