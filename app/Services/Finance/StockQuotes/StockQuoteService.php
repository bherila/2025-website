<?php

namespace App\Services\Finance\StockQuotes;

use App\Models\FinanceTool\FinEquityAwards;
use App\Models\FinanceTool\StockQuotesDaily;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Read API over locally stored daily quotes (stock_quotes_daily), with
 * transparent fetch-on-read backfill.
 *
 * Reads are served from the local table first. When a requested date is not yet
 * covered for a symbol, the configured provider is queried inline for the
 * symbol's full history, which is bulk-upserted so every subsequent read is
 * served locally. The unique (c_symb, c_date) index makes the upsert
 * duplicate-safe, so no transaction is required.
 */
class StockQuoteService
{
    private const UPSERT_CHUNK = 500;

    /** @var array<string, bool> symbols already fetched during this request */
    private array $ensured = [];

    public function __construct(private ?StockQuoteProviderFactory $providerFactory = null) {}

    /**
     * The most recent quote for $symbol on or before $date, or null when none.
     */
    public function quoteOnOrBefore(string $symbol, CarbonInterface|string $date): ?StockQuotesDaily
    {
        return StockQuotesDaily::query()
            ->where('c_symb', $symbol)
            ->whereDate('c_date', '<=', $this->toDateString($date))
            ->orderByDesc('c_date')
            ->first();
    }

    /**
     * The closing price for $symbol on or before $date, or null when none.
     */
    public function closeOnOrBefore(string $symbol, CarbonInterface|string $date): ?float
    {
        $quote = $this->quoteOnOrBefore($symbol, $date);

        return $quote === null ? null : (float) $quote->c_close;
    }

    /**
     * The latest date for which any quote exists for $symbol, or null.
     */
    public function latestQuoteDate(string $symbol): ?CarbonInterface
    {
        $latest = StockQuotesDaily::query()->where('c_symb', $symbol)->max('c_date');

        return $latest === null ? null : Carbon::parse($latest);
    }

    /**
     * Resolve the closing price on or before each award's vest_date in a single
     * query, keyed by award id. Awards without a matching quote are omitted.
     *
     * @param  Collection<int, FinEquityAwards>  $awards
     * @return array<int|string, mixed> award id => raw c_close value
     */
    public function closesForAwards(Collection $awards): array
    {
        $ids = $awards->pluck('id')->filter(static fn ($id): bool => $id !== null)->values()->all();

        if ($ids === []) {
            return [];
        }

        return DB::table('fin_equity_awards as a')
            ->leftJoin('stock_quotes_daily as s', function ($join): void {
                $join->on('a.symbol', '=', 's.c_symb')
                    ->whereRaw('s.c_date = (select max(c_date) from stock_quotes_daily where c_symb = a.symbol and c_date <= a.vest_date)');
            })
            ->whereIn('a.id', $ids)
            ->whereNotNull('s.c_close')
            ->pluck('s.c_close', 'a.id')
            ->all();
    }

    /**
     * Ensure local quote coverage for every symbol referenced by $awards, using
     * the latest (capped at today) vest_date per symbol as the coverage target.
     *
     * @param  Collection<int, FinEquityAwards>  $awards
     */
    public function ensureCoverageForAwards(Collection $awards): void
    {
        if (! $this->fetchOnReadEnabled()) {
            return;
        }

        $today = Carbon::today()->format('Y-m-d');
        $targets = [];

        foreach ($awards as $award) {
            $symbol = $award->symbol ?? null;
            $vestDate = $award->vest_date ?? null;
            if ($symbol === null || $vestDate === null) {
                continue;
            }

            $target = min($this->toDateString($vestDate), $today);
            if (! isset($targets[$symbol]) || $target > $targets[$symbol]) {
                $targets[$symbol] = $target;
            }
        }

        foreach ($targets as $symbol => $target) {
            // This can perform an inline provider call; we cap it to one full-history fetch per symbol per request.
            $this->ensureCoverage($symbol, $target);
        }
    }

    /**
     * Ensure local quotes for $symbol cover $date, fetching the symbol's full
     * history from the provider when the date is not yet covered.
     */
    public function ensureCoverage(string $symbol, CarbonInterface|string $date): void
    {
        if (! $this->fetchOnReadEnabled()) {
            return;
        }

        $target = $this->toDateString($date);
        if ($target > Carbon::today()->format('Y-m-d')) {
            return; // Future dates can never be satisfied by historical data.
        }

        if ($this->hasQuoteOnOrBefore($symbol, $target)) {
            return; // Already covered locally.
        }

        if (isset($this->ensured[$symbol])) {
            return; // Full-history fetch already attempted during this request.
        }

        $this->ensured[$symbol] = true;

        try {
            $quotes = $this->factory()->make()->fetchDailyHistory($symbol);
        } catch (\Throwable $e) {
            Log::warning("On-demand stock quote fetch failed for {$symbol}.", ['reason' => $e->getMessage()]);

            return;
        }

        $this->storeQuotes($symbol, $quotes);
    }

    /**
     * Validate and bulk-upsert daily bars for $symbol. Returns rows written.
     *
     * @param  iterable<DailyQuote>  $quotes
     */
    public function storeQuotes(string $symbol, iterable $quotes): int
    {
        $valid = [];
        foreach ($quotes as $quote) {
            if ($quote->isValid()) {
                $valid[] = $quote;
            }
        }

        $this->upsertQuotes($symbol, $valid);

        return count($valid);
    }

    /**
     * Bulk-upsert pre-validated daily bars for $symbol via Eloquent's upsert,
     * keyed on the unique (c_symb, c_date) index so re-runs never duplicate rows.
     *
     * @param  list<DailyQuote>  $quotes
     */
    public function upsertQuotes(string $symbol, array $quotes): void
    {
        if ($quotes === []) {
            return;
        }

        $rows = array_map(static fn (DailyQuote $quote): array => [
            'c_symb' => $symbol,
            'c_date' => $quote->date,
            'c_open' => $quote->open,
            'c_high' => $quote->high,
            'c_low' => $quote->low,
            'c_close' => $quote->close,
            'c_vol' => $quote->volume,
        ], $quotes);

        foreach (array_chunk($rows, self::UPSERT_CHUNK) as $chunk) {
            StockQuotesDaily::query()->upsert(
                $chunk,
                ['c_symb', 'c_date'],
                ['c_open', 'c_high', 'c_low', 'c_close', 'c_vol'],
            );
        }
    }

    private function fetchOnReadEnabled(): bool
    {
        return (bool) config('services.stock_quotes.fetch_on_read', true);
    }

    private function factory(): StockQuoteProviderFactory
    {
        return $this->providerFactory ??= app(StockQuoteProviderFactory::class);
    }

    private function hasQuoteOnOrBefore(string $symbol, string $date): bool
    {
        return StockQuotesDaily::query()
            ->where('c_symb', $symbol)
            ->whereDate('c_date', '<=', $date)
            ->exists();
    }

    private function toDateString(CarbonInterface|string $date): string
    {
        return $date instanceof CarbonInterface ? $date->format('Y-m-d') : Carbon::parse($date)->format('Y-m-d');
    }
}
