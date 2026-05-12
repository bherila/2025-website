<?php

namespace App\Services\Finance;

class MoneyMath
{
    private const int FLOAT_INPUT_DECIMAL_PLACES = 4;

    public static function round(float|int|string $value): float
    {
        return self::fromCents(self::toCents($value));
    }

    /**
     * @param  array<int, float|int|string>  $values
     */
    public static function sum(array $values): float
    {
        $cents = 0;

        foreach ($values as $value) {
            $cents += self::toCents($value);
        }

        return self::fromCents($cents);
    }

    public static function add(float|int|string $left, float|int|string $right): float
    {
        return self::fromCents(self::toCents($left) + self::toCents($right));
    }

    public static function subtract(float|int|string $left, float|int|string $right): float
    {
        return self::fromCents(self::toCents($left) - self::toCents($right));
    }

    public static function multiply(float|int|string $value, float|int|string $multiplier): float
    {
        return self::fromCents((int) round(self::toCents($value) * (float) $multiplier));
    }

    public static function divide(float|int|string $value, float|int|string $divisor): float
    {
        $numericDivisor = (float) $divisor;
        if ($numericDivisor === 0.0) {
            throw new \DivisionByZeroError('Cannot divide a money value by zero.');
        }

        return self::fromCents((int) round(self::toCents($value) / $numericDivisor));
    }

    /**
     * @return array{allocated:float,remainder:float}
     */
    public static function allocateRatio(float|int|string $value, int $numerator, int $denominator): array
    {
        $totalCents = self::toCents($value);
        $sign = $totalCents < 0 ? -1 : 1;
        $absoluteCents = abs($totalCents);
        $allocatedCents = intdiv(($absoluteCents * $numerator) + intdiv($denominator, 2), $denominator) * $sign;

        return [
            'allocated' => self::fromCents($allocatedCents),
            'remainder' => self::fromCents($totalCents - $allocatedCents),
        ];
    }

    public static function toCents(float|int|string $value): int
    {
        if (is_float($value)) {
            return self::toCents(number_format($value, self::FLOAT_INPUT_DECIMAL_PLACES, '.', ''));
        }

        $raw = trim((string) $value);
        if ($raw === '') {
            return 0;
        }

        $negative = str_starts_with($raw, '-');
        $normalized = ltrim($raw, '+-');
        [$whole, $fraction] = array_pad(explode('.', $normalized, 2), 2, '');
        $whole = preg_replace('/\D+/', '', $whole) ?? '0';
        $fraction = preg_replace('/\D+/', '', $fraction) ?? '';
        $fraction = str_pad($fraction, 3, '0');

        $cents = ((int) $whole * 100) + (int) substr($fraction, 0, 2);
        if ((int) $fraction[2] >= 5) {
            $cents++;
        }

        return $negative ? -$cents : $cents;
    }

    public static function fromCents(int $cents): float
    {
        return $cents / 100;
    }
}
