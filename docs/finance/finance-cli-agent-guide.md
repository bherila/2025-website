# Finance CLI — Agent Guide

Finance domain work is supported by `finance:*` artisan commands. Use the commands themselves for self-discovery rather than relying on static documentation that can drift.

## Discovery

```bash
php artisan list finance                      # all available finance commands
php artisan finance:<command> --help          # options and flags for a specific command
php artisan finance:<command> --schema        # expected stdin/file input format (import commands only)
```

## Input format preference

When generating data to feed an import command, prefer **TOON format** (`--input-format=toon`). TOON is 30–60% more token-efficient than JSON, and the `helgesverre/toon` package is installed. All import commands that accept JSON also accept TOON.

```bash
# Example: import lots using TOON instead of JSON
php artisan finance:lots-import --account=33 --input-format=toon --file=lots.toon
```

## Key commands

| Command | Purpose |
|---|---|
| `finance:accounts` | List accounts for the configured user |
| `finance:transactions` | List / filter transactions |
| `finance:import-transactions` | Import transactions from JSON stdin |
| `finance:lots-import` | Import 1099-B lots (JSON / CSV / TOON / Fidelity pdftotext) |
| `finance:tax-docs` | List tax documents for a year |
| `finance:tax-import` | Import tax document metadata from JSON stdin |
| `finance:tax-render` | Render a tax form summary for a year |

## Configuration

The user ID is read from `FINANCE_CLI_USER_ID` env var (default: 1). All commands are scoped to this user.

```bash
export FINANCE_CLI_USER_ID=2
php artisan finance:accounts
```

## Further reading

- Full command reference with JSON schemas and examples: `docs/finance/finance-tool-artisan-cli.md`
- Lot import formats and duplicate detection: `docs/finance/LotAnalyzer.md`
