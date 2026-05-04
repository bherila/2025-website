<?php

namespace App\Services\Finance\CapitalGains;

use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * Cross-account wash-sale analysis engine.
 *
 * Detects wash sales at the taxpayer level — both within a single account and
 * across multiple accounts — by querying fin_account_lots for all sales and
 * purchases within the IRS 61-day window (30 days before/after the sale date).
 *
 * A wash sale is triggered when:
 *   1. A security (or substantially identical security) is sold at a loss.
 *   2. The same (or substantially identical) security is purchased within 30
 *      calendar days before or after the sale date in ANY taxable account.
 *
 * Broker-reported wash sales (same-account) are detected here as well, so
 * callers can separate them from cross-account adjustments using
 * WashSaleAdjustment::$isCrossAccount.
 *
 * Currency arithmetic uses plain floats; callers should round to cents before
 * display.  The engine does not write to the database — it only reads.
 */
class WashSaleAnalysisEngine
{
    /**
     * Number of calendar days in each direction around a loss sale that
     * constitutes the IRS wash-sale window (§1091).
     */
    private const WASH_WINDOW_DAYS = 30;

    /**
     * Run wash-sale analysis across all taxable accounts for a given user and
     * tax year.
     *
     * Only account lots with a sale in $taxYear are examined as potential loss
     * sales.  Replacement purchases are searched in a ±30-day window that can
     * span across year boundaries.
     *
     * @param  int[]  $accountIds  IDs of accounts to include (must all belong to $userId)
     * @return WashSaleAdjustment[]
     */
    public function analyze(array $accountIds, int $taxYear): array
    {
        if ($accountIds === []) {
            return [];
        }

        $lossSales = $this->lossSalesInYear($accountIds, $taxYear);
        if ($lossSales->isEmpty()) {
            return [];
        }

        $windowStart = Carbon::createFromDate($taxYear, 1, 1)->subDays(self::WASH_WINDOW_DAYS)->startOfDay();
        $windowEnd = Carbon::createFromDate($taxYear, 12, 31)->addDays(self::WASH_WINDOW_DAYS)->endOfDay();

        $purchases = $this->purchasesInWindow($accountIds, $windowStart, $windowEnd);

        /** @var array<string, Collection<int, FinAccountLot>> $purchasesBySymbol */
        $purchasesBySymbol = $purchases->groupBy(fn (FinAccountLot $lot): string => $this->normalizeSymbol((string) $lot->symbol))->all();

        $adjustments = [];
        foreach ($lossSales as $sale) {
            $adjustment = $this->detectWashSale($sale, $purchasesBySymbol);
            if ($adjustment !== null) {
                $adjustments[] = $adjustment;
            }
        }

        return $adjustments;
    }

    /**
     * Detect a wash sale for a single loss-sale lot.
     *
     * Returns a WashSaleAdjustment if a disqualifying replacement purchase is
     * found within the 61-day window, or null if the sale is clean.
     *
     * @param  array<string, Collection<int, FinAccountLot>>  $purchasesBySymbol
     */
    public function detectWashSale(FinAccountLot $sale, array $purchasesBySymbol): ?WashSaleAdjustment
    {
        if (! $this->isLossSale($sale)) {
            return null;
        }

        $saleDate = $this->parseDate($sale->sale_date);
        if ($saleDate === null) {
            return null;
        }

        $saleSymbol = $this->normalizeSymbol((string) $sale->symbol);
        $candidates = $purchasesBySymbol[$saleSymbol] ?? collect();

        $saleAccount = $sale->account;
        $saleAccountName = $saleAccount instanceof FinAccounts ? (string) $saleAccount->acct_name : null;

        foreach ($candidates as $purchase) {
            if ((int) $purchase->lot_id === (int) $sale->lot_id) {
                continue;
            }

            $purchaseDate = $this->parseDate($purchase->purchase_date);
            if ($purchaseDate === null) {
                continue;
            }

            if (! $this->isWithinWashWindow($saleDate, $purchaseDate)) {
                continue;
            }

            $disallowedLoss = $this->computeDisallowedLoss($sale, $purchase);
            if ($disallowedLoss <= 0) {
                continue;
            }

            $isCrossAccount = (int) $sale->acct_id !== (int) $purchase->acct_id;
            $purchaseAccount = $purchase->account;
            $purchaseAccountName = $purchaseAccount instanceof FinAccounts ? (string) $purchaseAccount->acct_name : null;

            return new WashSaleAdjustment(
                id: "ws:lot:{$sale->lot_id}:lot:{$purchase->lot_id}",
                lossSaleId: "account_lot:{$sale->lot_id}",
                replacementPurchaseId: "account_lot:{$purchase->lot_id}",
                symbol: (string) $sale->symbol,
                saleDateStr: $saleDate->format('Y-m-d'),
                replacementDateStr: $purchaseDate->format('Y-m-d'),
                disallowedLoss: $disallowedLoss,
                saleAccountId: (int) $sale->acct_id,
                saleAccountName: $saleAccountName,
                replacementAccountId: (int) $purchase->acct_id,
                replacementAccountName: $purchaseAccountName,
                isCrossAccount: $isCrossAccount,
                reason: $this->buildReason($sale, $purchaseDate, $isCrossAccount, $purchaseAccountName),
                saleLotId: (int) $sale->lot_id,
                replacementLotId: (int) $purchase->lot_id,
            );
        }

        return null;
    }

