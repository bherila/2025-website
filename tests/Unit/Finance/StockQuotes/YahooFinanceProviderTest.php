<?php

namespace Tests\Unit\Finance\StockQuotes;

use App\Services\Finance\StockQuotes\Exceptions\ProviderRequestFailedException;
use App\Services\Finance\StockQuotes\Exceptions\RateLimitedException;
use App\Services\Finance\StockQuotes\YahooFinanceProvider;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class YahooFinanceProviderTest extends TestCase
{
    public function test_parses_daily_bars_and_skips_null_rows(): void
    {
        Http::fake([
            'query1.finance.yahoo.com/*' => Http::response([
                'chart' => [
                    'result' => [[
                        'timestamp' => [1704153600, 1704240000], // 2024-01-02, 2024-01-03 UTC
                        'indicators' => ['quote' => [[
                            'open' => [100.0, null],
                            'high' => [110.0, 111.0],
                            'low' => [99.0, 98.0],
                            'close' => [105.0, 106.0],
                            'volume' => [1000, 2000],
                        ]]],
                    ]],
                    'error' => null,
                ],
            ], 200),
        ]);

        $quotes = (new YahooFinanceProvider)->fetchDailyHistory('AAPL');

        $this->assertCount(1, $quotes);
        $this->assertSame('2024-01-02', $quotes[0]->date);
        $this->assertSame(100.0, $quotes[0]->open);
        $this->assertSame(105.0, $quotes[0]->close);
        $this->assertSame(1000, $quotes[0]->volume);
    }

    public function test_parses_real_captured_yahoo_response_fixture(): void
    {
        $fixture = file_get_contents(base_path('tests/Fixtures/StockQuotes/yahoo_aapl_2024-01.json'));
        Http::fake(['query1.finance.yahoo.com/*' => Http::response($fixture, 200)]);

        $quotes = (new YahooFinanceProvider)->fetchDailyHistory('AAPL');

        $this->assertCount(8, $quotes);
        $this->assertSame('2024-01-02', $quotes[0]->date);
        $this->assertSame('2024-01-11', $quotes[7]->date);
        $this->assertEqualsWithDelta(185.64, $quotes[0]->close, 0.01);
        $this->assertGreaterThan(0, $quotes[0]->volume);
    }

    public function test_rate_limit_throws_rate_limited_exception(): void
    {
        Http::fake(['query1.finance.yahoo.com/*' => Http::response(null, 429)]);

        $this->expectException(RateLimitedException::class);

        (new YahooFinanceProvider)->fetchDailyHistory('AAPL');
    }

    public function test_server_error_throws_request_failed_exception(): void
    {
        Http::fake(['query1.finance.yahoo.com/*' => Http::response('', 500)]);

        $this->expectException(ProviderRequestFailedException::class);

        (new YahooFinanceProvider)->fetchDailyHistory('AAPL');
    }

    public function test_provider_error_payload_throws_request_failed_exception(): void
    {
        Http::fake([
            'query1.finance.yahoo.com/*' => Http::response([
                'chart' => ['result' => null, 'error' => ['code' => 'Not Found', 'description' => 'No data found']],
            ], 200),
        ]);

        $this->expectException(ProviderRequestFailedException::class);

        (new YahooFinanceProvider)->fetchDailyHistory('NOPE');
    }
}
