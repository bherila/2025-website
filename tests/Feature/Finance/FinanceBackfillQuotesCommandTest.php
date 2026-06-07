<?php

namespace Tests\Feature\Finance;

use App\Models\FinanceTool\StockQuotesDaily;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class FinanceBackfillQuotesCommandTest extends TestCase
{
    /**
     * @param  array<string, array{0: float, 1: float, 2: float, 3: float, 4: int}>  $bars  date => [open, high, low, close, volume]
     */
    private function fakeYahoo(array $bars): void
    {
        $timestamps = [];
        $open = $high = $low = $close = $volume = [];

        foreach ($bars as $date => [$o, $h, $l, $c, $v]) {
            $timestamps[] = Carbon::parse($date, 'UTC')->getTimestamp();
            $open[] = $o;
            $high[] = $h;
            $low[] = $l;
            $close[] = $c;
            $volume[] = $v;
        }

        Http::fake([
            'query1.finance.yahoo.com/*' => Http::response([
                'chart' => [
                    'result' => [[
                        'timestamp' => $timestamps,
                        'indicators' => ['quote' => [compact('open', 'high', 'low', 'close', 'volume')]],
                    ]],
                    'error' => null,
                ],
            ], 200),
        ]);
    }

    private function runBackfill(array $options = []): array
    {
        $code = Artisan::call('finance:backfill-quotes', array_merge([
            'symbols' => ['AAPL'],
            '--provider' => 'yahoo',
            '--from' => '2024-01-01',
            '--to' => '2024-01-31',
            '--format' => 'json',
        ], $options));

        return [$code, json_decode(Artisan::output(), true)];
    }

    public function test_backfill_writes_rows_and_is_idempotent(): void
    {
        $this->fakeYahoo([
            '2024-01-02' => [100.0, 110.0, 99.0, 105.0, 1000],
            '2024-01-03' => [105.0, 112.0, 104.0, 108.0, 2000],
        ]);

        [$code, $payload] = $this->runBackfill();

        $this->assertSame(0, $code);
        $this->assertSame(2, $payload['totals']['written']);
        $this->assertSame(0, $payload['totals']['skipped']);
        $this->assertDatabaseHas('stock_quotes_daily', ['c_symb' => 'AAPL', 'c_date' => '2024-01-02', 'c_close' => 105.0]);
        $this->assertSame(2, StockQuotesDaily::query()->where('c_symb', 'AAPL')->count());

        [$code2, $payload2] = $this->runBackfill();

        $this->assertSame(0, $code2);
        $this->assertSame(0, $payload2['totals']['written']);
        $this->assertSame(2, $payload2['totals']['skipped']);
        $this->assertSame(2, StockQuotesDaily::query()->where('c_symb', 'AAPL')->count());
    }

    public function test_dry_run_writes_nothing(): void
    {
        $this->fakeYahoo(['2024-01-02' => [100.0, 110.0, 99.0, 105.0, 1000]]);

        [$code, $payload] = $this->runBackfill(['--dry-run' => true]);

        $this->assertSame(0, $code);
        $this->assertTrue($payload['dryRun']);
        $this->assertSame(1, $payload['totals']['written']);
        $this->assertSame(0, StockQuotesDaily::query()->count());
    }

    public function test_force_overwrites_existing_row(): void
    {
        DB::table('stock_quotes_daily')->insert([
            'c_symb' => 'AAPL', 'c_date' => '2024-01-02',
            'c_open' => 1.0, 'c_high' => 1.0, 'c_low' => 1.0, 'c_close' => 1.0, 'c_vol' => 1,
        ]);

        $this->fakeYahoo(['2024-01-02' => [100.0, 110.0, 99.0, 105.0, 1000]]);

        [$code, $payload] = $this->runBackfill(['--force' => true]);

        $this->assertSame(0, $code);
        $this->assertSame(1, $payload['totals']['written']);
        $this->assertDatabaseHas('stock_quotes_daily', ['c_symb' => 'AAPL', 'c_date' => '2024-01-02', 'c_close' => 105.0]);
        $this->assertSame(1, StockQuotesDaily::query()->count());
    }

    public function test_invalid_bars_are_skipped_and_counted(): void
    {
        $this->fakeYahoo([
            '2024-01-02' => [100.0, 110.0, 99.0, 105.0, 1000],
            '2024-01-03' => [100.0, 5.0, 50.0, 60.0, 2000], // high < low
        ]);

        [$code, $payload] = $this->runBackfill();

        $this->assertSame(0, $code);
        $this->assertSame(1, $payload['totals']['written']);
        $this->assertSame(1, $payload['totals']['invalid']);
        $this->assertSame(1, StockQuotesDaily::query()->count());
    }

    public function test_provider_rate_limit_aborts_with_failure(): void
    {
        Http::fake(['query1.finance.yahoo.com/*' => Http::response(null, 429)]);

        $code = Artisan::call('finance:backfill-quotes', [
            'symbols' => ['AAPL'],
            '--provider' => 'yahoo',
            '--format' => 'json',
        ]);

        $this->assertSame(1, $code);
        $this->assertSame(0, StockQuotesDaily::query()->count());
    }

    public function test_alphavantage_falls_back_to_yahoo_when_rate_limited(): void
    {
        config()->set('services.alphavantage.key', 'demo');

        Http::fake([
            'www.alphavantage.co/*' => Http::response(['Note' => 'rate limit: 25 requests per day'], 200),
            'query1.finance.yahoo.com/*' => Http::response([
                'chart' => [
                    'result' => [[
                        'timestamp' => [Carbon::parse('2024-01-02', 'UTC')->getTimestamp()],
                        'indicators' => ['quote' => [[
                            'open' => [100.0], 'high' => [110.0], 'low' => [99.0], 'close' => [105.0], 'volume' => [1000],
                        ]]],
                    ]],
                    'error' => null,
                ],
            ], 200),
        ]);

        [$code, $payload] = $this->runBackfill(['--provider' => 'alphavantage']);

        $this->assertSame(0, $code);
        $this->assertSame('alphavantage+yahoo', $payload['provider']);
        $this->assertSame(1, $payload['totals']['written']);
        $this->assertDatabaseHas('stock_quotes_daily', ['c_symb' => 'AAPL', 'c_date' => '2024-01-02', 'c_close' => 105.0]);
    }

    public function test_unknown_provider_aborts_with_failure(): void
    {
        $code = Artisan::call('finance:backfill-quotes', [
            'symbols' => ['AAPL'],
            '--provider' => 'bogus',
        ]);

        $this->assertSame(1, $code);
    }
}
