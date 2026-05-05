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

Most commands accept `--format=table` (default) or `--format=json`. `finance:transactions`, `finance:import-transactions`, and `finance:tax-preview-facts` also support `--format=toon`.

**Table** renders a monospaced, pipe-delimited grid suitable for terminal inspection.

**JSON** emits a pretty-printed JSON array on stdout — useful for piping to `jq`, saving to a file, or feeding back into another command.

**TOON** emits Token-Oriented Object Notation for compact LLM context and can be imported back with `--input-format=toon`.

```bash
php artisan finance:transactions --format=json | jq '.[].t_amt'
php artisan finance:transactions --format=toon > /tmp/txns.toon
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
  [--import]
  [--dry-run]
  [--schema]
  [--input-format=auto|json|toon]
  [--format=table|json|toon]
```

**Options**
- `--account` — filter to a single account ID
- `--year` — filter by year (e.g. `2024`)
- `--month` — filter by month 1–12; requires `--year`
- `--type` — filter by `t_type` (e.g. `Buy`, `Sell`, `Dividend`)
- `--symbol` — filter by ticker symbol
- `--limit` — max rows to return (default: 100; `0` = unlimited)
- `--import` — import transactions from stdin instead of listing
- `--dry-run` — with `--import`, validate and show what would be inserted without committing
- `--schema` — print the import input schema
- `--input-format` — with `--import`, decode stdin as `auto`, `json`, or `toon`
- `--format` — output format (default: `table`; `toon` is supported)

**Table columns:** `t_id`, `account`, `date`, `type`, `symbol`, `qty`, `amount`, `description`

**JSON/TOON shape:** array of `fin_account_line_items` rows (all fillable fields). Import mode also accepts the `accounts[].transactions[]` shape produced by the GenAI finance statement parser and maps `date`/`amount`/`description` aliases onto `t_date`/`t_amt`/`t_description`.

---

### `finance:k1-codes`

Inspect coded Schedule K-1 statement rows for the configured user. This is useful for auditing trader-fund routing without dumping the full `parsed_data` blob.

```
php artisan finance:k1-codes
  [--year=YEAR]
  [--account=ACCT_ID]
  [--document=TAX_DOCUMENT_ID]
  [--box=BOX]
  [--code=CODE]
  [--format=table|json]
```

**Options**
- `--year` — tax year to inspect; required unless `--document` is provided
- `--account` — filter to K-1s linked to one account
- `--document` — inspect one `fin_tax_documents.id`
- `--box` / `--code` — narrow to rows such as Box 11 Code S or Box 20 Code AJ
- `--format` — output format (default: `table`)

For AQR/Delphi Plus checks:

```bash
php artisan finance:k1-codes --year=2025 --account=32 --box=11 --code=S --format=json
```

The command reports stored character metadata, notes-derived ST/LT character for Box 11S, and the resulting destination such as Schedule D line 5 or line 12.

---

### `finance:import-transactions`

Insert transactions from a JSON or TOON payload read from stdin. This uses the same transaction import service as `finance:transactions --import` and the server-side finance statement import endpoints.

```bash
cat transactions.json | php artisan finance:import-transactions
  [--account=ACCT_ID]
  [--dry-run]
  [--schema]
  [--input-format=auto|json|toon]
  [--format=table|json|toon]
```

**Options**
- `--account` — default account ID if not specified per-row in the payload
- `--dry-run` — validate and display what would be inserted; do not commit
- `--schema` — print the expected JSON input schema to stdout and exit (useful for LLM context)
- `--input-format` — decode stdin as `auto`, `json`, or `toon`
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

### `finance:tax-docs`

List tax documents (W-2, 1099, K-1, etc.) for a given year for the configured user.

```
php artisan finance:tax-docs --year=YEAR [--account=ACCT_ID] [--format=table|json]
```

`--year` is required. Pass `--account` to filter to documents linked to one account.

---

### `finance:tax-import`

Import tax document metadata from a JSON payload on stdin into `fin_tax_documents`.

```bash
cat tax-doc.json | php artisan finance:tax-import --year=YEAR [--dry-run] [--schema] [--format=table|json]
```

`--year` is required. Use `--schema` to print the expected JSON input format. Useful for AI-generated tax document metadata.

---

### `finance:tax-render`

Render a summary of computed tax forms (1040, schedules, etc.) for a given year. Read-only — does not write to the database.

```
php artisan finance:tax-render --year=YEAR [--form=FORM] [--format=table|json]
```

`--year` is required. Pass `--form` (e.g. `w2`, `1099_int`, `k1`, `broker_1099`) to filter to one form type.

---

### `finance:tax-preview-facts`

Render backend-auditable Tax Preview source lines for the configured user/year. This is a debugging contract for high-value tax paths; rendered Tax Preview totals still come from the React calculation system.

