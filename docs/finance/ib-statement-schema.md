# IB Statement Schema

Interactive Brokers CSV statements contain multiple sections beyond just trades. This doc describes which sections exist, where they end up in the database, and how to find authoritative column definitions.

> **Authoritative source:** `database/schema/sqlite-schema.sql` and `database/schema/mysql-schema.sql`. Column lists below are summaries — defer to the schema files when in doubt.

## IB CSV Sections

| Section | Description | Where it lands |
|---------|-------------|----------------|
| `Statement` | Broker name, account info, period | `fin_statements` (metadata) |
| `Account Information` | Account details | `fin_statements` (metadata) |
| `Net Asset Value` | NAV by asset class | `fin_statement_nav` |
| `Change in NAV` | NAV changes | `fin_statement_nav` (`change_amount`) |
| `Mark-to-Market Performance Summary` | MTM P&L by symbol | `fin_statement_performance` (`perf_type='mtm'`) |
| `Realized & Unrealized Performance Summary` | P&L summary | `fin_statement_performance` (`perf_type='realized_unrealized'`) |
| `Cash Report` | Cash movements by currency | `fin_statement_cash_report` |
| `Open Positions` | End-of-period positions | `fin_statement_positions` |
| `Forex Balances` | FX position values | Not yet imported |
| `Trades` | Transaction details | `fin_account_line_items` (already parsed) |
| `Transaction Fees` | Detailed fee breakdown | Not yet imported |
| `Fees` | Fee summary | `fin_account_line_items` (already parsed) |
| `Interest` | Interest income/expense | `fin_account_line_items` (already parsed) |
| `Interest Accruals` | Accrued interest | Not yet imported |
| `GST Details` | Tax details (Singapore) | Not yet imported |
| `Borrow Fee Details` | Short borrow fees | Not yet imported |
| `Stock Yield Enhancement Program` | Securities lending | `fin_statement_securities_lent` |
| `Financial Instrument Information` | Instrument details | Used at parse time for symbol lookup |

---

## Storage Model

The parent record for any statement is `fin_statements`, keyed by `statement_id`. Each section table holds rows that belong to one statement via a `statement_id` foreign key with `ON DELETE CASCADE` — when a statement is deleted, all section rows go with it.

> The model class is `App\Models\FinanceTool\FinStatement` (renamed from the legacy `FinAccountBalanceSnapshot`). See [statements.md](statements.md).

### Section tables (summary)

All five tables below cascade on `fin_statements.statement_id`. See the schema files for exact column types.

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `fin_statement_nav` | NAV by asset class (one row per asset class) | `asset_class`, `prior_total`, `current_long`, `current_short`, `current_total`, `change_amount` |
| `fin_statement_cash_report` | Cash movements by currency × line item | `currency`, `line_item`, `total`, `securities`, `futures` |
| `fin_statement_positions` | Open positions snapshot | `symbol`, `asset_category`, `quantity`, `multiplier`, `cost_price`, `cost_basis`, `close_price`, `market_value`, `unrealized_pl`, `opt_type`, `opt_strike`, `opt_expiration` |
| `fin_statement_performance` | MTM and realized/unrealized P&L per symbol | `perf_type` (`mtm`/`realized_unrealized`), `symbol`, MTM columns (`mtm_pl_*`), realized/unrealized split columns (`realized_st_*`, `unrealized_lt_*`, etc.), `total_pl` |
| `fin_statement_securities_lent` | Stock Yield Enhancement Program rows | `symbol`, `start_date`, `fee_rate`, `quantity`, `collateral_amount`, `interest_earned` |

`fin_statement_details` is a separate generic table (key/line-item/MTD/YTD numbers + a `section` discriminator) used by PDF statement parsing, not by the IB CSV section importer.

---

## Import Flow

1. Parse IB CSV using `parseIbCsv()` (`resources/js/data/finance/parseIbCsv.ts`). The parser also extracts `Statement` period metadata and per-section payloads.
2. Create or update the `fin_statements` row for the account/period.
3. Import each section into its table using the parent `statement_id`:
   - `Net Asset Value` → `fin_statement_nav`
   - `Cash Report` → `fin_statement_cash_report`
   - `Open Positions` → `fin_statement_positions`
   - `Mark-to-Market Performance Summary` → `fin_statement_performance` (`perf_type='mtm'`)
   - `Realized & Unrealized Performance Summary` → `fin_statement_performance` (`perf_type='realized_unrealized'`)
   - `Stock Yield Enhancement Program` → `fin_statement_securities_lent`
4. `Trades`, `Fees`, and `Interest` continue to be imported into `fin_account_line_items` via the standard transaction import path.

See [csv-parsers.md](csv-parsers.md) for the parser inventory and [statements.md](statements.md) for the statement detail UI.
