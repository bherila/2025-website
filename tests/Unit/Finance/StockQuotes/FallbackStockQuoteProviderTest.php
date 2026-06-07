<?php

namespace Tests\Unit\Finance\StockQuotes;

use App\Services\Finance\StockQuotes\DailyQuote;
use App\Services\Finance\StockQuotes\Exceptions\ProviderRequestFailedException;
use App\Services\Finance\StockQuotes\Exceptions\RateLimitedException;
use App\Services\Finance\StockQuotes\FallbackStockQuoteProvider;
use App\Services\Finance\StockQuotes\StockQuoteProvider;
use Carbon\CarbonInterface;
use Tests\TestCase;

class FallbackStockQuoteProviderTest extends TestCase
{
    private function provider(string $name, ?\Throwable $throws = null, array $returns = []): StockQuoteProvider
    {
        return new class($name, $throws, $returns) implements StockQuoteProvider
        {
            public bool $called = false;

            public function __construct(private string $providerName, private ?\Throwable $throws, private array $returns) {}

            public function name(): string
            {
                return $this->providerName;
            }

            public function fetchDailyHistory(string $symbol, ?CarbonInterface $from = null, ?CarbonInterface $to = null): array
            {
                $this->called = true;
                if ($this->throws !== null) {
                    throw $this->throws;
                }

                return $this->returns;
            }
        };
    }

    public function test_falls_back_to_next_provider_on_rate_limit(): void
    {
        $bar = new DailyQuote('2024-01-02', 1, 1, 1, 1, 1);
        $primary = $this->provider('alphavantage', new RateLimitedException('quota'));
        $fallback = $this->provider('yahoo', returns: [$bar]);

        $quotes = (new FallbackStockQuoteProvider($primary, $fallback))->fetchDailyHistory('AAPL');

        $this->assertSame([$bar], $quotes);
        $this->assertTrue($primary->called);
        $this->assertTrue($fallback->called);
    }

    public function test_does_not_call_fallback_when_primary_succeeds(): void
    {
        $bar = new DailyQuote('2024-01-02', 1, 1, 1, 1, 1);
        $primary = $this->provider('alphavantage', returns: [$bar]);
        $fallback = $this->provider('yahoo');

        $quotes = (new FallbackStockQuoteProvider($primary, $fallback))->fetchDailyHistory('AAPL');

        $this->assertSame([$bar], $quotes);
        $this->assertFalse($fallback->called);
    }

    public function test_rethrows_when_all_providers_exhausted(): void
    {
        $primary = $this->provider('alphavantage', new RateLimitedException('quota'));
        $fallback = $this->provider('yahoo', new RateLimitedException('also limited'));

        $this->expectException(RateLimitedException::class);

        (new FallbackStockQuoteProvider($primary, $fallback))->fetchDailyHistory('AAPL');
    }

    public function test_request_failures_are_not_swallowed(): void
    {
        $primary = $this->provider('alphavantage', new ProviderRequestFailedException('bad symbol'));
        $fallback = $this->provider('yahoo');

        $this->expectException(ProviderRequestFailedException::class);

        try {
            (new FallbackStockQuoteProvider($primary, $fallback))->fetchDailyHistory('AAPL');
        } finally {
            $this->assertFalse($fallback->called);
        }
    }

    public function test_name_reflects_provider_chain(): void
    {
        $provider = new FallbackStockQuoteProvider($this->provider('alphavantage'), $this->provider('yahoo'));

        $this->assertSame('alphavantage+yahoo', $provider->name());
    }
}