```bash
php artisan finance:tax-preview-facts --user=1 --year=2025 --slice=schedule1 --format=toon
```

Supported slices:

| Slice | Contents |
|-------|----------|
| `all` | Every backend fact slice currently available |
| `schedule1` | Schedule 1 line 5 K-1/Schedule E sources and line 8 family 1099-MISC sources |
| `scheduleB` | Schedule B interest, ordinary dividend, and qualified dividend sources, including direct 1099 sources and K-1 sources |
| `form4952` | Investment-interest, Schedule B gross-investment-income, K-1 gross-investment-income, and investment-expense source buckets for Form 4952 / Schedule A line 9 debugging |
| `scheduleA` | W-2 Box 17, user-entered itemized deductions, selected Schedule A line 5a income/sales tax alternative, K-1 Box 13L, SALT cap, gross/deductible investment interest, and standard-deduction comparison facts |
| `scheduleE` | Routed 1099-MISC Schedule E income plus K-1 Boxes 1/2/3/4/5/11ZZ/13ZZ passive, nonpassive, and trader-NII facts |
| `scheduleD` | Schedule D line totals and supporting K-1/Form 6781/1099-DIV source lines, with Form 8949 rollups from the PHP capital-gains engine |
| `form8949` | Canonical Form 8949 rows, Schedule D rollups, and PHP wash-sale adjustments |
| `form1116` | K-1/K-3 passive/general foreign income, line 4b apportionment, sourced-by-partner election metadata, and 1099/K-1 foreign tax facts |
| `form8960` | Net investment income components from Schedule B, Schedule D, Schedule E, and Form 4952; MAGI-dependent tax remains nullable until MAGI is backend-owned |

Useful examples:

```bash
php artisan finance:tax-preview-facts --year=2025 --slice=schedule1 --format=toon
php artisan finance:tax-preview-facts --year=2025 --slice=scheduleB --format=toon
php artisan finance:tax-preview-facts --year=2025 --slice=scheduleE --format=toon
php artisan finance:tax-preview-facts --year=2025 --slice=form1116 --format=json | jq '.form1116'
php artisan finance:tax-preview-facts --year=2025 --slice=form4952 --format=json | jq '.form4952'
php artisan finance:tax-preview-facts --year=2025 --slice=form8949 --format=json | jq '.form8949.washSaleAdjustments'
```

The command is read-only and uses the same `TaxPreviewFactsService` that feeds `/api/finance/tax-preview-data` and the MCP `get_tax_preview` tool.

Fact source rows can include unreviewed parsed entries. Check `isReviewed`, `reviewStatus`, and `reviewAction` in JSON/TOON output; `reviewStatus=needs_review` means the amount is included as an estimate and the named document/link should still be reviewed.

---

### `finance:tax-reconcile`

Compare backend Tax Preview facts against an expected filed-return line fixture. This is intended for CPA-return reconciliation: the fixture stores anonymized line values, while raw/private return artifacts can stay in ignored `training_data/tax_reconciliation/`.

```bash
php artisan finance:tax-reconcile --user=1 --year=2025 --fixture=tests/Fixtures/Finance/tax-return-reconciliations/2025-cpa-anonymized.json --format=table
```

Supported fixture formats are JSON and TOON. Each fixture line declares:

| Field | Meaning |
|-------|---------|
| `form` / `line` / `label` | Human-readable filed-return location |
| `path` | Dot path into `taxFacts`, or a small derived path such as `schedule1.line10TotalAdditionalIncome` |
| `expected` | Filed-return amount |
| `precision` | Comparison rounding, usually `0` for filed whole-dollar forms and `2` for cent-level schedules |
| `tolerance` | Optional per-line tolerance after rounding |

The command exits `0` when all lines match and `1` when any line is missing or mismatched. Use JSON or TOON output when feeding results back into an agent:

```bash
php artisan finance:tax-reconcile --year=2025 --format=json | jq '.summary'
```

The committed fixture is anonymized and contains only expected line values. Do not commit raw CPA return PDFs, screenshots, SSNs, payer names, account names, or account numbers; keep those in ignored `training_data/tax_reconciliation/` if they are useful locally.

---

### `finance:k1-migrate`

Migrate legacy flat-format K-1 `parsed_data` records into the canonical structured shape. Migrated rows are stamped with `schemaVersion: "1.0"` — a marker distinct from `"2026.1"` (which `GenAiJobDispatcherService::coerceK1Args` writes for fresh AI extractions), so you can tell migrated-from-legacy data apart from AI-extracted data after the fact. One-time migration; safe to run repeatedly (only legacy rows without a `schemaVersion` key are touched).

```
php artisan finance:k1-migrate [--dry-run]
```

---

### `finance:lots-import`

