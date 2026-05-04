<?php

namespace App\Services\Finance\CapitalGains;

/**
 * Aggregated Schedule D rollup values for one Form 8949 box.
 *
 * Used by Schedule D "Part I" (short-term) and "Part II" (long-term) summary
 * lines that reference a particular Form 8949 box.
 */
class ScheduleDRollupInput
{
    public function __construct(
        /** Form 8949 box (A–F) being summarised */
        public readonly string $form8949Box,
        /** true = short-term (A–C), false = long-term (D–F) */
        public readonly bool $isShortTerm,
        /** Schedule D line reference (e.g. "1a", "1b", "2", "3", "8a", "8b", "9", "10") */
        public readonly string $scheduleDLine,
        /** Total proceeds for this box */
        public readonly float $totalProceeds,
        /** Total cost basis for this box */
        public readonly float $totalCostBasis,
        /** Total adjustment amount for this box (wash sales etc.) */
        public readonly float $totalAdjustment,
        /** Net gain or loss = totalProceeds − totalCostBasis + totalAdjustment */
        public readonly float $netGainOrLoss,
        /** Number of underlying Form 8949 rows */
        public readonly int $rowCount,
    ) {}
}
