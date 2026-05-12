<?php

namespace App\Services\Tax\PureTaxMath;

final class Irmaa
{
    /**
     * 2026 planning table. Amounts are monthly surcharges above the standard premiums.
     *
     * @var list<array{single: float, mfj: float, part_b: float, part_d: float, label: string}>
     */
    private const array TIERS = [
        ['single' => 106000.0, 'mfj' => 212000.0, 'part_b' => 0.0, 'part_d' => 0.0, 'label' => 'Standard'],
        ['single' => 133000.0, 'mfj' => 266000.0, 'part_b' => 74.0, 'part_d' => 13.7, 'label' => 'Tier 1'],
        ['single' => 167000.0, 'mfj' => 334000.0, 'part_b' => 185.0, 'part_d' => 35.3, 'label' => 'Tier 2'],
        ['single' => 200000.0, 'mfj' => 400000.0, 'part_b' => 295.9, 'part_d' => 57.0, 'label' => 'Tier 3'],
        ['single' => 500000.0, 'mfj' => 750000.0, 'part_b' => 406.9, 'part_d' => 78.6, 'label' => 'Tier 4'],
        ['single' => PHP_FLOAT_MAX, 'mfj' => PHP_FLOAT_MAX, 'part_b' => 443.9, 'part_d' => 85.8, 'label' => 'Tier 5'],
    ];

    public static function tierFor(int $year, FilingStatus $status, float $magi, float $inflationRate = 0.0): IrmaaTier
    {
        $key = $status->isMarriedLike() ? 'mfj' : 'single';
        $previousTop = 0.0;

        foreach (self::TIERS as $tier) {
            $top = $tier[$key] === PHP_FLOAT_MAX
                ? PHP_FLOAT_MAX
                : Inflation::projectThreshold($tier[$key], 2026, $year, $inflationRate);

            if ($magi <= $top) {
                return new IrmaaTier($tier['label'], $previousTop, $top === PHP_FLOAT_MAX ? null : $top, $tier['part_b'], $tier['part_d']);
            }

            $previousTop = $top;
        }

        $last = self::TIERS[array_key_last(self::TIERS)];

        return new IrmaaTier($last['label'], $previousTop, null, $last['part_b'], $last['part_d']);
    }

    /**
     * @return list<array{label: string, minMagi: float, maxMagi: float|null, monthlyPartBSurcharge: float, monthlyPartDSurcharge: float, annualSurcharge: float}>
     */
    public static function tiersFor(int $year, FilingStatus $status, float $inflationRate = 0.0): array
    {
        $key = $status->isMarriedLike() ? 'mfj' : 'single';
        $previousTop = 0.0;
        $tiers = [];

        foreach (self::TIERS as $tier) {
            $top = $tier[$key] === PHP_FLOAT_MAX
                ? null
                : Inflation::projectThreshold($tier[$key], 2026, $year, $inflationRate);
            $tiers[] = (new IrmaaTier($tier['label'], $previousTop, $top, $tier['part_b'], $tier['part_d']))->toArray();
            $previousTop = $top ?? $previousTop;
        }

        return $tiers;
    }
}
