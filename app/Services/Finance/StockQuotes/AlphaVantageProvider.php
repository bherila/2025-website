<?php

namespace App\Services\Finance\StockQuotes;

use App\Services\Finance\StockQuotes\Exceptions\MissingApiKeyException;
use App\Services\Finance\StockQuotes\Exceptions\ProviderRequestFailedException;
use App\Services\Finance\StockQuotes\Exceptions\RateLimitedException;
use Carbon\CarbonInterface;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/**
 * Fetches daily OHLCV history from AlphaVantage's TIME_SERIES_DAILY endpoint.
 *
 * Requires an API key (config services.alphavantage.key). The free tier is
 * heavily rate limited, which AlphaVantage signals via a "Note"/"Information"
 * payload rather than an HTTP status; those are surfaced as RateLimitedException.
 */
class AlphaVantageProvider implements StockQuoteProvider
{
    private const BASE_URL = 'https://www.alphavantage.co/query';

    public function __construct(private readonly ?string $apiKey) {}

    public function name(): string
    {
        return 'alphavantage';
    }

    public function fetchDailyHistory(string $symbol, ?CarbonInterface $from = null, ?CarbonInterface $to = null): array
    {
        if ($this->apiKey === null || trim($this->apiKey) === '') {
            throw new MissingApiKeyException('AlphaVantage API key is not configured. Set ALPHAVANTAGE_API_KEY.');
        }

        try {
            $response = Http::acceptJson()->get(self::BASE_URL, [
                'function' => 'TIME_SERIES_DAILY',
                'symbol' => $symbol,
                'outputsize' => 'full',
                'apikey' => $this->apiKey,
            ]);
        } catch (ConnectionException $e) {
            throw new ProviderRequestFailedException("AlphaVantage request failed for {$symbol}: {$e->getMessage()}", previous: $e);
        }

        if ($response->status() === 429) {
            throw new RateLimitedException("AlphaVantage rate limit hit for {$symbol}.");
        }

        if (! $response->successful()) {
            throw new ProviderRequestFailedException("AlphaVantage returned HTTP {$response->status()} for {$symbol}.");
        }

        $payload = $response->json();

        if (! is_array($payload)) {
            throw new ProviderRequestFailedException("AlphaVantage returned an unparseable payload for {$symbol}.");
        }

        if (isset($payload['Note']) || isset($payload['Information'])) {
            throw new RateLimitedException("AlphaVantage rate limit for {$symbol}: ".($payload['Note'] ?? $payload['Information']));
        }

        if (isset($payload['Error Message'])) {
            throw new ProviderRequestFailedException("AlphaVantage error for {$symbol}: {$payload['Error Message']}");
        }

        $series = $payload['Time Series (Daily)'] ?? null;

        if (! is_array($series)) {
            throw new ProviderRequestFailedException("AlphaVantage returned no daily series for {$symbol}.");
        }

        return $this->normalize($series, $from, $to);
    }

    /**
     * @param  array<string, array<string, string>>  $series
     * @return list<DailyQuote>
     */
    private function normalize(array $series, ?CarbonInterface $from, ?CarbonInterface $to): array
    {
        $fromDate = $from?->format('Y-m-d');
        $toDate = $to?->format('Y-m-d');
        $quotes = [];

        foreach ($series as $date => $row) {
            if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $date) || ! is_array($row)) {
                continue;
            }

            if (($fromDate !== null && $date < $fromDate) || ($toDate !== null && $date > $toDate)) {
                continue;
            }

            $quotes[] = new DailyQuote(
                date: (string) $date,
                open: (float) ($row['1. open'] ?? 0),
                high: (float) ($row['2. high'] ?? 0),
                low: (float) ($row['3. low'] ?? 0),
                close: (float) ($row['4. close'] ?? 0),
                volume: (int) ($row['5. volume'] ?? 0),
            );
        }

        usort($quotes, static fn (DailyQuote $a, DailyQuote $b): int => $a->date <=> $b->date);

        return $quotes;
    }
}
