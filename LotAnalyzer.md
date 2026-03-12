# Lot Analyzer Documentation

## Overview

The Lot Analyzer is a client-side React component that analyzes stock transactions to match sales with purchases, calculate gains/losses, and detect IRS wash sales. Its output mirrors IRS Form 8949 (Sales and Other Dispositions of Capital Assets).

## Component Location

- **React Component**: `resources/js/components/finance/LotAnalyzer.tsx`
- **Wash Sale Engine**: `resources/js/lib/finance/washSaleEngine.ts`
- **Unit Tests**: `tests-ts/washSaleEngine.test.ts`
- **Type Definitions**: `resources/js/types/finance/account-line-item.ts`

---

## Features

### IRS Form 8949 Output
The component renders a table matching the IRS Form 8949 format with columns:
- **(a)** Description of property (e.g., "100 sh. AAPL")
- **(b)** Date acquired
- **(c)** Date sold or disposed of
- **(d)** Proceeds (sales price)
- **(e)** Cost or other basis
- **(f)** Code(s) — "W" for wash sale
- **(g)** Amount of adjustment
- **(h)** Gain or (loss)

Results are split into:
- **Part I** — Short-Term (held one year or less)
- **Part II** — Long-Term (held more than one year)

### Wash Sale Detection
A wash sale occurs when:
1. A security is sold at a **loss**
2. A "substantially identical" security is purchased within a **61-day window** (30 days before to 30 days after the sale date)

When a wash sale is detected:
- The loss is **disallowed** (partially or fully)
- Column (f) shows code "W"
- Column (g) shows the disallowed loss amount
- Column (h) shows the adjusted gain/loss

### Substantially Similar Securities
By default, the engine requires an **exact symbol match** for stocks and mutual funds. A toggle allows treating stock options as "substantially similar" to the underlying stock, since the IRC isn't clear on this topic.

### Short Sale Support
The engine recognizes "Sell short" transactions and handles them correctly. Short sales are flagged in the output with a "Short" badge.

### Transaction Type Recognition
The engine recognizes these transaction types:

**Sales:** `Sell`, `Sell short`, `Sell to close`, `Assigned`, `Exercised`, and any type starting with `sell`

**Purchases:** `Buy`, `Buy to cover`, `Buy to open`, `Reinvest`, and any type starting with `buy`

---

## Props

### LotAnalyzer Component

| Prop | Type | Description |
|------|------|-------------|
| `transactions` | `AccountLineItem[]` | Array of transaction records to analyze |

### Wash Sale Engine Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `includeOptions` | `boolean` | `false` | When `true`, stock options are treated as "substantially similar" to the underlying stock for wash sale detection |

---

## Usage

### On All Transactions Page (`/finance/all-transactions`)
The Lot Analyzer is available via a toggle button. When enabled, it analyzes all loaded transactions across all accounts.

### On Single Account Lots Page (`/finance/{id}/lots`)
The Lot Analyzer button loads all transactions for the account and displays the wash sale analysis alongside the existing lots table.

### Programmatic Usage
```tsx
import LotAnalyzer from '@/components/finance/LotAnalyzer'

<LotAnalyzer transactions={transactionData} />
```

### Direct Engine Usage
```typescript
import { analyzeLots, computeSummary } from '@/lib/finance/washSaleEngine'

const lots = analyzeLots(transactions, { includeOptions: false })
const summary = computeSummary(lots)
```

---

## Algorithm Details

### Cost Basis Matching
The engine uses **FIFO (First In, First Out)** matching to determine cost basis:
1. For each sale, find the earliest purchase of the same symbol that hasn't been fully consumed
2. Use that purchase's price to compute cost basis
3. If no matching purchase is found, use the sale's own price data

### Wash Sale Window
The 61-day wash sale window is centered on the sale date:
- **30 days before** the sale date
- **The sale date itself**
- **30 days after** the sale date

### Replacement Share Priority
When multiple purchases fall within the wash sale window, the engine prioritizes:
1. Purchases **after** the sale (most likely to be the "replacement")
2. Among those, the **closest** to the sale date

### Short-Term vs Long-Term
A sale is classified as **short-term** if the holding period is 365 days or less, and **long-term** otherwise.

---

## Summary Cards

The component displays summary cards showing:
- **Total Sales** — number of sale transactions analyzed
- **ST Gain/(Loss)** — net short-term capital gains/losses
- **LT Gain/(Loss)** — net long-term capital gains/losses
- **Net Gain/(Loss)** — total capital gains/losses
- **Wash Sales** — number of wash sale transactions detected
- **Disallowed Loss** — total amount of disallowed losses due to wash sales

---

## Testing

Run wash sale engine tests:
```bash
pnpm test -- tests-ts/washSaleEngine.test.ts
```

The test suite covers:
- Transaction parsing (filtering, type recognition)
- Basic gain/loss calculation
- Short-term vs long-term classification
- Wash sale detection (30-day before/after window)
- Boundary conditions (30 days inclusive, 31 days exclusive)
- Short sale handling
- Options vs stock substantially similar treatment
- Multiple sales and mixed symbols
- Edge cases (empty input, buys only, sells only)
- Summary computation

---

## Future Enhancements

- Partial lot wash sale detection (when replacement quantity < sale quantity)
- Integration with actual lot data from `fin_account_lots` table
- Export to IRS Form 8949 PDF
- Cross-account wash sale detection (already supported via All Transactions page)
- LIFO and specific identification cost basis methods
