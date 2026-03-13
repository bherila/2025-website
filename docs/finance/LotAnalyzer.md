# Lot Analyzer Documentation

## Overview

The Lot Analyzer is a client-side React component that analyzes stock transactions to match sales with purchases, calculate gains/losses, and detect IRS wash sales. Its output mirrors IRS Form 8949 (Sales and Other Dispositions of Capital Assets). Analysis results can optionally be saved to the database via the lots API.

## Component Location

- **React Component**: `resources/js/components/finance/LotAnalyzer.tsx`
- **Wash Sale Engine**: `resources/js/lib/finance/washSaleEngine.ts`
- **Unit Tests**: `tests-ts/washSaleEngine.test.ts`
- **PHP Controller**: `app/Http/Controllers/FinanceTool/FinanceLotsController.php`
- **PHP Tests**: `tests/Feature/FinanceLotsControllerTest.php`
- **Type Definitions**: `resources/js/types/finance/account-line-item.ts`

---

## Features

### IRS Form 8949 Output
The component renders a table matching the IRS Form 8949 format with columns:
- **(a)** Description of property (e.g., "100 sh. AAPL")
- **(b)** Date acquired (supports "Various" with detail modal)
- **(c)** Date sold or disposed of
- **(d)** Proceeds (sales price)
- **(e)** Cost or other basis
- **(f)** Code(s) — "W" for wash sale
- **(g)** Amount of adjustment
- **(h)** Gain or (loss)

Results are split into:
- **Part I** — Short-Term (held one year or less)
- **Part II** — Long-Term (held more than one year)

### Various Date Acquired
When a single sale is matched against multiple purchase lots (FIFO), the "Date acquired" column displays as **Various (N)**. Clicking this link opens a modal dialog showing the specific transactions that contributed to the cost basis, including their dates, quantities, and individual prices.

### Account Separation
Sales of the same security on the same day are separated into different line items if they occur in different financial accounts. A **Show accounts** toggle allows appending the account name (as a badge) to the description for better clarity.

### Precise Financial Arithmetic
All currency calculations use **currency.js** to avoid floating-point drift. This ensures that computed proceeds, cost bases, gains, and wash sale adjustments are exact to the cent.

---

## Wash Sale Detection

### Overview
A wash sale occurs when:
1. A security is sold at a **loss**
2. A "substantially identical" security is purchased within a **61-day window** (30 days before to 30 days after the sale date)

When a wash sale is detected:
- The loss is **disallowed** (partially or fully)
- Column (f) shows code "W"
- Column (g) shows the disallowed loss amount
- Column (h) shows the adjusted gain/loss

### Four-Flag Configuration (`WashSaleOptions`)

The wash sale engine supports four independent boolean settings:

| Setting | Description |
|---------|-------------|
| `adjustSameUnderlying` | Master flag: when true, option contracts for the same underlying are considered substantially identical regardless of strike, expiration, or type. When false, `adjustStockToOption` and `adjustOptionToStock` are forced to false. |
| `adjustShortLong` | When true, wash sales can trigger across short and long positions. |
| `adjustStockToOption` | When true, selling stock at a loss then buying a CALL option on the same underlying triggers a wash sale. |
| `adjustOptionToStock` | When true, selling a CALL option at a loss then buying shares of the underlying stock triggers a wash sale. |

### Method 1 — Same Underlying Ticker (Recommended)
All four flags enabled. Option contracts for the same underlying security are considered substantially identical, regardless of strike, expiration, or type. Options are also considered substantially identical to shares of the underlying.

```typescript
import { WASH_SALE_METHOD_1 } from '@/lib/finance/washSaleEngine'
// { adjustShortLong: true, adjustStockToOption: true, adjustOptionToStock: true, adjustSameUnderlying: true }
```

### Method 2 — Identical Ticker (Broker / 1099-B Style)
All four flags disabled. Only exact ticker matches trigger wash sales. Options must have the same strike, expiration, and type (identical option symbol). Shares of the underlying are not considered substantially identical to options.

```typescript
import { WASH_SALE_METHOD_2 } from '@/lib/finance/washSaleEngine'
// { adjustShortLong: false, adjustStockToOption: false, adjustOptionToStock: false, adjustSameUnderlying: false }
```

### Legacy Compatibility
The old `{ includeOptions: boolean }` format is still accepted and automatically mapped:
- `{ includeOptions: true }` → Method 1
- `{ includeOptions: false }` → Method 2

### Short Sale Support
The engine recognizes "Sell short" (opening) and "Buy to close" (closing) transactions. Short sales are matched against their opening "Sell short" transactions and are flagged in the output with a blue **SHORT** badge.

### Transaction Type Recognition
The engine uses flexible substring matching:

**Opening Long:** `Buy`, `Buy to open`, `Reinvest`, etc.
**Closing Long:** `Sell`, `Sell to close`, `Assigned`, `Exercised`, etc.
**Opening Short:** `Sell short`, `Sell to open`, etc.
**Closing Short:** `Buy to cover`, `Buy to close`, etc.

---

## Algorithm Details

