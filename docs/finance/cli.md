# Finance CLI (`finance:*` Artisan Commands)

Artisan commands for CRUD operations on the Finance domain, designed for power-user workflows and AI-assisted reconciliation (e.g. via Claude CLI).

All commands live under the `finance:` namespace and share a base class (`BaseFinanceCommand`) that handles user resolution, output formatting, and table rendering.

## Quick Start (Agent Discovery)

Use the commands themselves for self-discovery rather than relying on static documentation that can drift.

```bash
php artisan list finance                      # all available finance commands
php artisan finance:<command> --help          # options and flags for a specific command
php artisan finance:<command> --schema        # expected stdin/file input format (import commands only)
```

When generating data to feed an import command, prefer **TOON format** (`--input-format=toon`). TOON is 30-60% more token-efficient than JSON, and the `helgesverre/toon` package is installed. All import commands that accept JSON also accept TOON.

---

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `FINANCE_CLI_USER_ID` | `1` | User whose data all commands operate on |

Set in `.env` or export in the shell before running:
```bash
export FINANCE_CLI_USER_ID=2
php artisan finance:accounts
```

All commands are scoped to the resolved user. No command can read or write another user's data.

---

## Output Formats

Every command accepts `--format=table` (default) or `--format=json`.

**Table** renders a monospaced, pipe-delimited grid suitable for terminal inspection.

**JSON** emits a pretty-printed JSON array on stdout — useful for piping to `jq`, saving to a file, or feeding back into another command.

```bash
php artisan finance:transactions --format=json | jq '.[].t_amt'
```

---

## Commands

### `finance:accounts`

List all accounts for the configured user.

```
php artisan finance:accounts [--format=table|json] [--include-closed]
```

**Options**
- `--format` — output format (default: `table`)
- `--include-closed` — include accounts with a `when_closed` date

**Table columns:** `acct_id`, `name`, `number`, `balance`, `debt`, `retirement`, `closed`

**JSON shape:**
```json
[
  {
    "acct_id": 1,
    "acct_name": "Fidelity Brokerage",
    "acct_number": "X65-385336",
    "acct_last_balance": "12345.67",
    "acct_is_debt": false,
    "acct_is_retirement": false,
    "when_closed": null
  }
]
```

---

### `finance:transactions`

List transactions from one or all accounts.

```
php artisan finance:transactions
  [--account=ACCT_ID]
  [--year=YEAR]
  [--month=MONTH]
  [--type=TYPE]
  [--symbol=SYMBOL]
  [--limit=100]
  [--format=table|json]
```

**Options**
- `--account` — filter to a single account ID
- `--year` — filter by year (e.g. `2024`)
- `--month` — filter by month 1–12; requires `--year`
- `--type` — filter by `t_type` (e.g. `Buy`, `Sell`, `Dividend`)
- `--symbol` — filter by ticker symbol
- `--limit` — max rows to return (default: 100; `0` = unlimited)
- `--format` — output format (default: `table`)

**Table columns:** `t_id`, `account`, `date`, `type`, `symbol`, `qty`, `amount`, `description`

**JSON shape:** array of `fin_account_line_items` rows (all fillable fields).

---

### `finance:import-transactions`

Insert transactions from a JSON payload read from stdin.

```bash
cat transactions.json | php artisan finance:import-transactions
  [--account=ACCT_ID]
  [--dry-run]
  [--schema]
  [--format=table|json]
```

**Options**
- `--account` — default account ID if not specified per-row in the payload
- `--dry-run` — validate and display what would be inserted; do not commit
- `--schema` — print the expected JSON input schema to stdout and exit (useful for LLM context)
- `--format` — output format for the result summary (default: `table`)

**Input JSON format (stdin):**
```json
{
  "account_id": 123,
  "transactions": [
    {
      "t_date": "2024-06-15",
      "t_type": "Buy",
      "t_amt": -1500.00,
      "t_symbol": "AAPL",
      "t_qty": 10,
      "t_price": 150.00,
      "t_description": "Buy 10 AAPL @ 150.00"
    },
    {
      "t_date": "2024-06-20",
      "t_type": "Dividend",
      "t_amt": 12.50,
      "t_description": "AAPL dividend"
    }
  ]
}
```

`account_id` in the payload takes precedence over `--account`. Each transaction row may include any `fin_account_line_items` fillable field. Required: `t_date`, `t_type`, `t_amt`.

**Output:** summary of rows inserted (or would-be inserted in `--dry-run`).

---

### `finance:statements` *(planned)*

List statements (balance snapshots) for an account.

```
php artisan finance:statements [--account=ACCT_ID] [--year=YEAR] [--format=table|json]
```

---

### `finance:lots-import`

Import 1099-B closed-lot records into `fin_account_lots`. Accepts **JSON**, **CSV**, **TOON**, or **Fidelity pdftotext** input.

