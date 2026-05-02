# 1099-B Lot Reconciliation

The Tax Preview dock includes a **1099-B Lot Reconciliation** app that compares broker-reported 1099-B lots with account-derived statement lots for a selected tax year. It helps keep Form 8949 feeds from double-counting lots when both a broker tax document and ordinary account statements provide the same sale.

## Entry Points

| Surface | Path |
|---------|------|
| Tax Preview app | `resources/js/components/finance/TaxLotReconciliationPanel.tsx` |
| Tax Preview registry entry | `resources/js/components/finance/tax-preview/registry.tsx` |
| API controller | `app/Http/Controllers/FinanceTool/FinanceLotsController.php` |
| Reconciliation service | `app/Services/Finance/TaxLotReconciliationService.php` |
| Shared matcher | `app/Services/Finance/LotMatcher.php` |
| API response schema | `resources/js/types/finance/tax-lot-reconciliation.ts` |

## API

All endpoints require `web` + `auth` middleware.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/finance/lots/reconciliation?tax_year=YYYY` | Reconcile all owned accounts for the year. |
| `GET` | `/api/finance/{account_id}/lots/reconciliation?tax_year=YYYY` | Reconcile one owned account. |
| `POST` | `/api/finance/{account_id}/lots/reconciliation/apply` | Persist accepted/superseded decisions. |

The apply payload supports:

- `supersede`: rows with `keep_lot_id` and `drop_lot_id`, used when the 1099-B lot should supersede a duplicate statement lot.
- `accept`: account-only lot IDs that should remain in the Form 8949 feed even though no 1099-B match exists.
- `conflicts`: explicit status/notes rows for unresolved or intentionally reviewed lots.

Lot IDs must be positive integers and must belong to the account in the route.

## Matching Model

`TaxLotReconciliationService` loads broker-reported lots and account-derived lots by account and year. Broker-reported lots are identified by `lot_source = 1099b` or a non-null `tax_document_id`; account-derived lots exclude tax-document rows and 1099-B sources.

`LotMatcher::sameDisposition()` is the source of truth for candidate matching:

- same account
- normalized symbol
- same sale date
- absolute quantity within tolerance
- proceeds within money tolerance

After candidate lookup, `LotMatcher::taxValuesMatch()` determines whether cost basis and realized gain/loss agree. Rows are classified as:

- `matched`
- `variance`
- `missing_account`
- `missing_1099b`
- `duplicate`

The service indexes account lots by disposition buckets before running the final matcher check so large accounts avoid a full scan for every reported lot.

## Persistence

Reconciliation state lives on `fin_account_lots`:

- `superseded_by_lot_id`
- `reconciliation_status`
- `reconciliation_notes`

The ordinary lots APIs exclude superseded lots by default. Pass `include_superseded=1` only when reviewing historical reconciliation state.

## Tests

- `tests/Feature/Finance/TaxLotReconciliationServiceTest.php`
- `tests/Feature/Finance/TaxLotReconciliationEndpointTest.php`
- `resources/js/components/finance/__tests__/TaxLotReconciliationPanel.test.tsx`
