<?php

namespace App\Services\ClientManagement;

use App\Services\ClientManagement\DataTransferObjects\ClosingBalance;
use App\Services\ClientManagement\DataTransferObjects\MonthSummary;
use App\Services\ClientManagement\DataTransferObjects\OpeningBalance;

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
     * @param  float  $retainerHours  Hours included in the current month's retainer
     * @param  array  $previousMonthsUnused  Array of unused hours from previous months,
     *                                       indexed by months ago (1 = last month, 2 = two months ago, etc.)
     * @param  int  $rolloverMonths  Number of months hours can roll over (1 = no rollover)
     * @param  float  $previousNegativeBalance  Negative balance carried from previous month
     * @return OpeningBalance
     */
    public function calculateOpeningBalance(
        float $retainerHours,
        array $previousMonthsUnused,
        int $rolloverMonths,
        float $previousNegativeBalance = 0.0
    ): OpeningBalance {
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
            // In the "give and take" model, we carry forward the remaining negative balance
            // instead of billing it immediately.
            $invoicedNegativeBalance = 0.0;
            $effectiveRetainerHours = $retainerHours - $negativeOffset;
        }

        $totalAvailable = $effectiveRetainerHours + $rolloverHours;

        // The remaining negative balance after applying retainer
        $remainingNegativeBalance = max(0, $previousNegativeBalance - $retainerHours);

        return new OpeningBalance(
            retainerHours: round($retainerHours, 4),
            rolloverHours: round($rolloverHours, 4),
            expiredHours: round($expiredHours, 4),
            totalAvailable: round($totalAvailable, 4),
            negativeOffset: round($negativeOffset, 4),
            invoicedNegativeBalance: round($invoicedNegativeBalance, 4),
            effectiveRetainerHours: round($effectiveRetainerHours, 4),
            remainingNegativeBalance: round($remainingNegativeBalance, 4),
        );
    }

    /**
     * Calculate the closing balance for a month after hours are worked.
     *
     * @param  float  $totalAvailable  Total hours available at start of month
     * @param  float  $hoursWorked  Hours worked during the month
     * @param  float  $retainerHours  This month's retainer hours (for categorizing usage)
     * @param  float  $rolloverHours  Available rollover hours from previous months
     * @param  float  $remainingNegativeBalance  Negative balance that was too large to be offset by retainer
     * @return ClosingBalance
     */
    public function calculateClosingBalance(
        float $totalAvailable,
        float $hoursWorked,
        float $retainerHours,
        float $rolloverHours,
        bool $billExcessImmediately = false,
        float $remainingNegativeBalance = 0.0
    ): ClosingBalance {
        $hoursUsedFromRetainer = 0.0;
        $hoursUsedFromRollover = 0.0;
        $unusedHours = 0.0;
        $excessHours = 0.0;
        $negativeBalance = $remainingNegativeBalance;

        if ($hoursWorked <= $retainerHours) {
            // Case C: All work covered by retainer, remainder rolls over
            $hoursUsedFromRetainer = $hoursWorked;
            $unusedHours = $retainerHours - $hoursWorked;
        } elseif ($hoursWorked <= $totalAvailable) {
            // Case A: Used all retainer hours plus some rollover
            $hoursUsedFromRetainer = $retainerHours;
            $hoursUsedFromRollover = $hoursWorked - $retainerHours;
            $unusedHours = 0.0; // Used all of this month's hours
        } else {
            // Case B: Exceeded all available hours
            $hoursUsedFromRetainer = $retainerHours;
            $hoursUsedFromRollover = $rolloverHours;

            if ($billExcessImmediately) {
                $excessHours = $hoursWorked - $totalAvailable;
            } else {
                $excessHours = 0.0;
                $negativeBalance += ($hoursWorked - $totalAvailable);
            }
        }

        return new ClosingBalance(
            hoursUsedFromRetainer: round($hoursUsedFromRetainer, 4),
            hoursUsedFromRollover: round($hoursUsedFromRollover, 4),
            unusedHours: round($unusedHours, 4),
            excessHours: round($excessHours, 4),
            negativeBalance: round($negativeBalance, 4),
            remainingRollover: round(max(0, $rolloverHours - $hoursUsedFromRollover), 4),
        );
    }

    /**
     * Calculate complete month summary combining opening and closing balances.
     *
     * @param  float  $retainerHours  Hours included in monthly retainer
     * @param  float  $hoursWorked  Hours worked during the month
     * @param  array  $previousMonthsUnused  Unused hours from previous months by month index
     * @param  int  $rolloverMonths  Number of months hours can roll over
     * @param  float  $previousNegativeBalance  Negative balance from previous month
     * @return MonthSummary
     */
    public function calculateMonthSummary(
        float $retainerHours,
        float $hoursWorked,
        array $previousMonthsUnused,
        int $rolloverMonths,
        float $previousNegativeBalance = 0.0,
        bool $billExcessImmediately = false,
        string $yearMonth = ''
    ): MonthSummary {
        $opening = $this->calculateOpeningBalance(
            $retainerHours,
            $previousMonthsUnused,
            $rolloverMonths,
            $previousNegativeBalance
        );

        $closing = $this->calculateClosingBalance(
            $opening->totalAvailable,
            $hoursWorked,
            $opening->effectiveRetainerHours,
            $opening->rolloverHours,
            $billExcessImmediately,
            $opening->remainingNegativeBalance
        );

        return new MonthSummary(
            opening: $opening,
            closing: $closing,
            hoursWorked: round($hoursWorked, 4),
            yearMonth: $yearMonth,
            retainerHours: $retainerHours
        );
    }

    /**
     * Calculate hour balances for multiple months in sequence.
     *
     * @param  array  $months  Array of months with retainer_hours, hours_worked, year_month keys
     * @param  int  $rollover_months  Number of months hours can roll over
     * @param  bool  $billExcessImmediately  Whether to bill excess hours immediately or carry them forward as negative balance
     * @return array<MonthSummary> Array of month summaries
     */
    public function calculateMultipleMonths(array $months, int $rolloverMonths, bool $billExcessImmediately = false): array
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
            if ($index > 0) {
                /** @var MonthSummary $prevSummary */
                $prevSummary = $results[$index - 1];
                if ($prevSummary->closing->negativeBalance > 0) {
                    $previousNegativeBalance = $prevSummary->closing->negativeBalance;
                }
            }

            $summary = $this->calculateMonthSummary(
                $retainerHours,
                $hoursWorked,
                $previousMonthsUnused,
                $rolloverMonths,
                $previousNegativeBalance,
                $billExcessImmediately,
                $yearMonth
            );

            // Deduct used rollover hours from the history stack (FIFO)
            $usedRollover = $summary->closing->hoursUsedFromRollover;
            if ($usedRollover > 0) {
                // Re-implementation of deduction logic using monthKeys
                foreach ($monthKeys as $i => $key) {
                    if ($usedRollover <= 0) {
                        break;
                    }

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

            $results[] = $summary;

            // Track this month's unused hours for future rollover calculations
            // Only track if there are unused hours
            if ($summary->closing->unusedHours > 0) {
                $unusedByMonth[$yearMonth] = $summary->closing->unusedHours;
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
     * @param  MonthSummary  $monthSummary  The summary from calculateMonthSummary
     * @return string Description of the status
     */
    public function getStatusDescription(MonthSummary $monthSummary): string
    {
        $opening = $monthSummary->opening;
        $closing = $monthSummary->closing;

        $parts = [];

        if ($opening->invoicedNegativeBalance > 0) {
            $parts[] = sprintf(
                'Previous negative balance exceeded retainer by %.2f hours (billed at hourly rate)',
                $opening->invoicedNegativeBalance
            );
        }

        if ($closing->negativeBalance > 0) {
            $parts[] = sprintf(
                'Negative balance of %.2f hours carried forward to next month',
                $closing->negativeBalance
            );
        }

        if ($closing->excessHours > 0) {
            $parts[] = sprintf(
                'Exceeded by %.2f hours (billed at hourly rate)',
                $closing->excessHours
            );
        }

        if ($closing->unusedHours > 0) {
            $parts[] = sprintf(
                '%.2f unused hours will roll over',
                $closing->unusedHours
            );
        }

        if ($closing->hoursUsedFromRollover > 0) {
            $parts[] = sprintf(
                'Used %.2f rollover hours',
                $closing->hoursUsedFromRollover
            );
        }

        if (empty($parts)) {
            return 'All retainer hours used exactly';
        }

        return implode('; ', $parts);
    }
}
