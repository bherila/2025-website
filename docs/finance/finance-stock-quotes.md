# Finance Stock Quotes

Historical daily stock prices that back finance valuation workflows (RSU
vest-date pricing, acquired-date and snapshot-date calculations). This document
covers the data model, the provider abstraction, the backfill command, and the
fetch-on-read behavior.

Related: [account-data-import-reconciliation.md](./account-data-import-reconciliation.md#historical-prices).

## Data model

Quotes live in a single compact table, `stock_quotes_daily`, intentionally kept
to the minimum columns since it grows by one row per symbol per trading day:

| Column    | Notes                                  |
| --------- | -------------------------------------- |
| `c_symb`  | Ticker symbol                          |
| `c_date`  | Trading date (`Y-m-d`)                 |
| `c_open`  | Open                                   |
| `c_high`  | High                                   |
| `c_low`   | Low                                    |
| `c_close` | Close                                  |
| `c_vol`   | Volume                                 |

- **Unique index `(c_symb, c_date)`** — the only de-duplication mechanism.
  All writes are bulk `upsert`s keyed on this index, so re-runs and concurrent
  writes can never create duplicate rows and **no transaction is required**.
- No timestamps and no soft deletes (`StockQuotesDaily::$timestamps = false`),
  keeping rows as small as possible.

The `App\Models\FinanceTool\StockQuotesDaily` model maps the table.

## Providers

Price retrieval is abstracted behind `App\Services\Finance\StockQuotes\StockQuoteProvider`,
so importer commands stay deterministic and provider-specific HTTP lives in one
place.

| Provider               | Key required        | Notes                                                                 |
| ---------------------- | ------------------- | --------------------------------------------------------------------- |
| `YahooFinanceProvider` | No                  | Default. Public chart endpoint; generous limits — used for local dev. |
| `AlphaVantageProvider` | `ALPHAVANTAGE_API_KEY` | `TIME_SERIES_DAILY` with `outputsize=full`. Free tier ≈ 25 req/day.   |

`StockQuoteProviderFactory::make($name)` resolves a provider, defaulting to
`config('services.stock_quotes.provider')`. Because AlphaVantage's free tier is
so limited, selecting `alphavantage` returns a `FallbackStockQuoteProvider` that
**automatically falls back to Yahoo** when AlphaVantage is rate-limited or has no
key configured. Genuine request failures (bad symbol, network errors) are not
swallowed and still surface.

### Configuration

```env
STOCK_QUOTE_PROVIDER=yahoo          # yahoo | alphavantage  (default: yahoo)
STOCK_QUOTE_FETCH_ON_READ=true      # fetch-on-read backfill (default: true)
ALPHAVANTAGE_API_KEY=               # required only for the alphavantage provider
```

See `config/services.php` (`stock_quotes`, `alphavantage`).

## Reading quotes — `StockQuoteService`

`App\Services\Finance\StockQuotes\StockQuoteService` is the read API. It serves
from the local table first:

- `quoteOnOrBefore($symbol, $date)` — most recent row on or before a date.
- `closeOnOrBefore($symbol, $date)` — its closing price.
- `latestQuoteDate($symbol)` — newest stored date for a symbol.
- `closesForAwards($awards)` — batch resolver: one query mapping award id →
  vest-date close (used by the RSU endpoint, avoids N+1).

### Fetch-on-read backfill

When a requested date is **not yet covered** for a symbol, the service fetches
that symbol's **full history** from the configured provider inline, bulk-upserts
it, and then serves the read locally. Subsequent reads for that symbol are served
from the database without another provider call.

- Triggered via `ensureCoverage($symbol, $date)` and
  `ensureCoverageForAwards($awards)` (called by `FinanceRsuController::getRsuData`).
- Coverage is considered satisfied when the symbol's latest stored date is on or
  after the requested date; future dates never trigger a fetch.
- Each symbol is fetched at most once per request.
- Provider failures are caught and logged — a read never fails because the
  provider is down or rate-limited; it just returns whatever is already local.
- Controlled by `STOCK_QUOTE_FETCH_ON_READ` (default on).

## Backfilling explicitly — `finance:backfill-quotes`

For bulk/seed loads outside the request path:

```bash
php artisan finance:backfill-quotes AAPL MSFT \
  --from=2020-01-01 --to=2024-12-31 \
  [--provider=yahoo|alphavantage] [--force] [--dry-run] [--format=table|json|toon]
```

- `symbols*` — one or more tickers.
- `--from` / `--to` — inclusive range; `--to` defaults to today, `--from`
  defaults to all available history.
- `--force` — overwrite existing rows instead of skipping them.
- `--dry-run` — report what would change without writing.
- Idempotent: existing `(c_symb, c_date)` rows are skipped unless `--force`.
  Validated bars (finite, non-negative prices; `high ≥ low`) are written with a
  bulk `upsert`. Provider errors (missing key, rate limit, request failure)
  abort with a non-zero exit code.

Output reports per-symbol `fetched / written / skipped / invalid` counts.

## Testing

All tests stub the network with `Http::fake` and never hit a live provider, so
they run offline. A real captured Yahoo response is committed at
`tests/Fixtures/StockQuotes/yahoo_aapl_2024-01.json` and parsed in
`YahooFinanceProviderTest` to guard against response-shape drift.

Key test files:

- `tests/Unit/Finance/StockQuotes/` — providers, fallback, factory, read service
  (including fetch-on-read).
- `tests/Feature/Finance/FinanceBackfillQuotesCommandTest.php` — command behavior
  (idempotency, dry-run, force, fallback, error handling).
