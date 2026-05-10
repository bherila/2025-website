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
            && $this->nullableNumericClose($reportedLot->realized_gain_loss, $accountLot->realized_gain_loss, $moneyTolerance)
            && $this->zeroEquivalentNumericClose($reportedLot->wash_sale_disallowed, $accountLot->wash_sale_disallowed, $moneyTolerance)
            && $this->zeroEquivalentNumericClose($reportedLot->accrued_market_discount, $accountLot->accrued_market_discount, $moneyTolerance);
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
     * @return array{quantity: float, proceeds: float, cost_basis: float, realized_gain_loss: float, wash_sale_disallowed: float, accrued_market_discount: float, sale_date_days: int|null}
     */
    public function deltas(FinAccountLot $reportedLot, ?FinAccountLot $accountLot): array
    {
        if ($accountLot === null) {
            return [
                'quantity' => 0.0,
                'proceeds' => 0.0,
                'cost_basis' => 0.0,
                'realized_gain_loss' => 0.0,
                'wash_sale_disallowed' => 0.0,
                'accrued_market_discount' => 0.0,
                'sale_date_days' => null,
            ];
        }

        return [
            'quantity' => $this->numericValue($accountLot->quantity) - $this->numericValue($reportedLot->quantity),
            'proceeds' => $this->numericValue($accountLot->proceeds) - $this->numericValue($reportedLot->proceeds),
            'cost_basis' => $this->numericValue($accountLot->cost_basis) - $this->numericValue($reportedLot->cost_basis),
            'realized_gain_loss' => $this->numericValue($accountLot->realized_gain_loss) - $this->numericValue($reportedLot->realized_gain_loss),
            'wash_sale_disallowed' => $this->numericValue($accountLot->wash_sale_disallowed) - $this->numericValue($reportedLot->wash_sale_disallowed),
            'accrued_market_discount' => $this->numericValue($accountLot->accrued_market_discount) - $this->numericValue($reportedLot->accrued_market_discount),
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
        [$quantityMin, $quantityMax] = $this->toleranceBounds($quantity, self::QUANTITY_TOLERANCE);
        [$amountMin, $amountMax] = $this->toleranceBounds($amount, self::MONEY_TOLERANCE);

        $candidates = FinAccountLineItems::query()
            ->where('t_account', (int) $lot->acct_id)
            ->whereBetween('t_date', [$dateStart, $dateEnd])
            ->when($excludedTransactionIds !== [], fn ($query) => $query->whereNotIn('t_id', $excludedTransactionIds))
            ->where(function ($query) use ($symbol, $cusip): void {
                if ($symbol !== '') {
                    $query->orWhere('t_symbol', $symbol);
                }

                if ($cusip !== '') {
                    $query->orWhere('t_cusip', $cusip);
                }
            })
            ->get();

        return $candidates
            ->filter(fn (FinAccountLineItems $candidate): bool => in_array(strtolower((string) $candidate->t_type), $types, true)
                && $this->numericBetween(abs($this->numericValue($candidate->t_qty)), $quantityMin, $quantityMax)
                && $this->numericBetween(abs($this->numericValue($candidate->t_amt)), $amountMin, $amountMax))
            ->sortBy(fn (FinAccountLineItems $candidate): array => [
                abs((int) (new \DateTimeImmutable($date))->diff(new \DateTimeImmutable((string) $candidate->t_date))->format('%r%a')),
                (int) $candidate->t_id,
            ])
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

    private function numericBetween(float $value, float $minimum, float $maximum): bool
    {
        return $value >= $minimum && $value <= $maximum;
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

    private function zeroEquivalentNumericClose(mixed $left, mixed $right, float $tolerance): bool
    {
        return $this->numericClose($this->numericValue($left), $this->numericValue($right), $tolerance);
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
