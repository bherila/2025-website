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
            // If rollover_months is 1, hours don't roll over (this month only)
            // If rollover_months is 2, hours from 1 month ago roll over, but 2+ expire
            // If rollover_months is 3, hours from 1-2 months ago roll over, 3+ expire
            if ($rolloverMonths > 1 && $monthsAgo < $rolloverMonths) {
                $rolloverHours += $unusedHours;
            } else {
                $expiredHours += $unusedHours;
            }
        }

        // Apply negative balance offset (subtract from this month's retainer hours first)
        $negativeOffset = 0.0;
        $effectiveRetainerHours = $retainerHours;
        
        if ($previousNegativeBalance > 0) {
            $negativeOffset = min($previousNegativeBalance, $retainerHours);
            $effectiveRetainerHours = $retainerHours - $negativeOffset;
        }

        $totalAvailable = $effectiveRetainerHours + $rolloverHours;

        return [
            'retainer_hours' => round($retainerHours, 4),
            'rollover_hours' => round($rolloverHours, 4),
            'expired_hours' => round($expiredHours, 4),
            'total_available' => round($totalAvailable, 4),
            'negative_offset' => round($negativeOffset, 4),
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
            $excessHours = $hoursWorked - $totalAvailable;
            $negativeBalance = 0.0; // Excess is billed, not carried as negative
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

            $summary['year_month'] = $yearMonth;
            $results[] = $summary;

            // Track this month's unused hours for future rollover calculations
            // Only track if there are unused hours
            if ($summary['closing']['unused_hours'] > 0) {
                $unusedByMonth[$yearMonth] = $summary['closing']['unused_hours'];
            }

            // Remove expired months from tracking (beyond rollover window)
            if (count($unusedByMonth) >= $rolloverMonths) {
                // Keep only the most recent rollover_months - 1 entries
                $unusedByMonth = array_slice($unusedByMonth, -($rolloverMonths - 1), null, true);
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
        $closing = $monthSummary['closing'];
        
        if ($closing['excess_hours'] > 0) {
            return sprintf(
                'Exceeded by %.2f hours (will be billed at hourly rate)',
                $closing['excess_hours']
            );
        }
        
        if ($closing['unused_hours'] > 0) {
            return sprintf(
                '%.2f unused hours will roll over',
                $closing['unused_hours']
            );
        }
        
        if ($closing['hours_used_from_rollover'] > 0) {
            return sprintf(
                'Used %.2f rollover hours',
                $closing['hours_used_from_rollover']
            );
        }
        
        return 'All retainer hours used exactly';
    }
}
