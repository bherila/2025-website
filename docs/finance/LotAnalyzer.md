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
The engine recognizes "Sell short" (opening) and "Buy to close" (closing) transactions. Short sales are matched against their opening "Sell short" transactions and are flagged in the output with a blue **SHORT** badge.

### Transaction Type Recognition
The engine uses flexible substring matching to recognize transaction types, including those with "Option" prefixes:

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
To keep the report concise, multiple sales of the same security on the same day within the same account are merged into a single line item, provided they have the same term (ST/LT) and adjustment codes.

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

The test suite covers:
- Transaction parsing and flexible type recognition
- Basic gain/loss calculation
- Short-term vs long-term classification and splitting
- Wash sale detection and replacement tracking
- Short sale handling (Sell short / Buy to close)
- Same-day merging logic
- "Various" transaction aggregation
- Edge cases and summary computation
