# Account Data Import Reconciliation

This document covers the finance import path used to reconcile broker account data into stored transactions and lots. It focuses on the CLI workflow because that is the safest path for AI-assisted or operator-assisted backfills.

Use this flow for:

- Broker activity history imported into `fin_account_line_items`.
- Open-position lot snapshots imported into `fin_account_lots`.
- Closed tax-lot data imported from broker tax documents.
- Follow-up reconciliation between broker-reported lots and account-derived lots.

## Entry Points

| Surface | Purpose |
| --- | --- |
| `php artisan finance:import-transactions` | Import account activity rows into `fin_account_line_items`. |
| `php artisan finance:lots-import --mode=open-positions` | Import current open position lots into `fin_account_lots`. |
| `php artisan finance:lots-import --mode=closed-1099b` | Import closed broker tax lots into `fin_account_lots`. |
| `php artisan finance:lots-reconcile` | Compare stored 1099-B lots with imported account lots without writing. |
| `php artisan finance:lots-match` | Persist broker-to-account lot reconciliation links. |

Run `php artisan help finance:<command>` before using a command. The command help is the source of truth for supported options.

## Schema Prerequisite

Broker imports use stable source identifiers to avoid duplicating rows when the same statement or account-data export is re-imported. Before importing broker activity or lots, confirm these columns exist:

- `fin_account_line_items.external_id`
- `fin_account_lots.external_id`
- `fin_account_lots.market_value`
- `fin_account_lots.snapshot_price`
- `fin_account_lots.snapshot_date`

If those columns are missing, the import commands can fail before dry-run output because the dedupe queries and insert rows reference them.

## Recommended Workflow

1. Confirm the target account belongs to the configured user:

   ```bash
   FINANCE_CLI_USER_ID=1 php artisan finance:accounts --format=json
   ```

2. Inspect current stored state before writing:

   ```bash
   php artisan finance:transactions --account=123 --symbol=XYZ --limit=50 --format=json
   php artisan finance:lots-reconcile --account=123 --year=2025 --format=json
   ```

3. Dry-run transactions first:

   ```bash
   cat broker-transactions.json | php artisan finance:import-transactions \
     --account=123 \
     --input-format=json \
     --dry-run \
     --format=json
   ```

4. Dry-run open positions:

   ```bash
   cat open-positions.json | php artisan finance:lots-import \
     --account=123 \
     --mode=open-positions \
     --input-format=json \
     --dry-run \
     --format=json
   ```

5. Apply only after the dry-run shows the expected inserted/skipped counts.

6. Re-run the read-only reconciliation commands and compare account totals against the source export.

## Transaction Identity

`finance:import-transactions` accepts JSON or TOON payloads. Each row should include ordinary finance columns such as:

- `t_date`
- `t_type`
- `t_amt`
- `t_symbol`
- `t_qty`
- `t_price`
- `t_fee`
- `t_source`
- `t_origin`

For broker exports, set `t_source` to a stable source label. If an explicit `external_id` is not present, the importer can derive one from broker metadata fields plus normalized transaction facts. The fingerprint intentionally includes transaction type, method, date, symbol, quantity, amount, and fee so unrelated activity on the same day does not collapse into one row.

Rows with `external_id` still fall back to legacy duplicate checks against existing rows that predate external IDs. That makes it safe to re-import a broker export after upgrading the schema.

## Open Position Lots

Open-position imports accept either `positions`, `lots`, `transactions`, or a top-level array. Each row needs:

- `symbol`
- `quantity`
- `purchase_date` or `openDate`
- `cost_basis` or `costBasis`

Optional fields include:

- `cost_per_unit` or `costPerShare`
- `market_value` or `marketValue`
- `snapshot_price`
- `snapshot_date`
- `external_id` or `lotId`

When `--mode=open-positions --clear` is used, the command only clears open-position snapshot rows identified as statement-position data. It must not remove closed 1099-B lots.

## Closed Tax Lots

Closed lots from broker tax documents should use `--mode=closed-1099b`. When `--clear` is used in that mode, the command is scoped to imported broker tax-lot rows and should not delete open-position snapshot lots.

After import, use `finance:lots-reconcile` to compare broker-reported dispositions with account-derived lots. Persist accepted matches with `finance:lots-match` only after reviewing the dry-run output.

## Historical Prices

The current importer stores broker-provided cost basis, market value, and snapshot price when present. It does not backfill historical market prices for vesting dates or acquired dates.

A separate stock-price history service should own that work. The intended shape is:

- Store normalized daily OHLC rows by symbol and date.
- Fetch missing rows from a configured provider.
- Prefer existing local quote data when present.
- Backfill idempotently, with source/provider metadata.
- Let RSU, career-comparison, and lot workflows read from the same price history table instead of embedding provider-specific fetch logic.