```bash
# JSON (broker_1099 format — see --schema)
php artisan finance:lots-import --account=33 --file=1099b.json

# CSV
php artisan finance:lots-import --account=33 --file=lots.csv

# TOON (helgesverre/toon — 30–60% fewer tokens vs JSON)
php artisan finance:lots-import --account=33 --file=lots.toon

# Fidelity 1099-B PDF via pdftotext
pdftotext -layout "2025 1099 Fidelity.pdf" - | php artisan finance:lots-import --account=33

# Print expected schema for all formats
php artisan finance:lots-import --schema
```

**Options**
- `--account` — target `fin_accounts.acct_id` (required)
- `--file` — path to input file; omit to read from stdin
- `--input-format` — force format: `json` | `csv` | `toon` | `text` (auto-detected by default)
- `--dry-run` — parse and preview without writing
- `--clear` — delete all existing lots for this account before importing
- `--schema` — print expected input schemas and exit
- `--format` — output format (default: `table`)

**Duplicate detection:** skips rows where the same `(acct_id, symbol, quantity, purchase_date, sale_date, proceeds, cost_basis)` already exists (within $0.01 rounding).

**Transaction linking:** for each imported lot, attempts to find a matching `fin_account_line_items` opening (buy) and closing (sell) transaction and sets `open_t_id` / `close_t_id`.

**Taxable disposition types parsed from pdftotext:** `Sale`, `Merger` (cash mergers), `Cash In Lieu` (fractional share payouts).

→ See [lot-analyzer.md](lot-analyzer.md) for the frontend analysis component.

---

## Implementation Notes

### Leverage existing models, not controllers

Commands query `FinAccounts`, `FinAccountLineItems`, etc. directly. They do **not** make internal HTTP calls to the API controllers. The controller auth and request-validation layers are web-only; the CLI enforces user scoping via `acct_owner = FINANCE_CLI_USER_ID`.

```php
// Correct — query the model directly
FinAccountLineItems::query()
    ->whereIn('t_account', $userAccountIds)
    ->where('t_date', '>=', "$year-01-01")
    ->get();

// Incorrect — do not call controller methods or HTTP endpoints internally
```

### User scoping

`FinAccounts` has a global scope that filters by the authenticated web user (`auth()->id()`), which is null in CLI and queue contexts. Use the `forOwner` scope instead — it bypasses the global scope and applies an explicit `acct_owner` filter:

```php
FinAccounts::forOwner($this->userId())->get();
```

This replaces the older `withoutGlobalScopes()->where('acct_owner', ...)` pattern. Use `forOwner` anywhere `auth()->id()` is unavailable (CLI commands, queue jobs, services).

### Deduplication on import

`finance:import-transactions` should check for existing transactions with matching `(t_account, t_date, t_type, t_amt, t_symbol)` before inserting to avoid double-importing the same data. The `t_is_not_duplicate` flag should be set appropriately.

### `--help` and `--schema`

All Artisan commands expose `--help` / `-h` for free via Symfony Console — it prints the command description, arguments, and options. No custom work is needed.

Import commands (`finance:import-transactions`, `finance:tax-import`) additionally expose `--schema`, which prints the expected JSON input format to stdout and exits immediately. This is intended for LLM context injection:

```bash
# Teach Claude the expected format before generating import data
php artisan finance:import-transactions --schema
```

The schema is defined as a constant on the command class (not duplicated in docs). `BaseFinanceCommand` provides `emitSchema(array $schema): void` to handle output; the caller immediately returns `0`.

### Base class

All commands extend `App\Console\Commands\Finance\BaseFinanceCommand`, which provides:

| Method | Purpose |
|---|---|
| `userId()` | Read `FINANCE_CLI_USER_ID` env var, default 1 |
| `resolveUser()` | Load `User` model; returns `null` and prints an error if not found — caller must `return 1` |
| `outputData($headers, $rows, $data)` | Route to `renderTable` or `outputJson` based on `--format` |
| `renderTable($headers, $rows)` | Monospaced pipe-delimited terminal table |
| `outputJson($data)` | Pretty-printed JSON to stdout |
| `readJsonFromStdin()` | Read + decode JSON payload from stdin |
| `validateFormat()` | Validate `--format` option value |
| `emitSchema($schema)` | Print JSON schema to stdout and exit (for `--schema` flag) |

---

## Claude CLI Use Case

The primary motivation for this tool is enabling AI-assisted workflows via Claude CLI. Example session:

```bash
# 1. Export current transactions for an account as JSON context for Claude
php artisan finance:transactions --account=5 --year=2024 --format=json > /tmp/txns.json

# 2. Ask Claude to reconcile against a PDF statement
claude "Compare the transactions in /tmp/txns.json against the statement in statement.pdf.
Generate a JSON array of any missing transactions in the finance:import-transactions format."

# 3. Review and import the result
cat /tmp/missing.json | php artisan finance:import-transactions --account=5 --dry-run
cat /tmp/missing.json | php artisan finance:import-transactions --account=5
```

This complements the GenAI-based PDF import tools in the UI, giving power users a scriptable, auditable path that doesn't require a browser session.

**Out of scope for the CLI:** Uploading documents (PDFs, statements) must go through the web UI and the background job system (`ParseImportJob`). The CLI operates only on already-parsed structured data.
