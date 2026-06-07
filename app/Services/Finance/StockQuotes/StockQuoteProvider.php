<?php

namespace App\Services\Finance\StockQuotes;

use App\Services\Finance\StockQuotes\Exceptions\StockQuoteProviderException;
use Carbon\CarbonInterface;

/**
 * Abstraction over an external source of historical daily stock prices.
 *
 * Implementations fetch and normalize daily OHLCV bars for a symbol. Price
 * retrieval is intentionally isolated behind this interface so importer
 * commands stay deterministic and provider-specific fetch logic lives in one
 * place (see issue #854).
 */
interface StockQuoteProvider
{
    /**
     * Stable provider identifier (e.g. "yahoo", "alphavantage").
     */
    public function name(): string;

    /**
     * Fetch normalized daily bars for $symbol, optionally bounded to the
     * inclusive [$from, $to] date range.
     *
     * @return list<DailyQuote> ordered ascending by date
     *
     * @throws StockQuoteProviderException
     */
    public function fetchDailyHistory(string $symbol, ?CarbonInterface $from = null, ?CarbonInterface $to = null): array;
}
