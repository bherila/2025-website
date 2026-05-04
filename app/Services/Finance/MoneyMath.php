<?php

namespace App\Services\Finance;

class MoneyMath
{
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
            return (int) round($value * 100);
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
