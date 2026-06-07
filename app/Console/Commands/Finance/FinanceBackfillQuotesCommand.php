<?php

namespace App\Console\Commands\Finance;

use App\Models\FinanceTool\StockQuotesDaily;
use App\Services\Finance\StockQuotes\DailyQuote;
use App\Services\Finance\StockQuotes\Exceptions\StockQuoteProviderException;
use App\Services\Finance\StockQuotes\StockQuoteProvider;
use App\Services\Finance\StockQuotes\StockQuoteProviderFactory;
use App\Services\Finance\StockQuotes\StockQuoteService;
use Illuminate\Support\Carbon;
use InvalidArgumentException;

/**
 * Backfill daily OHLCV rows into stock_quotes_daily from a configured provider.
 *
 * Price retrieval is kept out of the deterministic account-data importers: this
 * command is the single entry point for populating historical quotes. It is
 * idempotent — existing (c_symb, c_date) rows are skipped unless --force is set —
 * and validates each bar (finite, non-negative prices; high >= low) before
 * writing. Provider failures (missing API key, rate limits, request errors) are
 * surfaced explicitly and abort with a non-zero exit code.
 */
class FinanceBackfillQuotesCommand extends BaseFinanceCommand
{
    protected $signature = 'finance:backfill-quotes
        {symbols* : One or more ticker symbols}
        {--from= : Start date (YYYY-MM-DD); defaults to all available history}
        {--to= : End date (YYYY-MM-DD); defaults to today}
        {--provider= : Provider override (yahoo|alphavantage); defaults to config}
        {--force : Overwrite existing rows instead of skipping them}
        {--dry-run : Preview without writing changes}
        {--format=table : Output format: table, json, or toon}';

    protected $description = 'Backfill stock_quotes_daily OHLCV rows from a configured market-data provider.';

    public function handle(StockQuoteProviderFactory $factory, StockQuoteService $quotes): int
    {
        if (! $this->validateFormat(['table', 'json', 'toon'])) {
            return self::FAILURE;
        }

        $from = $this->parseDateOption('from');
        $to = $this->parseDateOption('to') ?? Carbon::now();

        if ($from === false || ($this->option('to') !== null && $to === false)) {
            return self::FAILURE;
        }

        if ($from instanceof Carbon && $from->gt($to)) {
            $this->error('--from must be on or before --to.');

            return self::FAILURE;
        }

        try {
            $provider = $factory->make($this->option('provider'));
        } catch (InvalidArgumentException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $isDryRun = (bool) $this->option('dry-run');
        $force = (bool) $this->option('force');
        $symbols = $this->normalizeSymbols();
        $results = [];

        foreach ($symbols as $symbol) {
            try {
                $providerQuotes = $provider->fetchDailyHistory($symbol, $from ?: null, $to);
            } catch (StockQuoteProviderException $e) {
                $this->error("[{$symbol}] {$e->getMessage()}");

                return self::FAILURE;
            }

            $results[] = $this->backfillSymbol($quotes, $symbol, $providerQuotes, $from ?: null, $to, $force, $isDryRun);
        }

        return $this->report($results, $provider, $isDryRun);
    }

    /**
     * Filter fetched bars to the requested range, drop invalid and (unless
     * --force) already-stored dates, then bulk-upsert the remainder.
     *
     * @param  list<DailyQuote>  $providerQuotes
     * @return array{symbol: string, fetched: int, written: int, skipped: int, invalid: int}
     */
    private function backfillSymbol(
        StockQuoteService $quotes,
        string $symbol,
        array $providerQuotes,
        ?Carbon $from,
        Carbon $to,
        bool $force,
        bool $isDryRun,
    ): array {
        $fromDate = $from?->format('Y-m-d');
        $toDate = $to->format('Y-m-d');

        $inRange = array_values(array_filter($providerQuotes, static function (DailyQuote $quote) use ($fromDate, $toDate): bool {
            return ($fromDate === null || $quote->date >= $fromDate) && $quote->date <= $toDate;
        }));

        $existing = StockQuotesDaily::query()
            ->where('c_symb', $symbol)
            ->when($fromDate !== null, fn ($query) => $query->whereDate('c_date', '>=', $fromDate))
            ->whereDate('c_date', '<=', $toDate)
            ->pluck('c_date')
            ->map(static fn ($date): string => Carbon::parse($date)->format('Y-m-d'))
            ->flip();

        $invalid = 0;
        $skipped = 0;
        $toWrite = [];

        foreach ($inRange as $quote) {
            if (! $quote->isValid()) {
                $invalid++;

                continue;
            }

            if (! $force && $existing->has($quote->date)) {
                $skipped++;

                continue;
            }

            $toWrite[] = $quote;
        }

        if (! $isDryRun) {
            $quotes->upsertQuotes($symbol, $toWrite);
        }

        return [
            'symbol' => $symbol,
            'fetched' => count($inRange),
            'written' => count($toWrite),
            'skipped' => $skipped,
            'invalid' => $invalid,
        ];
    }

    /**
     * @param  list<array{symbol: string, fetched: int, written: int, skipped: int, invalid: int}>  $results
     */
    private function report(array $results, StockQuoteProvider $provider, bool $isDryRun): int
    {
        $payload = [
            'dryRun' => $isDryRun,
            'provider' => $provider->name(),
            'symbolCount' => count($results),
            'totals' => [
                'fetched' => array_sum(array_column($results, 'fetched')),
                'written' => array_sum(array_column($results, 'written')),
                'skipped' => array_sum(array_column($results, 'skipped')),
                'invalid' => array_sum(array_column($results, 'invalid')),
            ],
            'results' => $results,
        ];

        $this->outputData(
            ['Symbol', 'Fetched', 'Written', 'Skipped', 'Invalid'],
            array_map(
                static fn (array $result): array => [
                    $result['symbol'],
                    $result['fetched'],
                    $result['written'],
                    $result['skipped'],
                    $result['invalid'],
                ],
                $results,
            ),
            $payload,
        );

        if ($isDryRun && ($this->option('format') ?? 'table') === 'table') {
            $this->line('Dry-run mode: no changes written.');
        }

        return self::SUCCESS;
    }

    /**
     * @return list<string>
     */
    private function normalizeSymbols(): array
    {
        $symbols = [];

        foreach ((array) $this->argument('symbols') as $symbol) {
            $symbol = strtoupper(trim((string) $symbol));
            if ($symbol !== '' && ! in_array($symbol, $symbols, true)) {
                $symbols[] = $symbol;
            }
        }

        return $symbols;
    }

    /**
     * Returns a Carbon for the option, null when unset, or false on a parse error.
     */
    private function parseDateOption(string $option): Carbon|false|null
    {
        $value = $this->option($option);

        if (($value === null) || (trim((string) $value) === '')) {
            return null;
        }

        try {
            return Carbon::parse((string) $value);
        } catch (\Throwable) {
            $this->error("--{$option} is not a valid date: {$value}");

            return false;
        }
    }
}
