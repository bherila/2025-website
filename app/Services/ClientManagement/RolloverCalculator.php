<?php

namespace App\Services\ClientManagement;

/**
 * Calculates rollover hour balances for client retainer agreements.
 * 
 * This class encapsulates all rollover logic for retainer-based billing:
 * - Tracking hours included in monthly retainers
 * - Calculating rollover hours that carry forward
 * - Determining when hours expire based on rollover_months setting
 * - Calculating negative balances when hours exceed available pool
 * - Determining excess hours to be billed at hourly rate
 * 
 * Rules:
 * 1. Each month grants retainer_hours to the available pool
 * 2. Unused hours roll over for up to rollover_months (1 = this month only, no rollover)
 * 3. When hours worked exceed current month's retainer, rollover hours are used first (FIFO)
 * 4. If all available hours are exhausted, excess is billed at hourly rate
 * 5. If previous month had a negative balance, new month's hours offset it first
 */
class RolloverCalculator
{
    /**
     * Calculate the opening balance for a month.
     * 
     * @param float $retainerHours Hours included in the current month's retainer
     * @param array $previousMonthsUnused Array of unused hours from previous months, 
     *                                     indexed by months ago (1 = last month, 2 = two months ago, etc.)
     * @param int $rolloverMonths Number of months hours can roll over (1 = no rollover)
     * @param float $previousNegativeBalance Negative balance carried from previous month
     * @return array{
     *   retainer_hours: float,
     *   rollover_hours: float,
     *   expired_hours: float,
     *   total_available: float,
     *   negative_offset: float
     * }
     */
    public function calculateOpeningBalance(
        float $retainerHours,
        array $previousMonthsUnused,
        int $rolloverMonths,
        float $previousNegativeBalance = 0.0
    ): array {
        $rolloverHours = 0.0;
        $expiredHours = 0.0;

        // Calculate rollover and expired hours from previous months
        foreach ($previousMonthsUnused as $monthsAgo => $unusedHours) {
            // If rollover_months is 1, hours from 1 month ago roll over
            // If rollover_months is 2, hours from 1-2 months ago roll over
            // If rollover_months is 0, nothing rolls over
            if ($monthsAgo <= $rolloverMonths) {
                $rolloverHours += $unusedHours;
            } else {
                $expiredHours += $unusedHours;
            }
        }

        // Apply negative balance offset (subtract from this month's retainer hours first)
        $negativeOffset = 0.0;
        $invoicedNegativeBalance = 0.0;
        $effectiveRetainerHours = $retainerHours;
        
        if ($previousNegativeBalance > 0) {
            $negativeOffset = min($previousNegativeBalance, $retainerHours);
            $invoicedNegativeBalance = max(0, $previousNegativeBalance - $retainerHours);
            $effectiveRetainerHours = $retainerHours - $negativeOffset;
        }

        $totalAvailable = $effectiveRetainerHours + $rolloverHours;

        return [
            'retainer_hours' => round($retainerHours, 4),
            'rollover_hours' => round($rolloverHours, 4),
            'expired_hours' => round($expiredHours, 4),
            'total_available' => round($totalAvailable, 4),
            'negative_offset' => round($negativeOffset, 4),
            'invoiced_negative_balance' => round($invoicedNegativeBalance, 4),
            'effective_retainer_hours' => round($effectiveRetainerHours, 4),
        ];
    }

    /**
     * Calculate the closing balance for a month after hours are worked.
     * 
     * @param float $totalAvailable Total hours available at start of month
     * @param float $hoursWorked Hours worked during the month
     * @param float $retainerHours This month's retainer hours (for categorizing usage)
     * @param float $rolloverHours Available rollover hours from previous months
     * @return array{
     *   hours_used_from_retainer: float,
     *   hours_used_from_rollover: float,
     *   unused_hours: float,
     *   excess_hours: float,
     *   negative_balance: float
     * }
     */
    public function calculateClosingBalance(
        float $totalAvailable,
        float $hoursWorked,
        float $retainerHours,
        float $rolloverHours
    ): array {
        $hoursUsedFromRetainer = 0.0;
        $hoursUsedFromRollover = 0.0;
        $unusedHours = 0.0;
        $excessHours = 0.0;
        $negativeBalance = 0.0;

        if ($hoursWorked <= $retainerHours) {
            // Case C: All work covered by retainer, remainder rolls over
            $hoursUsedFromRetainer = $hoursWorked;
            $unusedHours = $retainerHours - $hoursWorked;
        } elseif ($hoursWorked <= $totalAvailable) {
            // Case A: Used all retainer hours plus some rollover
            $hoursUsedFromRetainer = $retainerHours;
            $hoursUsedFromRollover = $hoursWorked - $retainerHours;
            $unusedHours = 0.0; // Used all of this month's hours
            // Note: Remaining rollover hours are tracked separately
        } else {
            // Case B: Exceeded all available hours
            $hoursUsedFromRetainer = $retainerHours;
            $hoursUsedFromRollover = $rolloverHours;
            $excessHours = 0.0; // Excess creates negative balance for next month, not billed immediately
            $negativeBalance = $hoursWorked - $totalAvailable;
        }

        return [
            'hours_used_from_retainer' => round($hoursUsedFromRetainer, 4),
            'hours_used_from_rollover' => round($hoursUsedFromRollover, 4),
            'unused_hours' => round($unusedHours, 4),
            'excess_hours' => round($excessHours, 4),
            'negative_balance' => round($negativeBalance, 4),
            'remaining_rollover' => round(max(0, $rolloverHours - $hoursUsedFromRollover), 4),
        ];
    }

