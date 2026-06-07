<?php

namespace App\Services\Finance\StockQuotes;

use InvalidArgumentException;

/**
 * Resolves a StockQuoteProvider implementation by name, defaulting to the
 * configured provider (config services.stock_quotes.provider).
 */
class StockQuoteProviderFactory
{
    public function make(?string $provider = null): StockQuoteProvider
    {
        $provider = strtolower(trim($provider ?: (string) config('services.stock_quotes.provider', 'yahoo')));

        return match ($provider) {
            'yahoo' => new YahooFinanceProvider,
            // AlphaVantage's free tier is heavily rate limited (~25 requests/day),
            // so it transparently falls back to the keyless Yahoo provider when
            // its quota is exhausted or no API key is configured.
            'alphavantage' => new FallbackStockQuoteProvider(
                new AlphaVantageProvider(config('services.alphavantage.key')),
                new YahooFinanceProvider,
            ),
            default => throw new InvalidArgumentException("Unknown stock quote provider '{$provider}'. Use 'yahoo' or 'alphavantage'."),
        };
    }
}
