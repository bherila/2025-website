<?php

namespace App\Services\Finance\Rsu;

use App\Models\FinanceTool\FinEquityAwards;
use App\Services\Finance\StockQuotes\StockQuoteService;
use Illuminate\Support\Carbon;

class RsuVestPriceBackfillService
{
    public function __construct(
        private readonly StockQuoteService $stockQuoteService,
        private readonly RsuSettlementService $settlementService,
    ) {}

    /** @return array{updated: array<int, int>, missing: array<int, int>} */
    public function backfillMissingVestPrices(int $userId): array
    {
        $awards = FinEquityAwards::query()
            ->where('uid', $userId)
            ->whereNull('vest_price')
            ->whereDate('vest_date', '<=', Carbon::today('America/Los_Angeles')->format('Y-m-d'))
            ->get();

        $this->stockQuoteService->ensureCoverageForAwards($awards);
        $closes = $this->stockQuoteService->closesForAwards($awards);
        $updated = [];
        $missing = [];
        $affectedBuckets = [];

        foreach ($awards as $award) {
            $close = $closes[$award->id] ?? $this->stockQuoteService->closeOnOrBefore((string) $award->symbol, (string) $award->vest_date);
            if ($close === null) {
                $missing[] = (int) $award->id;

                continue;
            }

            $award->vest_price = $close;
            $award->vest_price_source = RsuAwardService::PRICE_SOURCE_QUOTE_CLOSE;
            $award->vest_price_fetched_at = now();
            $award->save();
            $updated[] = (int) $award->id;

            $vestDate = Carbon::parse((string) $award->vest_date)->format('Y-m-d');
            $symbol = strtoupper((string) $award->symbol);
            $affectedBuckets[$vestDate.'|'.$symbol] = [$vestDate, $symbol];
        }

        foreach ($affectedBuckets as [$vestDate, $symbol]) {
            $this->settlementService->reconcileAfterAwardChange($userId, $vestDate, $symbol);
        }

        return ['updated' => $updated, 'missing' => $missing];
    }
}
