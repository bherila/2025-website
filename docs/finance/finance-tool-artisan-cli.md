# Finance Tool — Artisan CLI

Artisan commands for CRUD operations on the Finance domain, designed for power-user workflows and AI-assisted reconciliation (e.g. via Claude CLI).

All commands live under the `finance:` namespace and share a base class (`BaseFinanceCommand`) that handles user resolution, output formatting, and table rendering.

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
  [--format=table|json]
```

**Options**
- `--account` — default account ID if not specified per-row in the payload
- `--dry-run` — validate and display what would be inserted; do not commit
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

### `finance:lots` *(planned)*

List investment lots.

```
php artisan finance:lots
  [--account=ACCT_ID]
  [--symbol=SYMBOL]
  [--open]
  [--year=YEAR]
  [--format=table|json]
```

**Options**
- `--open` — only show open (unsold) lots
- `--year` — filter by sale year (closed lots only)

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

`FinAccounts` has a global scope that filters by the authenticated web user. CLI commands must use `withoutGlobalScopes()` and then apply the user filter explicitly:

```php
FinAccounts::withoutGlobalScopes()
    ->where('acct_owner', $this->userId())
    ->get();
```

### Deduplication on import

`finance:import-transactions` should check for existing transactions with matching `(t_account, t_date, t_type, t_amt, t_symbol)` before inserting to avoid double-importing the same data. The `t_is_not_duplicate` flag should be set appropriately.

### Base class

All commands extend `App\Console\Commands\Finance\BaseFinanceCommand`, which provides:

| Method | Purpose |
|---|---|
| `userId()` | Read `FINANCE_CLI_USER_ID` env var, default 1 |
| `resolveUser()` | Load `User` model, exit with error if not found |
| `outputData($headers, $rows, $data)` | Route to `renderTable` or `outputJson` based on `--format` |
| `renderTable($headers, $rows)` | Monospaced pipe-delimited terminal table |
| `outputJson($data)` | Pretty-printed JSON to stdout |
| `readJsonFromStdin()` | Read + decode JSON payload from stdin |
| `validateFormat()` | Validate `--format` option value |

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
