<?php

namespace App\Services\ClientManagement;

use App\Enums\ClientManagement\BillingCadence;
use App\Enums\ClientManagement\FirstCycleProration;
use App\Models\ClientManagement\ClientAgreement;
use App\Services\ClientManagement\DataTransferObjects\BillingCycle;
use Carbon\Carbon;
use Carbon\CarbonInterface;

/**
 * Resolves billing cycles for a client agreement.
 *
 * The monthly ledger (RolloverCalculator) remains the authoritative source.
 * BillingCycleResolver only determines *how* those months are grouped into
 * invoiceable cycles — it does not recalculate rollover math.
 */
class BillingCycleResolver
{
    /**
     * Yield each billing cycle from the agreement's active date through
     * min(termination_date, $through), calendar-aligned.
     *
     * @return iterable<BillingCycle>
     */
    public function cyclesForAgreement(ClientAgreement $agreement, CarbonInterface $through): iterable
    {
        $cadence = $agreement->effectiveBillingCadence();
        $proration = $agreement->effectiveFirstCycleProration();
        $activeDate = Carbon::instance($agreement->active_date)->startOfDay();
        $terminationDate = $agreement->termination_date
            ? Carbon::instance($agreement->termination_date)->startOfDay()
            : null;

        $ceiling = Carbon::instance($through)->startOfDay();
        if ($terminationDate !== null && $terminationDate->lt($ceiling)) {
            $ceiling = $terminationDate->copy();
        }

        if ($activeDate->gt($ceiling)) {
            return;
        }

        // For monthly cadence, always treat as align_next_cycle / no proration needed
        if ($cadence === BillingCadence::Monthly) {
            foreach ($this->generateMonthlyCycles($activeDate, $ceiling) as $cycle) {
                yield $cycle;
            }

            return;
        }

        // Non-monthly cadences: handle first cycle per proration policy
        $firstCycleStart = $cadence->cycleStart($activeDate);
        $firstCycleEnd = $cadence->cycleEnd($activeDate);

        yield from $this->buildFirstCycle($cadence, $proration, $activeDate, $firstCycleStart, $firstCycleEnd, $ceiling);

        // Subsequent full cycles
        $cursor = $firstCycleEnd->copy()->addDay();
        if ($proration === FirstCycleProration::AlignNextCycle) {
            // The stub was already emitted; full cycles start at the next calendar boundary
            $cursor = $cadence->cycleStart($activeDate)->addMonths($cadence->monthsInCycle());
        }

        while ($cursor->lte($ceiling)) {
            $cycleStart = $cursor->copy();
            $cycleEnd = $cadence->cycleEnd($cycleStart);
            $clippedEnd = $cycleEnd->gt($ceiling) ? $ceiling->copy() : $cycleEnd->copy();

            yield $this->makeCycle($cycleStart, $clippedEnd, $clippedEnd->lt($cycleEnd));

            $cursor = $cycleEnd->copy()->addDay();
        }
    }

    /**
     * Return the billing cycle that contains the given $date for $agreement.
     */
    public function cycleContaining(ClientAgreement $agreement, CarbonInterface $date): BillingCycle
    {
        $cadence = $agreement->effectiveBillingCadence();
        $start = $cadence->cycleStart($date);
        $end = $cadence->cycleEnd($date);

        return $this->makeCycle($start, $end, false);
    }

    /**
     * Generate monthly cycles (one per calendar month) between $from and $ceiling.
     *
     * The first cycle starts at $from (not at the beginning of that month), so
     * mid-month agreement starts produce a prorated partial first month.
     *
     * @return iterable<BillingCycle>
     */
    private function generateMonthlyCycles(Carbon $from, Carbon $ceiling): iterable
    {
        $cursor = $from->copy()->startOfMonth();
        $isFirstMonth = true;

        while ($cursor->lte($ceiling)) {
            $cycleStart = $isFirstMonth ? $from->copy() : $cursor->copy();
            $cycleEnd = $cursor->copy()->endOfMonth()->startOfDay();
            $clippedEnd = $cycleEnd->gt($ceiling) ? $ceiling->copy() : $cycleEnd->copy();
            $isProrated = $cycleStart->gt($cursor) || $clippedEnd->lt($cycleEnd);

            yield $this->makeCycle($cycleStart, $clippedEnd, $isProrated);

            $isFirstMonth = false;
            $cursor->addMonth()->startOfMonth();
        }
    }

    /**
     * Build the first cycle according to the proration policy.
     *
     * @return iterable<BillingCycle>
     */
    private function buildFirstCycle(
        BillingCadence $cadence,
        FirstCycleProration $proration,
        Carbon $activeDate,
        Carbon $standardStart,
        Carbon $standardEnd,
        Carbon $ceiling
    ): iterable {
        switch ($proration) {
            case FirstCycleProration::ProrateHours:
                // Bill from activeDate to the end of the first standard cycle
                $clippedEnd = $standardEnd->gt($ceiling) ? $ceiling->copy() : $standardEnd->copy();
                $isProrated = $activeDate->gt($standardStart) || $clippedEnd->lt($standardEnd);

                yield $this->makeCycle($activeDate->copy(), $clippedEnd, $isProrated);
                break;

            case FirstCycleProration::FullPeriod:
                $clippedEnd = $standardEnd->gt($ceiling) ? $ceiling->copy() : $standardEnd->copy();

                yield $this->makeCycle($activeDate->copy(), $clippedEnd, false);
                break;

            case FirstCycleProration::AlignNextCycle:
                // Emit a short stub from activeDate to the end of the first standard cycle,
                // then full cycles begin at the next boundary.
                $stubEnd = $standardEnd->gt($ceiling) ? $ceiling->copy() : $standardEnd->copy();

                if ($activeDate->eq($standardStart)) {
                    // Agreement starts exactly on a cycle boundary — emit a regular first cycle
                    yield $this->makeCycle($activeDate->copy(), $stubEnd, $stubEnd->lt($standardEnd));
                } else {
                    // Stub period (treated as monthly-like)
                    yield $this->makeCycle($activeDate->copy(), $stubEnd, true);
                }
                break;
        }
    }

    /**
     * Build a BillingCycle DTO from a [start, end] date range.
     */
    private function makeCycle(Carbon $start, Carbon $end, bool $isProrated): BillingCycle
    {
        $monthStarts = [];
        $cursor = $start->copy()->startOfMonth();

        while ($cursor->lte($end)) {
            $monthStarts[] = $cursor->copy();
            $cursor->addMonth()->startOfMonth();
        }

        return new BillingCycle(
            start: $start,
            end: $end,
            isProrated: $isProrated,
            monthCount: count($monthStarts),
            monthStarts: $monthStarts,
        );
    }
}
