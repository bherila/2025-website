<?php

namespace App\Services\Finance\StockQuotes;

use App\Services\Finance\StockQuotes\Exceptions\ProviderRequestFailedException;
use App\Services\Finance\StockQuotes\Exceptions\RateLimitedException;
use Carbon\CarbonInterface;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;

/**
 * Fetches daily OHLCV history from Yahoo Finance's public chart endpoint.
 *
 * Requires no API key. The chart endpoint returns parallel arrays of
 * timestamps and OHLCV values which are zipped into normalized DailyQuote rows;
 * Yahoo emits null entries for non-trading gaps, which are skipped.
 */
class YahooFinanceProvider implements StockQuoteProvider
{
    private const BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/';

    public function name(): string
    {
        return 'yahoo';
    }

    public function fetchDailyHistory(string $symbol, ?CarbonInterface $from = null, ?CarbonInterface $to = null): array
    {
        $period1 = ($from?->copy() ?? Carbon::create(1970, 1, 1))->startOfDay()->getTimestamp();
        $period2 = ($to?->copy() ?? Carbon::now())->endOfDay()->getTimestamp();

        try {
            $response = Http::withHeaders(['User-Agent' => 'Mozilla/5.0 (compatible; bwh-finance/1.0)'])
                ->acceptJson()
                ->get(self::BASE_URL.rawurlencode($symbol), [
                    'period1' => $period1,
                    'period2' => $period2,
                    'interval' => '1d',
                ]);
        } catch (ConnectionException $e) {
            throw new ProviderRequestFailedException("Yahoo Finance request failed for {$symbol}: {$e->getMessage()}", previous: $e);
        }

        if ($response->status() === 429) {
            throw new RateLimitedException("Yahoo Finance rate limit hit for {$symbol}.");
        }

        if (! $response->successful()) {
            throw new ProviderRequestFailedException("Yahoo Finance returned HTTP {$response->status()} for {$symbol}.");
        }

        $result = $response->json('chart.result.0');
        $error = $response->json('chart.error');

        if ($error !== null) {
            $description = is_array($error) ? ($error['description'] ?? json_encode($error)) : (string) $error;
            throw new ProviderRequestFailedException("Yahoo Finance error for {$symbol}: {$description}");
        }

        if (! is_array($result)) {
            throw new ProviderRequestFailedException("Yahoo Finance returned no data for {$symbol}.");
        }

        return $this->normalize($result);
    }

    /**
     * @param  array<string, mixed>  $result
     * @return list<DailyQuote>
     */
    private function normalize(array $result): array
    {
        $timestamps = $result['timestamp'] ?? null;
        $quote = $result['indicators']['quote'][0] ?? null;

        if (! is_array($timestamps) || ! is_array($quote)) {
            return [];
        }

        $opens = $quote['open'] ?? [];
        $highs = $quote['high'] ?? [];
        $lows = $quote['low'] ?? [];
        $closes = $quote['close'] ?? [];
        $volumes = $quote['volume'] ?? [];

        $quotes = [];

        foreach ($timestamps as $index => $timestamp) {
            $open = $opens[$index] ?? null;
            $high = $highs[$index] ?? null;
            $low = $lows[$index] ?? null;
            $close = $closes[$index] ?? null;
            $volume = $volumes[$index] ?? null;

            if ($timestamp === null || $open === null || $high === null || $low === null || $close === null) {
                continue;
            }

            $quotes[] = new DailyQuote(
                date: Carbon::createFromTimestampUTC((int) $timestamp)->format('Y-m-d'),
                open: (float) $open,
                high: (float) $high,
                low: (float) $low,
                close: (float) $close,
                volume: (int) ($volume ?? 0),
            );
        }

        return $quotes;
    }
}
