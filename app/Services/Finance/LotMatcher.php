<?php

namespace App\Services\Finance;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccountLot;
use Carbon\CarbonInterface;

class LotMatcher
{
    public const MONEY_TOLERANCE = 0.01;

    public const QUANTITY_TOLERANCE = 0.000001;

    public const DATE_TOLERANCE_DAYS = 2;

    public function sameDisposition(
        FinAccountLot $reportedLot,
        FinAccountLot $accountLot,
        float $moneyTolerance = self::MONEY_TOLERANCE,
        float $quantityTolerance = self::QUANTITY_TOLERANCE,
    ): bool {
        if ((int) $reportedLot->acct_id !== (int) $accountLot->acct_id) {
            return false;
        }

        if ($this->normalizeSymbol($reportedLot->symbol) !== $this->normalizeSymbol($accountLot->symbol)) {
            return false;
        }

        if ($this->dateValue($reportedLot->sale_date) !== $this->dateValue($accountLot->sale_date)) {
            return false;
        }

        return $this->numericClose(abs($this->numericValue($reportedLot->quantity)), abs($this->numericValue($accountLot->quantity)), $quantityTolerance)
            && $this->numericClose($this->numericValue($reportedLot->proceeds), $this->numericValue($accountLot->proceeds), $moneyTolerance);
    }

    public function taxValuesMatch(
        FinAccountLot $reportedLot,
        FinAccountLot $accountLot,
        float $moneyTolerance = self::MONEY_TOLERANCE,
    ): bool {
        return $this->nullableNumericClose($reportedLot->cost_basis, $accountLot->cost_basis, $moneyTolerance)
            && $this->nullableNumericClose($reportedLot->realized_gain_loss, $accountLot->realized_gain_loss, $moneyTolerance);
    }

    public function matchingSellTransactionExists(FinAccountLot $lot): bool
    {
        return $this->matchingSellTransaction($lot) instanceof FinAccountLineItems;
    }

    /**
     * @param  int[]  $excludedTransactionIds
     */
    public function matchingBuyTransaction(FinAccountLot $lot, array $excludedTransactionIds = []): ?FinAccountLineItems
    {
        $purchaseDate = $this->dateValue($lot->purchase_date);
        if ($purchaseDate === null || $this->shouldSkipOpeningMatch($lot, $purchaseDate)) {
            return null;
        }

        return $this->matchingTransaction(
            $lot,
            $purchaseDate,
            ['Buy', 'Reinvest', 'Sell Short'],
            $this->numericValue($lot->quantity),
            $this->numericValue($lot->cost_basis),
            $excludedTransactionIds,
        );
    }

    /**
     * @param  int[]  $excludedTransactionIds
     */
    public function matchingSellTransaction(FinAccountLot $lot, array $excludedTransactionIds = []): ?FinAccountLineItems
    {
        $saleDate = $this->dateValue($lot->sale_date);
        if ($saleDate === null || $lot->proceeds === null) {
            return null;
        }

        return $this->matchingTransaction(
            $lot,
            $saleDate,
            ['Sell', 'Cover', 'Merger', 'Cash In Lieu'],
            $this->numericValue($lot->quantity),
            $this->numericValue($lot->proceeds),
            $excludedTransactionIds,
        );
    }

    /**
     * @return array{quantity: float, proceeds: float, cost_basis: float, realized_gain_loss: float, sale_date_days: int|null}
     */
    public function deltas(FinAccountLot $reportedLot, ?FinAccountLot $accountLot): array
    {
        if ($accountLot === null) {
            return [
                'quantity' => 0.0,
                'proceeds' => 0.0,
                'cost_basis' => 0.0,
                'realized_gain_loss' => 0.0,
                'sale_date_days' => null,
            ];
        }

        return [
            'quantity' => $this->numericValue($accountLot->quantity) - $this->numericValue($reportedLot->quantity),
            'proceeds' => $this->numericValue($accountLot->proceeds) - $this->numericValue($reportedLot->proceeds),
            'cost_basis' => $this->numericValue($accountLot->cost_basis) - $this->numericValue($reportedLot->cost_basis),
            'realized_gain_loss' => $this->numericValue($accountLot->realized_gain_loss) - $this->numericValue($reportedLot->realized_gain_loss),
            'sale_date_days' => $this->dateDeltaDays($reportedLot, $accountLot),
        ];
    }

    public function numericValue(mixed $value): float
    {
        if ($value === null || $value === '') {
            return 0.0;
        }

        return (float) $value;
    }

