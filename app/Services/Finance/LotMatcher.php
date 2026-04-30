<?php

namespace App\Services\Finance;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccountLot;
use Carbon\CarbonInterface;

class LotMatcher
{
    public const MONEY_TOLERANCE = 0.01;

    public const QUANTITY_TOLERANCE = 0.000001;

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
        $saleDate = $this->dateValue($lot->sale_date);
        if ($saleDate === null || $lot->proceeds === null) {
            return false;
        }

        return FinAccountLineItems::query()
            ->where('t_account', (int) $lot->acct_id)
            ->where('t_date', $saleDate)
            ->where('t_symbol', (string) $lot->symbol)
            ->where('t_qty', -abs($this->numericValue($lot->quantity)))
            ->where('t_amt', -abs($this->numericValue($lot->proceeds)))
            ->exists();
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