### Cost Basis Matching (FIFO)
The engine uses **FIFO (First In, First Out)** matching:
1. Sales are processed chronologically.
2. For each sale, the engine finds the earliest established positions (Buys for Long, Sell Shorts for Short).
3. Shares are consumed from these positions until the sale quantity is satisfied.
4. If a sale spans multiple acquisition dates, it is marked as "Various".
5. If a sale results in both ST and LT portions, it is split into two separate line items.

### Same-Day Merging
Multiple sales of the same security on the same day within the same account are merged into a single line item, provided they have the same term (ST/LT) and adjustment codes.

### Wash Sale Window
The 61-day wash sale window is centered on the sale date:
- **30 days before** the sale date
- **The sale date itself**
- **30 days after** the sale date

### Replacement Share Priority
When multiple purchases fall within the wash sale window, the engine prioritizes:
1. Purchases **after** the sale (most likely to be the "replacement")
2. Among those, the **closest** to the sale date

---

## Database Persistence

### Schema
Lots are stored in `fin_account_lots`. Each row represents one lot, mapping an opening transaction (`open_t_id`) to a closing transaction (`close_t_id`). One closing transaction can map to **multiple** opening lots (e.g., when a sale liquidates shares from several FIFO purchases).

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/finance/{account_id}/lots/save-analyzed` | Save lots from analyzer (replaces previous `analyzer`-sourced lots) |
| `PUT` | `/api/finance/{account_id}/lots/{lot_id}` | Update a single lot (reassign open/close transaction IDs) |
| `DELETE` | `/api/finance/{account_id}/lots/{lot_id}` | Delete a single lot |
| `POST` | `/api/finance/lots/search-opening` | Search for potential opening transactions by symbol across all user accounts |
| `POST` | `/api/finance/lots/save-assignment` | Save manually matched lot assignments to the database |

### Save Workflow
1. User runs the Lot Analyzer on a single-account view
2. Reviews the IRS Form 8949 output
3. Clicks "Save Lots to Database" to persist
4. Previous `analyzer`-sourced lots for that account are replaced; `manual` and `import` lots are preserved

### Manual Lot Matching
When the analyzer cannot find an opening transaction (shows "Unknown" in the Date Acquired column), the user can:
1. Click "Unknown" to open the Acquired Transactions Details modal
2. Click **"Load All Years"** to switch the year selector to "All" and reload all historical transactions
3. Click **"Search for Opening Transaction"** to open the Lot Match Search Modal, which queries the backend by symbol across all accounts
4. Select one or more buy transactions from the search results (with checkbox multi-select and quantity tracking)
5. Save the assignment — this creates `manual`-sourced lot records in the database

This is distinct from the **TransactionLinkModal**, which links related transfers across accounts (e.g., an ACH withdrawal and a matching deposit). The Lot Match Search Modal is specifically for linking buy/sell pairs for tax reporting purposes.

---

## Year-of-Sale Grouping

The Lot Analyzer supports grouping results by the year of sale. When sales span multiple tax years:
- **Tab bar** appears above the summary cards with a tab for each sale year and an "All Years" tab
- Selecting a year tab filters the Form 8949 output and summary cards to that year only
- Wash sale analysis always runs across all years (to catch cross-year wash sales), but the display is filtered
- The **TXF export** respects the selected year tab

---

## TXF Export

The "Save as TXF File" button generates a TXF (Tax eXchange Format) file for import into tax preparation software (TurboTax, H&R Block, etc.).

- **File location**: `resources/js/lib/finance/txfExport.ts`
- **Format**: TXF v042 with reference codes 321 (short-term) and 323 (long-term)
- **Filename**: `yyyy.txf` when a specific year is selected, `all.txf` for all years
- **Wash sale support**: Includes disallowed loss amounts when applicable

---

## UI and Styling

### Badge Indicators
- **SHORT**: Blue outline badge for short sale closings.
- **WASH**: Red destructive badge for wash sale disallowances.
- **Account Names**: Gray outline badges showing the first word of the account name (when enabled).

### Performance Optimization
The transaction list table is automatically hidden when the Lot Analyzer is open to improve browser rendering performance for large datasets.

---

## Testing

Run wash sale engine tests:
```bash
pnpm test -- tests-ts/washSaleEngine.test.ts
```

Run TXF export tests:
```bash
pnpm test -- tests-ts/txfExport.test.ts
```

Run PHP lots controller tests:
```bash
php artisan test --filter=FinanceLotsControllerTest
```

### JS Test Coverage
- **Wash sale engine** (40 tests): normalizeOptions, gain/loss calculation, ST/LT classification, wash sale detection (30-day window, boundary conditions), cross-type settings, Method 1 vs 2, currency precision, edge cases
- **TXF export** (11 tests): header format, reference numbers, date formatting, amounts, wash sale inclusion, multi-lot handling
- **VariousTransactionsModal** (6 tests): render states, Load All Years button, Search for Opening Transaction button

### PHP Test Coverage (23 tests)
- CRUD operations for lots (create, update, delete)
- Save analyzed lots from wash sale engine
- Replace previous analyzer lots on re-save
- One closing transaction → multiple opening lots
- Transaction linking and unlinking
- Merge/deduplication with lot reassignment
- Search opening transactions by symbol
- Save manual lot assignments
- Authorization and authentication
