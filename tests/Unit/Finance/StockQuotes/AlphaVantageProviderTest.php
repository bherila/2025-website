<?php

namespace Tests\Unit\Finance\StockQuotes;

use App\Services\Finance\StockQuotes\AlphaVantageProvider;
use App\Services\Finance\StockQuotes\Exceptions\MissingApiKeyException;
use App\Services\Finance\StockQuotes\Exceptions\RateLimitedException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AlphaVantageProviderTest extends TestCase
{
    public function test_parses_time_series_and_bounds_to_range(): void
    {
        Http::fake([
            'www.alphavantage.co/*' => Http::response([
                'Meta Data' => ['2. Symbol' => 'AAPL'],
                'Time Series (Daily)' => [
                    '2024-01-04' => ['1. open' => '20.0', '2. high' => '21.0', '3. low' => '19.0', '4. close' => '20.5', '5. volume' => '300'],
                    '2024-01-02' => ['1. open' => '10.0', '2. high' => '11.0', '3. low' => '9.0', '4. close' => '10.5', '5. volume' => '100'],
                    '2024-01-03' => ['1. open' => '15.0', '2. high' => '16.0', '3. low' => '14.0', '4. close' => '15.5', '5. volume' => '200'],
                ],
            ], 200),
        ]);

        $quotes = (new AlphaVantageProvider('demo'))->fetchDailyHistory(
            'AAPL',
            Carbon::parse('2024-01-02'),
            Carbon::parse('2024-01-03'),
        );

        $this->assertCount(2, $quotes);
        $this->assertSame('2024-01-02', $quotes[0]->date);
        $this->assertSame('2024-01-03', $quotes[1]->date);
        $this->assertSame(10.5, $quotes[0]->close);
    }

    public function test_missing_api_key_throws_without_request(): void
    {
        Http::fake();

        $this->expectException(MissingApiKeyException::class);

        (new AlphaVantageProvider(null))->fetchDailyHistory('AAPL');
    }

    public function test_rate_limit_note_throws_rate_limited_exception(): void
    {
        Http::fake([
            'www.alphavantage.co/*' => Http::response([
                'Note' => 'Thank you for using Alpha Vantage! Our standard API rate limit is 25 requests per day.',
            ], 200),
        ]);

        $this->expectException(RateLimitedException::class);

        (new AlphaVantageProvider('demo'))->fetchDailyHistory('AAPL');
    }
}
