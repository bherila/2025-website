# RSU Management System

The RSU management system tracks actual restricted stock unit vesting events, quote-derived vest prices, settlement reconciliation, brokerage/tax-lot links, payslip links, and Career Comparison snapshots.

## Canonical model

Table: `fin_equity_awards`

- One row is one actual RSU vesting event/tranche.
- A group of rows with the same `uid`, `award_id`, `grant_date`, and `symbol` is one grant/award schedule.
- `share_count` supports fractional shares.
- Same-day vesting is vested: `vest_date <= today`.
- `vest_price` and `grant_price` are nullable; blank UI prices are stored as `null`, not `0`.
- Price provenance is tracked with `vest_price_source`, `vest_price_fetched_at`, `grant_price_source`, and `grant_price_fetched_at`.

Supported price sources:

| Source | Meaning |
| --- | --- |
| `manual` | User entered or edited the price. |
| `imported` | GenAI/PDF import supplied the price. |
| `quote_close` | Stock quote close was persisted by backfill. |
| `unknown` | Legacy stored value without provenance. |

## API

### Awards

- `GET /api/rsu` returns actual vesting events with price sources, settlement allocations, and typed links.
- `POST /api/rsu` upserts vesting events through `RsuAwardService`.
- `DELETE /api/rsu/{id}` deletes one user-scoped vesting event.
- `POST /api/rsu/backfill-vest-prices` persists missing historical vest prices from stock quotes.

### Settlements

- `GET /api/rsu/settlements`
- `POST /api/rsu/settlements/suggest`
- `POST /api/rsu/settlements/{settlement}/confirm`
- `PUT /api/rsu/settlements/{settlement}`
- `POST /api/rsu/settlements/{settlement}/ignore`

A settlement groups same-day/same-symbol RSU rows because payroll and brokerage activity is usually settled at that level. Settlement formulas are:

```text
gross_income = gross_shares × vest_price
withheld_value = withheld_shares_whole × vest_price
excess_refund = withheld_value - actual_tax_remitted
allocation_ratio = row_vested_shares / settlement_gross_shares
```

### Links

- `GET /api/rsu/settlements/{settlement}/links`
- `GET /api/rsu/settlements/{settlement}/candidates`
- `POST /api/rsu/settlements/{settlement}/links`
- `DELETE /api/rsu/links/{link}`
- `GET /api/finance/transactions/{transaction}/rsu-links`
- `GET /api/payslips/{payslip}/rsu-links`

Allowed link types include `share_deposit`, `sell_to_cover`, `withholding_cash`, `excess_refund`, `sale`, `tax_lot`, `payslip_rsu_income`, `payslip_rsu_tax_offset`, `payslip_rsu_excess_refund`, and `other`.

## Career Comparison

Career Comparison imports actual RSU rows as snapshots. Each imported grant includes an `rsuSource` block containing snapshot mode, capture time, source table, source award row IDs, and a source hash. Shared links keep the embedded RSU snapshot even when actual rows later change.

## Virtual refreshers

Future current-job refreshers are projected by Career Comparison only. They are not written to `fin_equity_awards`, not included in settlement reconciliation, and must be labeled as projected in RSU surfaces.