    /**
     * Calculate complete month summary combining opening and closing balances.
     * 
     * @param float $retainerHours Hours included in monthly retainer
     * @param float $hoursWorked Hours worked during the month
     * @param array $previousMonthsUnused Unused hours from previous months by month index
     * @param int $rolloverMonths Number of months hours can roll over
     * @param float $previousNegativeBalance Negative balance from previous month
     * @return array Complete month summary with all balance information
     */
    public function calculateMonthSummary(
        float $retainerHours,
        float $hoursWorked,
        array $previousMonthsUnused,
        int $rolloverMonths,
        float $previousNegativeBalance = 0.0
    ): array {
        $opening = $this->calculateOpeningBalance(
            $retainerHours,
            $previousMonthsUnused,
            $rolloverMonths,
            $previousNegativeBalance
        );

        $closing = $this->calculateClosingBalance(
            $opening['total_available'],
            $hoursWorked,
            $opening['effective_retainer_hours'],
            $opening['rollover_hours']
        );

        return [
            'opening' => $opening,
            'hours_worked' => round($hoursWorked, 4),
            'closing' => $closing,
        ];
    }

    /**
     * Calculate hour balances for multiple months in sequence.
     * 
     * @param array $months Array of months with retainer_hours, hours_worked, year_month keys
     * @param int $rolloverMonths Number of months hours can roll over
     * @return array Array of month summaries
     */
    public function calculateMultipleMonths(array $months, int $rolloverMonths): array
    {
        $results = [];
        $unusedByMonth = []; // Track unused hours by month for rollover calculation

        foreach ($months as $index => $month) {
            $retainerHours = $month['retainer_hours'] ?? 0.0;
            $hoursWorked = $month['hours_worked'] ?? 0.0;
            $yearMonth = $month['year_month'] ?? '';

            // Build previous months unused array (indexed by months ago)
            $previousMonthsUnused = [];
            $monthKeys = array_keys($unusedByMonth);
            $monthCount = count($monthKeys);
            
            for ($i = 0; $i < $monthCount; $i++) {
                $monthsAgo = $monthCount - $i; // 1 = most recent, 2 = second most recent, etc.
                $previousMonthsUnused[$monthsAgo] = $unusedByMonth[$monthKeys[$i]];
            }

            // Get negative balance from previous month if any
            $previousNegativeBalance = 0.0;
            if ($index > 0 && isset($results[$index - 1]['closing']['negative_balance'])) {
                $previousNegativeBalance = $results[$index - 1]['closing']['negative_balance'];
            }

            $summary = $this->calculateMonthSummary(
                $retainerHours,
                $hoursWorked,
                $previousMonthsUnused,
                $rolloverMonths,
                $previousNegativeBalance
            );

            // Deduct used rollover hours from the history stack (FIFO)
            $usedRollover = $summary['closing']['hours_used_from_rollover'];
            if ($usedRollover > 0) {
                // unusedByMonth is chronological (FIFO)
                foreach ($unusedByMonth as $key => $amount) {
                    if ($usedRollover <= 0) break;
                    
                    // Only deduct from months that were actually eligible for rollover
                    // We need to check if this specific month key was eligible.
                    // But since we built previousMonthsUnused from all valid unusedByMonth, 
                    // and assuming calculateOpeningBalance summed them all...
                    // Wait, calculateOpeningBalance filters based on rolloverMonths.
                    // We should only deduct from those that passed the filter.
                    
                    // Recalculate monthsAgo for this key
                    // We need to know the index relative to current processing month
                    // This is complicated to do inside this loop cleanly without re-logic.
                    
                    // SIMPLIFICATION:
                    // If we assume the caller provided months in order, and we are processing chronologically.
                    // The entries in unusedByMonth are those that haven't been pruned.
                    // Pruning happens at the end of the loop.
                    // But we only want to deduct from "valid" rollover sources.
                    // If an entry is too old (will expire this month), it contributed to expiredHours, NOT rolloverHours.
                    // So we shouldn't deduct usedRollover from it? 
                    // Or should we? If it expired, it wasn't used.
                    // So we should only deduct from monthsAgo <= rolloverMonths.
                    
                    // We can find the key in monthKeys
                    $keyIndex = array_search($key, $monthKeys);
                    // monthKeys contains keys UP TO this iteration? No, unusedByMonth grows.
                    // monthKeys was snapshot at start of loop.
                    // Let's rely on calculating monthsAgo.
                    // The current month is $index.
                    // The stored month index is implicit? No.
                    
                    // Easier: Iterate previousMonthsUnused which has monthsAgo keys.
                    // But previousMonthsUnused is a copy. We need to update unusedByMonth.
                    // We can map monthsAgo back to the key?
                    // $monthKeys[$monthCount - $monthsAgo] ?
                    
                    // Let's just iterate unusedByMonth and check eligibility.
                    // We need the "age" of the entry relative to current processing.
                    // We don't store the date object, just the string key.
                    // But we know unusedByMonth keys are ordered.
                    // The ones at the end are newest.
                    // The ones at the start are oldest.
                    
                    // Total count in unusedByMonth is $monthCount (at start of loop).
                    // Iterate $i from 0 to $monthCount - 1.
                    // Age = $monthCount - $i.
                    // If Age <= rolloverMonths: It is eligible.
                    
                    $take = min($amount, $usedRollover);
                    
                    // Determine age of this entry
                    // We can't easily know age without the full list logic.
                    // But we used $monthKeys earlier.
                    // $monthKeys[$i] corresponds to $unusedByMonth key at index $i.
                    
                    // Let's iterate using the index $i from the earlier loop
                    // But we are outside that loop.
                }
                
                // Re-implementation of deduction logic using monthKeys
                foreach ($monthKeys as $i => $key) {
                    if ($usedRollover <= 0) break;
                    
                    $monthsAgo = $monthCount - $i;
                    if ($monthsAgo <= $rolloverMonths) {
                        // This entry contributed to rollover
                        $amount = $unusedByMonth[$key];
                        $deduct = min($amount, $usedRollover);
                        
                        $unusedByMonth[$key] -= $deduct;
                        $usedRollover -= $deduct;
                        
                        if ($unusedByMonth[$key] <= 0.0001) {
                            unset($unusedByMonth[$key]);
                        }
                    }
                }
            }

            $summary['year_month'] = $yearMonth;
            $results[] = $summary;

            // Track this month's unused hours for future rollover calculations
            // Only track if there are unused hours
            if ($summary['closing']['unused_hours'] > 0) {
                $unusedByMonth[$yearMonth] = $summary['closing']['unused_hours'];
            }

            // Remove expired months from tracking (beyond rollover window)
            // We keep rollover_months + 1 to properly report expired hours in the next month
            if (count($unusedByMonth) > $rolloverMonths + 1) {
                $unusedByMonth = array_slice($unusedByMonth, -($rolloverMonths + 1), null, true);
            }
        }

        return $results;
    }

