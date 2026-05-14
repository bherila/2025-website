<?php

namespace App\Services\Tax\PureTaxMath;

final class ItemizedDeductions
{
    public const float MEDICAL_AGI_FLOOR_RATE = 0.075;

    public const float CA_PROP_13_PROPERTY_TAX_GROWTH_CAP = 0.02;

    /**
     * OBBBA SALT phase-down rules for years with published parameters.
     *
     * @var array<int, array{base: float, threshold: float, floor: float, rate: float}>
     */
    private const array SALT_CAP_RULES = [
        2025 => ['base' => 40000.0, 'threshold' => 500000.0, 'floor' => 10000.0, 'rate' => 0.30],
        2026 => ['base' => 40400.0, 'threshold' => 505000.0, 'floor' => 10000.0, 'rate' => 0.30],
    ];

    public static function saltCap(int $year, ?float $magi = null): float
    {
        if (! array_key_exists($year, self::SALT_CAP_RULES)) {
            return 10000.0;
        }

        $rule = self::SALT_CAP_RULES[$year];
        if ($magi === null) {
            return $rule['base'];
        }

        $excess = max(0.0, $magi - $rule['threshold']);

        return self::roundMoney(max($rule['floor'], $rule['base'] - ($excess * $rule['rate'])));
    }

    public static function hasSaltPhaseDown(int $year): bool
    {
        return array_key_exists($year, self::SALT_CAP_RULES);
    }

    public static function saltDeduction(float $realEstateTax, int $year, ?float $magi = null, float $stateOrSalesTax = 0.0): float
    {
        $saltPaidBeforeCap = self::roundMoney(max(0.0, $realEstateTax) + max(0.0, $stateOrSalesTax));

        return self::roundMoney(min(self::saltCap($year, $magi), $saltPaidBeforeCap));
    }

    public static function medicalExpenseFloor(float $agi): float
    {
        return self::roundMoney(max(0.0, $agi) * self::MEDICAL_AGI_FLOOR_RATE);
    }

    public static function medicalExpenseDeduction(float $medicalExpenses, float $agi): float
    {
        return self::roundMoney(max(0.0, $medicalExpenses - self::medicalExpenseFloor($agi)));
    }

    public static function propertyTaxGrowthRate(float $inflationRate, bool $caProp13Limit): float
    {
        $rate = max(0.0, $inflationRate);

        return $caProp13Limit ? min($rate, self::CA_PROP_13_PROPERTY_TAX_GROWTH_CAP) : $rate;
    }

    private static function roundMoney(float $value): float
    {
        return round($value, 2);
    }
}