Import 1099-B closed-lot records into `fin_account_lots`. Accepts **JSON**, **CSV**, **TOON**, **Fidelity pdftotext**, or supported broker PDFs. Wealthfront consolidated 1099 PDFs are parsed directly through the bundled PHP PDF parser, so they do not require `pdftotext` on the server.

```bash
# JSON (broker_1099 format — see --schema)
php artisan finance:lots-import --account=33 --file=1099b.json

# CSV
php artisan finance:lots-import --account=33 --file=lots.csv

# TOON (helgesverre/toon — 30–60% fewer tokens vs JSON)
php artisan finance:lots-import --account=33 --file=lots.toon

# Fidelity 1099-B PDF via pdftotext
pdftotext -layout "2025 1099 Fidelity.pdf" - | php artisan finance:lots-import --account=33

# Wealthfront consolidated 1099 PDF, stamped back to a tax document
php artisan finance:lots-import --account=33 --tax-document=19 --file="2025 1099 Wealthfront.pdf" --clear

# Print expected schema for all formats
php artisan finance:lots-import --schema
```

**Options**
- `--account` — target `fin_accounts.acct_id` (required)
- `--tax-document` — optional `fin_tax_documents.id`; stamps imported lots with their source tax document
- `--file` — path to input file; omit to read from stdin
- `--input-format` — force format: `json` | `csv` | `toon` | `text` (auto-detected by default)
- `--dry-run` — parse and preview without writing
- `--clear` — delete all existing lots for this account before importing
- `--schema` — print expected input schemas and exit
- `--format` — output format (default: `table`)

**Duplicate detection:** skips rows where the same `(acct_id, symbol, quantity, purchase_date, sale_date, proceeds, cost_basis)` already exists (within $0.01 rounding).

**Transaction linking:** for each imported lot, attempts to find a matching `fin_account_line_items` opening (buy) and closing (sell) transaction and sets `open_t_id` / `close_t_id`. Wealthfront PDF lots skip this step because the statement lot rows are CUSIP-based and do not reliably expose ticker symbols for account-line matching.

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

`finance:import-transactions`, `finance:transactions --import`, and the server-side finance statement import endpoints check for existing transactions with matching `(t_account, t_date, t_type, t_amt, t_symbol)` before inserting to avoid double-importing the same data.

### `--help` and `--schema`

All Artisan commands expose `--help` / `-h` for free via Symfony Console — it prints the command description, arguments, and options. No custom work is needed.

Import commands (`finance:transactions --import`, `finance:import-transactions`, `finance:tax-import`) additionally expose `--schema`, which prints the expected JSON input format to stdout and exits immediately. This is intended for LLM context injection:

```bash
# Teach Claude the expected format before generating import data
php artisan finance:import-transactions --schema
```

Schemas live next to the import logic — `TransactionImportService::inputSchema()` for transaction imports, and similar static methods on import services or constants on the command class for others. `BaseFinanceCommand` provides `emitSchema(array $schema): void` to handle output; the caller immediately returns `0`.

### Base class

All commands extend `App\Console\Commands\Finance\BaseFinanceCommand`, which provides:

| Method | Purpose |
|---|---|
| `userId()` | Read `FINANCE_CLI_USER_ID` env var, default 1 |
| `resolveUser()` | Load `User` model; returns `null` and prints an error if not found — caller must `return 1` |
| `outputData($headers, $rows, $data)` | Route to table, JSON, or TOON output based on `--format` |
| `renderTable($headers, $rows)` | Monospaced pipe-delimited terminal table |
| `outputJson($data)` | Pretty-printed JSON to stdout |
| `outputToon($data)` | TOON output to stdout |
| `readStructuredFromStdin()` | Read + decode JSON or TOON payload from stdin |
| `validateFormat()` | Validate `--format` option value |
| `emitSchema($schema)` | Print JSON schema to stdout and exit (for `--schema` flag) |

---

## Claude CLI Use Case

The primary motivation for this tool is enabling AI-assisted workflows via Claude CLI. Example session:

```bash
# 1. Export current transactions for an account as compact TOON context for Claude
php artisan finance:transactions --account=5 --year=2024 --format=toon > /tmp/txns.toon

# 2. Ask Claude to reconcile against a PDF statement
claude "Compare the transactions in /tmp/txns.toon against the statement in statement.pdf.
Generate TOON for any missing transactions in the finance:import-transactions format."

# 3. Review and import the result
cat /tmp/missing.toon | php artisan finance:transactions --import --account=5 --input-format=toon --dry-run
cat /tmp/missing.toon | php artisan finance:transactions --import --account=5 --input-format=toon
```

This complements the GenAI-based PDF import tools in the UI, giving power users a scriptable, auditable path that doesn't require a browser session.

**Out of scope for the CLI:** Uploading documents (PDFs, statements) must go through the web UI and the background job system (`ParseImportJob`). The CLI operates only on already-parsed structured data.
