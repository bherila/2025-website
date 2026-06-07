<?php

namespace Tests\Unit\Finance\StockQuotes;

use App\Models\FinanceTool\FinEquityAwards;
use App\Models\FinanceTool\StockQuotesDaily;
use App\Services\Finance\StockQuotes\StockQuoteService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class StockQuoteServiceTest extends TestCase
{
    private function seedQuotes(): void
    {
        foreach ([
            ['2024-01-02', 100.0],
            ['2024-01-05', 110.0],
            ['2024-01-10', 120.0],
        ] as [$date, $close]) {
            DB::table('stock_quotes_daily')->insert([
                'c_symb' => 'AAPL',
                'c_date' => $date,
                'c_open' => $close,
                'c_high' => $close,
                'c_low' => $close,
                'c_close' => $close,
                'c_vol' => 1000,
            ]);
        }
    }

    public function test_quote_on_or_before_returns_latest_prior_row(): void
    {
        $this->seedQuotes();

        $service = new StockQuoteService;

        $this->assertSame('110.0000', $service->quoteOnOrBefore('AAPL', '2024-01-07')->c_close);
        $this->assertSame(110.0, $service->closeOnOrBefore('AAPL', '2024-01-07'));
        $this->assertSame(120.0, $service->closeOnOrBefore('AAPL', '2024-01-10'));
    }

    public function test_returns_null_when_no_prior_quote_exists(): void
    {
        $this->seedQuotes();

        $service = new StockQuoteService;

        $this->assertNull($service->quoteOnOrBefore('AAPL', '2023-12-31'));
        $this->assertNull($service->closeOnOrBefore('MSFT', '2024-01-07'));
    }

    public function test_latest_quote_date(): void
    {
        $this->seedQuotes();

        $this->assertSame('2024-01-10', (new StockQuoteService)->latestQuoteDate('AAPL')->format('Y-m-d'));
        $this->assertNull((new StockQuoteService)->latestQuoteDate('MSFT'));
    }

    public function test_closes_for_awards_maps_award_id_to_close(): void
    {
        $this->seedQuotes();

        $matched = FinEquityAwards::query()->create([
            'award_id' => 'A1', 'grant_date' => '2024-01-01', 'vest_date' => '2024-01-07',
            'share_count' => 10, 'symbol' => 'AAPL', 'uid' => '1',
        ]);
        $unmatched = FinEquityAwards::query()->create([
            'award_id' => 'A2', 'grant_date' => '2023-12-01', 'vest_date' => '2023-12-15',
            'share_count' => 5, 'symbol' => 'AAPL', 'uid' => '1',
        ]);

        $closes = (new StockQuoteService)->closesForAwards(new Collection([$matched, $unmatched]));

        $this->assertSame(110.0, (float) $closes[$matched->id]);
        $this->assertArrayNotHasKey($unmatched->id, $closes);
    }

    private function fakeYahooHistory(array $bars): void
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
                    'result' => [['timestamp' => $timestamps, 'indicators' => ['quote' => [compact('open', 'high', 'low', 'close', 'volume')]]]],
                    'error' => null,
                ],
            ], 200),
        ]);
    }

    public function test_ensure_coverage_fetches_and_bulk_upserts_when_missing(): void
    {
        $this->fakeYahooHistory([
            '2024-01-02' => [100.0, 110.0, 99.0, 105.0, 1000],
            '2024-01-03' => [105.0, 112.0, 104.0, 108.0, 2000],
        ]);

        $service = new StockQuoteService;
        $service->ensureCoverage('AAPL', '2024-01-03');

        Http::assertSentCount(1);
        $this->assertSame(2, StockQuotesDaily::query()->where('c_symb', 'AAPL')->count());

        // Same symbol again within the request: served locally, no second fetch.
        $service->ensureCoverage('AAPL', '2024-01-03');
        Http::assertSentCount(1);
    }

    public function test_ensure_coverage_skips_fetch_when_already_covered(): void
    {
        DB::table('stock_quotes_daily')->insert([
            'c_symb' => 'AAPL', 'c_date' => '2024-01-02',
            'c_open' => 1, 'c_high' => 1, 'c_low' => 1, 'c_close' => 1, 'c_vol' => 1,
        ]);
        Http::fake();

        (new StockQuoteService)->ensureCoverage('AAPL', '2024-01-05');

        Http::assertNothingSent();
    }

    public function test_ensure_coverage_fetches_when_only_newer_quotes_exist_locally(): void
    {
        DB::table('stock_quotes_daily')->insert([
            'c_symb' => 'AAPL', 'c_date' => '2025-01-02',
            'c_open' => 1, 'c_high' => 1, 'c_low' => 1, 'c_close' => 1, 'c_vol' => 1,
        ]);
        $this->fakeYahooHistory([
            '2024-01-02' => [100.0, 110.0, 99.0, 105.0, 1000],
        ]);

        (new StockQuoteService)->ensureCoverage('AAPL', '2024-01-05');

        Http::assertSentCount(1);
        $this->assertDatabaseHas('stock_quotes_daily', [
            'c_symb' => 'AAPL',
            'c_date' => '2024-01-02',
            'c_close' => 105.0,
        ]);
    }

    public function test_ensure_coverage_does_not_fetch_for_future_dates(): void
    {
        Http::fake();

        (new StockQuoteService)->ensureCoverage('AAPL', Carbon::today()->addYear()->format('Y-m-d'));

        Http::assertNothingSent();
    }

    public function test_ensure_coverage_is_resilient_to_provider_failure(): void
    {
        Http::fake(['query1.finance.yahoo.com/*' => Http::response(null, 429)]);

        (new StockQuoteService)->ensureCoverage('AAPL', '2024-01-03');

        $this->assertSame(0, StockQuotesDaily::query()->count());
    }

    public function test_fetch_on_read_can_be_disabled_via_config(): void
    {
        config()->set('services.stock_quotes.fetch_on_read', false);
        Http::fake();

        (new StockQuoteService)->ensureCoverage('AAPL', '2024-01-03');

        Http::assertNothingSent();
    }
}
