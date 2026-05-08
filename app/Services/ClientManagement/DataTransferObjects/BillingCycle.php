<?php

namespace App\Services\ClientManagement\DataTransferObjects;

use Carbon\Carbon;

/**
 * Represents a single billing cycle produced by BillingCycleResolver.
 *
 * A cycle spans [$start, $end] inclusive and covers $monthCount calendar
 * months. For a prorated first cycle, $isProrated = true and the month
 * count may be less than the cadence's standard monthsInCycle().
 */
class BillingCycle
{
    /**
     * @param  Carbon[]  $monthStarts  First day of each calendar month in this cycle, sorted ascending.
     */
    public function __construct(
        public readonly Carbon $start,
        public readonly Carbon $end,
        public readonly bool $isProrated,
        public readonly int $monthCount,
        public readonly array $monthStarts,
    ) {}
}