    /**
     * Get a human-readable description of the hour balance status.
     * 
     * @param array $monthSummary The summary from calculateMonthSummary
     * @return string Description of the status
     */
    public function getStatusDescription(array $monthSummary): string
    {
        $opening = $monthSummary['opening'];
        $closing = $monthSummary['closing'];
        
        $parts = [];

        if (isset($opening['invoiced_negative_balance']) && $opening['invoiced_negative_balance'] > 0) {
            $parts[] = sprintf(
                'Previous negative balance exceeded retainer by %.2f hours (billed at hourly rate)',
                $opening['invoiced_negative_balance']
            );
        }

        if ($closing['negative_balance'] > 0) {
            $parts[] = sprintf(
                'Negative balance of %.2f hours carried forward to next month',
                $closing['negative_balance']
            );
        }
        
        if ($closing['excess_hours'] > 0) {
            $parts[] = sprintf(
                'Exceeded by %.2f hours (billed at hourly rate)',
                $closing['excess_hours']
            );
        }
        
        if ($closing['unused_hours'] > 0) {
            $parts[] = sprintf(
                '%.2f unused hours will roll over',
                $closing['unused_hours']
            );
        }
        
        if ($closing['hours_used_from_rollover'] > 0) {
            $parts[] = sprintf(
                'Used %.2f rollover hours',
                $closing['hours_used_from_rollover']
            );
        }

        if (empty($parts)) {
            return 'All retainer hours used exactly';
        }
        
        return implode('; ', $parts);
    }
}