    // -------------------------------------------------------------------------
    // Data loading
    // -------------------------------------------------------------------------

    /**
     * @param  int[]  $accountIds
     * @return Collection<int, FinAccountLot>
     */
    private function lossSalesInYear(array $accountIds, int $taxYear): Collection
    {
        return FinAccountLot::query()
            ->whereIn('acct_id', $accountIds)
            ->whereBetween('sale_date', ["{$taxYear}-01-01", "{$taxYear}-12-31"])
            ->whereNull('superseded_by_lot_id')
            ->whereNotNull('proceeds')
            ->where(function ($query): void {
                $query->whereRaw('CAST(realized_gain_loss AS DECIMAL(12,4)) < 0')
                    ->orWhereRaw('(realized_gain_loss IS NULL AND CAST(proceeds AS DECIMAL(12,4)) - CAST(cost_basis AS DECIMAL(12,4)) < 0)');
            })
            ->with(['account:acct_id,acct_name'])
            ->orderBy('sale_date')
            ->orderBy('lot_id')
            ->get();
    }

    /**
     * @param  int[]  $accountIds
     * @return Collection<int, FinAccountLot>
     */
    private function purchasesInWindow(array $accountIds, Carbon $windowStart, Carbon $windowEnd): Collection
    {
        return FinAccountLot::query()
            ->whereIn('acct_id', $accountIds)
            ->whereBetween('purchase_date', [$windowStart->format('Y-m-d'), $windowEnd->format('Y-m-d')])
            ->whereNull('superseded_by_lot_id')
            ->whereNotNull('purchase_date')
            ->with(['account:acct_id,acct_name'])
            ->orderBy('purchase_date')
            ->orderBy('lot_id')
            ->get();
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private function isLossSale(FinAccountLot $lot): bool
    {
        if ($lot->realized_gain_loss !== null) {
            return (float) $lot->realized_gain_loss < 0;
        }

        // Both proceeds and cost_basis have decimal casts and are numeric when present.
        return ((float) $lot->proceeds) - ((float) $lot->cost_basis) < 0;
    }

    private function parseDate(mixed $date): ?Carbon
    {
        if ($date === null) {
            return null;
        }

        if ($date instanceof Carbon) {
            return $date;
        }

        if ($date instanceof \DateTimeInterface) {
            return Carbon::instance($date);
        }

        $str = trim((string) $date);
        if ($str === '') {
            return null;
        }

        return Carbon::parse($str);
    }

    private function isWithinWashWindow(Carbon $saleDate, Carbon $purchaseDate): bool
    {
        $washStart = $saleDate->copy()->subDays(self::WASH_WINDOW_DAYS);
        $washEnd = $saleDate->copy()->addDays(self::WASH_WINDOW_DAYS);

        if ($purchaseDate->isSameDay($saleDate)) {
            return false;
        }

        return $purchaseDate->greaterThanOrEqualTo($washStart)
            && $purchaseDate->lessThanOrEqualTo($washEnd);
    }

    private function computeDisallowedLoss(FinAccountLot $sale, FinAccountLot $purchase): float
    {
        $saleQty = abs((float) $sale->quantity);
        $purchaseQty = abs((float) $purchase->quantity);
        $totalLoss = abs((float) ($sale->realized_gain_loss ?? ((float) $sale->proceeds - (float) $sale->cost_basis)));

        if ($saleQty <= 0) {
            return 0.0;
        }

        $ratio = min(1.0, $purchaseQty / $saleQty);

        return round($totalLoss * $ratio, 4);
    }

    private function normalizeSymbol(string $symbol): string
    {
        return strtoupper(trim($symbol));
    }

    private function buildReason(
        FinAccountLot $sale,
        Carbon $purchaseDate,
        bool $isCrossAccount,
        ?string $purchaseAccountName,
    ): string {
        $symbol = (string) $sale->symbol;
        $purchaseDateStr = $purchaseDate->format('Y-m-d');

        if ($isCrossAccount) {
            $replacementAccount = $purchaseAccountName ?? 'another account';

            return "Cross-account wash sale: purchased {$symbol} in \"{$replacementAccount}\" on {$purchaseDateStr} "
                .'within 30 days of loss sale (§1091). This adjustment is a taxpayer-level fact '
                .'and may not appear on any single 1099-B.';
        }

        return "Purchased substantially identical stock ({$symbol}) on {$purchaseDateStr} "
            .'within the 30-day wash sale window (§1091).';
    }
}
