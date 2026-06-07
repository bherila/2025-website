<?php

namespace Tests\Unit\Finance\StockQuotes;

use App\Services\Finance\StockQuotes\FallbackStockQuoteProvider;
use App\Services\Finance\StockQuotes\StockQuoteProviderFactory;
use App\Services\Finance\StockQuotes\YahooFinanceProvider;
use InvalidArgumentException;
use Tests\TestCase;

class StockQuoteProviderFactoryTest extends TestCase
{
    public function test_makes_yahoo_provider(): void
    {
        $this->assertInstanceOf(YahooFinanceProvider::class, (new StockQuoteProviderFactory)->make('yahoo'));
    }

    public function test_alphavantage_is_wrapped_with_yahoo_fallback(): void
    {
        $provider = (new StockQuoteProviderFactory)->make('alphavantage');

        $this->assertInstanceOf(FallbackStockQuoteProvider::class, $provider);
        $this->assertSame('alphavantage+yahoo', $provider->name());
    }

    public function test_defaults_to_configured_provider(): void
    {
        config()->set('services.stock_quotes.provider', 'yahoo');

        $this->assertSame('yahoo', (new StockQuoteProviderFactory)->make()->name());
    }

    public function test_unknown_provider_throws(): void
    {
        $this->expectException(InvalidArgumentException::class);

        (new StockQuoteProviderFactory)->make('bogus');
    }
}
