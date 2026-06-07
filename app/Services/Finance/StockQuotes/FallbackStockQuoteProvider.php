<?php

namespace App\Services\Finance\StockQuotes;

use App\Services\Finance\StockQuotes\Exceptions\MissingApiKeyException;
use App\Services\Finance\StockQuotes\Exceptions\ProviderRequestFailedException;
use App\Services\Finance\StockQuotes\Exceptions\RateLimitedException;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;

/**
 * Tries an ordered chain of providers, falling through to the next when one is
 * unavailable because of rate limiting or a missing API key.
 *
 * This lets a quota-constrained primary (e.g. AlphaVantage's ~25 requests/day)
 * transparently degrade to a keyless provider (Yahoo Finance) instead of
 * failing the backfill. Genuine request failures (bad symbol, network errors)
 * are not swallowed — only quota/access exhaustion triggers a fallback.
 */
class FallbackStockQuoteProvider implements StockQuoteProvider
{
    /** @var list<StockQuoteProvider> */
    private array $providers;

    public function __construct(StockQuoteProvider ...$providers)
    {
        if ($providers === []) {
            throw new InvalidArgumentException('FallbackStockQuoteProvider requires at least one provider.');
        }

        $this->providers = array_values($providers);
    }

    public function name(): string
    {
        return implode('+', array_map(static fn (StockQuoteProvider $provider): string => $provider->name(), $this->providers));
    }

    public function fetchDailyHistory(string $symbol, ?CarbonInterface $from = null, ?CarbonInterface $to = null): array
    {
        $lastIndex = count($this->providers) - 1;

        foreach ($this->providers as $index => $provider) {
            try {
                return $provider->fetchDailyHistory($symbol, $from, $to);
            } catch (RateLimitedException|MissingApiKeyException $e) {
                if ($index === $lastIndex) {
                    throw $e;
                }

                Log::warning("Stock quote provider '{$provider->name()}' unavailable; falling back to next provider.", [
                    'symbol' => $symbol,
                    'reason' => $e->getMessage(),
                ]);
            }
        }

        throw new ProviderRequestFailedException("No stock quote provider could serve {$symbol}.");
    }
}