    public function dateValue(mixed $value): ?string
    {
        if ($value instanceof CarbonInterface) {
            return $value->toDateString();
        }

        if ($value instanceof \DateTimeInterface) {
            return $value->format('Y-m-d');
        }

        if (is_string($value) && trim($value) !== '') {
            return substr(trim($value), 0, 10);
        }

        return null;
    }

    private function normalizeSymbol(mixed $symbol): string
    {
        return strtoupper(trim((string) $symbol));
    }

    /**
     * @param  string[]  $types
     * @param  int[]  $excludedTransactionIds
     */
    private function matchingTransaction(
        FinAccountLot $lot,
        string $date,
        array $types,
        float $quantity,
        float $amount,
        array $excludedTransactionIds = [],
    ): ?FinAccountLineItems {
        $symbol = $this->normalizeSymbol($lot->symbol);
        $cusip = $this->normalizeSymbol($lot->cusip ?? null);

        if ($symbol === '' && $cusip === '') {
            return null;
        }

        [$dateStart, $dateEnd] = $this->dateWindow($date);

        return FinAccountLineItems::query()
            ->where('t_account', (int) $lot->acct_id)
            ->whereBetween('t_date', [$dateStart, $dateEnd])
            ->whereIn('t_type', $types)
            ->when($excludedTransactionIds !== [], fn ($query) => $query->whereNotIn('t_id', $excludedTransactionIds))
            ->where(function ($query) use ($symbol, $cusip): void {
                if ($symbol !== '') {
                    $query->orWhere('t_symbol', $symbol);
                }

                if ($cusip !== '') {
                    $query->orWhere('t_cusip', $cusip);
                }
            })
            ->orderBy('t_id')
            ->get()
            ->filter(fn (FinAccountLineItems $transaction): bool => $this->numericClose(
                abs($this->numericValue($transaction->t_qty)),
                abs($quantity),
                self::QUANTITY_TOLERANCE,
            ) && $this->numericClose(
                abs($this->numericValue($transaction->t_amt)),
                abs($amount),
                self::MONEY_TOLERANCE,
            ))
            ->sort(function (FinAccountLineItems $left, FinAccountLineItems $right) use ($date): int {
                $dateComparison = $this->dateDistanceDays($left->t_date, $date) <=> $this->dateDistanceDays($right->t_date, $date);
                if ($dateComparison !== 0) {
                    return $dateComparison;
                }

                return (int) $left->t_id <=> (int) $right->t_id;
            })
            ->first();
    }

    /**
     * Long-term "various" 1099-B rows are stored with purchase_date = sale_date
     * only because the database requires a purchase_date; do not report noisy
     * missing buy matches for those placeholder dates.
     */
    private function shouldSkipOpeningMatch(FinAccountLot $lot, string $purchaseDate): bool
    {
        return $lot->is_short_term === false
            && $this->dateValue($lot->sale_date) === $purchaseDate;
    }

    /**
     * @return array{0: string, 1: string}
     */
    private function dateWindow(string $date): array
    {
        $center = new \DateTimeImmutable($date);

        return [
            $center->modify('-'.self::DATE_TOLERANCE_DAYS.' days')->format('Y-m-d'),
            $center->modify('+'.self::DATE_TOLERANCE_DAYS.' days')->format('Y-m-d'),
        ];
    }

    private function dateDistanceDays(mixed $left, string $right): int
    {
        $leftDate = $this->dateValue($left);
        if ($leftDate === null) {
            return PHP_INT_MAX;
        }

        return abs((int) (new \DateTimeImmutable($leftDate))->diff(new \DateTimeImmutable($right))->format('%r%a'));
    }

    private function numericClose(float $left, float $right, float $tolerance): bool
    {
        return abs($left - $right) <= $tolerance;
    }

    private function nullableNumericClose(mixed $left, mixed $right, float $tolerance): bool
    {
        if (($left === null || $left === '') && ($right === null || $right === '')) {
            return true;
        }

        if ($left === null || $left === '' || $right === null || $right === '') {
            return false;
        }

        return $this->numericClose((float) $left, (float) $right, $tolerance);
    }

    private function dateDeltaDays(FinAccountLot $reportedLot, FinAccountLot $accountLot): ?int
    {
        $reportedDate = $this->dateValue($reportedLot->sale_date);
        $accountDate = $this->dateValue($accountLot->sale_date);
        if ($reportedDate === null || $accountDate === null) {
            return null;
        }

        return (int) (new \DateTimeImmutable($reportedDate))->diff(new \DateTimeImmutable($accountDate))->format('%r%a');
    }
}
