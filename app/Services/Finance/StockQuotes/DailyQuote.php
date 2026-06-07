<?php

namespace App\Services\Finance\StockQuotes;

/**
 * A single normalized daily OHLCV bar for one symbol, as returned by a
 * stock-quote provider before it is persisted to stock_quotes_daily.
 */
readonly class DailyQuote
{
    public function __construct(
        public string $date,
        public float $open,
        public float $high,
        public float $low,
        public float $close,
        public int $volume,
    ) {}

    /**
     * Whether the bar carries finite, non-negative prices with high >= low.
     */
    public function isValid(): bool
    {
        foreach ([$this->open, $this->high, $this->low, $this->close] as $price) {
            if (! is_finite($price) || $price < 0.0) {
                return false;
            }
        }

        return $this->volume >= 0
            && $this->high >= $this->low
            && preg_match('/^\d{4}-\d{2}-\d{2}$/', $this->date) === 1;
    }
}
