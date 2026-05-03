<?php

namespace App\Services\Finance;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccountLot;
use Carbon\CarbonInterface;

class LotMatcher
{
    private const OPEN_TRANSACTION_TYPES = [
        'buy',
        'reinvest',
        'sell short',
        'sell to open',
        'short sale',
    ];

    private const CLOSE_TRANSACTION_TYPES = [
        'sell',
        'cover',
        'buy to cover',
        'buy to close',
        'sell to close',
        'merger',
        'cash in lieu',
    ];

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
            self::OPEN_TRANSACTION_TYPES,
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
            self::CLOSE_TRANSACTION_TYPES,
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
        [$dateDistanceOrderSql, $dateDistanceOrderBindings] = $this->dateDistanceOrder($date);
        [$quantityMin, $quantityMax] = $this->toleranceBounds($quantity, self::QUANTITY_TOLERANCE);
        [$amountMin, $amountMax] = $this->toleranceBounds($amount, self::MONEY_TOLERANCE);
        $typePlaceholders = implode(', ', array_fill(0, count($types), '?'));

        $query = FinAccountLineItems::query()
            ->where('t_account', (int) $lot->acct_id)
            ->whereBetween('t_date', [$dateStart, $dateEnd])
            ->whereRaw("LOWER(t_type) IN ({$typePlaceholders})", $types)
            ->when($excludedTransactionIds !== [], fn ($query) => $query->whereNotIn('t_id', $excludedTransactionIds))
            ->where(function ($query) use ($symbol, $cusip): void {
                if ($symbol !== '') {
                    $query->orWhere('t_symbol', $symbol);
                }

                if ($cusip !== '') {
                    $query->orWhere('t_cusip', $cusip);
                }
            })
            ->whereRaw('ABS(CAST(COALESCE(t_qty, 0) AS REAL)) BETWEEN CAST(? AS REAL) AND CAST(? AS REAL)', [$quantityMin, $quantityMax])
            ->whereRaw('ABS(CAST(COALESCE(t_amt, 0) AS REAL)) BETWEEN CAST(? AS REAL) AND CAST(? AS REAL)', [$amountMin, $amountMax])
            ->orderByRaw($dateDistanceOrderSql, $dateDistanceOrderBindings)
            ->orderBy('t_id');

        return $query->first();
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

    /**
     * @return array{0: string, 1: string[]}
     */
    private function dateDistanceOrder(string $date): array
    {
        $center = new \DateTimeImmutable($date);
        $clauses = ['WHEN t_date = ? THEN 0'];
        $bindings = [$center->format('Y-m-d')];

        for ($distance = 1; $distance <= self::DATE_TOLERANCE_DAYS; $distance++) {
            $clauses[] = "WHEN t_date IN (?, ?) THEN {$distance}";
            $bindings[] = $center->modify("-{$distance} days")->format('Y-m-d');
            $bindings[] = $center->modify("+{$distance} days")->format('Y-m-d');
        }

        return ['CASE '.implode(' ', $clauses).' ELSE '.(self::DATE_TOLERANCE_DAYS + 1).' END', $bindings];
    }

    /**
     * @return array{0: float, 1: float}
     */
    private function toleranceBounds(float $value, float $tolerance): array
    {
        $absoluteValue = abs($value);

        return [max(0.0, $absoluteValue - $tolerance), $absoluteValue + $tolerance];
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
