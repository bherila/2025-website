# Finance Module Overview

## Development Environment

The development environment is configured to handle large datasets efficiently.

### Memory Limit
The `composer run dev` command is configured to run PHP with a **1GB memory limit** (`-d memory_limit=1G`) for both `artisan serve` and `artisan queue:listen`. This prevents out-of-memory errors when processing or viewing thousands of transactions.

### Demo Seeder Data (for local testing/screenshots)

To populate realistic finance data for the default test user (`test@example.com`), run:

```bash
php artisan db:seed
```

`DatabaseSeeder` calls `Database\Seeders\Finance\FinanceDemoDataSeeder`, which creates:
- Demo accounts: checking, savings, brokerage
- Employment entities: one W-2 employer and one Schedule C business
- Realistic transactions across all three accounts (including direct deposits, stock/option trades, and wash-sale coverage scenarios)
- Two demo tags (one Schedule C tax-characterized tag, one generic non-tax tag) and sample tag mappings

---

## Navigation

Finance pages use a dedicated layout (`resources/views/layouts/finance.blade.php`) that **replaces** the main site navbar with the Finance-specific navigation bar. The main site navbar (`resources/js/components/navbar.tsx`) is not rendered on finance pages.

### Finance Navigation Bar

All finance pages share a **FINANCE** navigation bar (`FinanceNavbar`, `resources/js/components/finance/FinanceNavbar.tsx`) that serves as the primary navigation when inside the Finance tool.

The legacy name `FinanceSubNav` (`resources/js/components/finance/FinanceSubNav.tsx`) is preserved as a backwards-compatible re-export.

#### Layout

| Region | Content |
|--------|---------|
| Far Left | "←" back button (links to `/`, tooltip "Back to BWH") |
| Left | "FINANCE" branding in all-caps (tracked text) |
| Left (account pages) | Account combobox (with "All Accounts" option) |
| Left (account pages) | Account tabs: Transactions, Duplicates, Linker, Statements, Lots, Summary |
| Right (`ml-auto`) | Section links: Tax Preview, RSU, Payslips, Tags, Accounts |

Account combobox and tabs appear only when `accountId` prop is provided.
When `accountId === undefined` (non-account pages such as Tags, RSU), a standalone **Transactions** link is shown instead of the account combobox and tabs; it defaults to the All Accounts transactions view (`/finance/account/all/transactions`).
Duplicates, Linker, Statements, and Summary tabs are disabled when `accountId === 'all'`; Transactions and Lots are always enabled.

#### Props

```ts
interface FinanceNavbarProps {
  accountId?: number | 'all'
  activeTab?: string
  activeSection?: FinanceSection
  children?: React.ReactNode
}
```

#### Right-Side Section Links

| Link | Route |
|------|-------|
| Tax Preview | `/finance/tax-preview` |
| RSU | `/finance/rsu` |
| Payslips | `/finance/payslips` |
| Tags | `/finance/tags` |
| Accounts | `/finance/accounts` |
| Config (gear icon) | `/finance/config` |

#### Blade Layout

Finance pages extend `layouts.finance` instead of `layouts.app`. This layout:
- Includes the `app-initial-data` script tag for server-provided JSON (auth, user info)
- Loads CSS and `back-to-top.tsx` only (no main navbar)
- Skips the `<header>` section and `navbar.tsx` bundle

Finance pages mount `FinanceNavbar` from a `<div id="FinanceNavbar" data-account-id="..." data-active-tab="..." data-active-section="...">` element. The `finance.tsx` entry point reads these data attributes.

### Account Navigation

The `AccountNavigation` component (`resources/js/components/finance/AccountNavigation.tsx`) renders a simplified toolbar below `FinanceNavbar` on account-specific non-transaction pages (duplicates, linker, statements, lots, summary, maintenance, import).

> **Transactions page:** The `TransactionsPage` component renders its own inline toolbar with year selector, tag/filter dropdowns, and Import/Maintenance/New Transaction action buttons. `AccountNavigation` is **not** rendered on the transactions page.

Content:
- **Year selector** (shown for tabs that support year filtering: duplicates, linker, statements, summary)
- **Import** button → `/finance/account/{id}/import`
- **Maintenance** button → `/finance/account/{id}/maintenance`

### Year Selector

The year selector uses URL query strings for shareable, bookmarkable links:
- URL parameter: `?year=2024` or `?year=all`
- Also synced to `sessionStorage` for persistence
- All tab navigation preserves the year selection
- Uses `financeRouteBuilder.ts` for centralized URL construction

**`YearSelectorWithNav` component** (`resources/js/components/finance/YearSelectorWithNav.tsx`) is the reusable year-selection widget. It renders a dropdown with −/+ navigation buttons to step through available years.

---

## URL Routes

### Account-prefixed routes

| Route | Handler |
|-------|---------|
| `/finance/account/all/transactions` | `showAllTransactions()` |
| `/finance/account/all/lots` | `showAllLots()` |
| `/finance/account/all/import` | `showAllImportPage()` |
| `/finance/account/{id}/transactions` | `show()` |
| `/finance/account/{id}/duplicates` | `duplicates()` |
| `/finance/account/{id}/linker` | `linker()` |
| `/finance/account/{id}/statements` | `statements()` |
| `/finance/account/{id}/lots` | `lots()` |
| `/finance/account/{id}/summary` | `summary()` |
| `/finance/account/{id}/maintenance` | `maintenance()` |
| `/finance/account/{id}/import` | `showImportTransactionsPage()` |

### Backward-compat redirects (301)

| Old Route | New Route |
|-----------|-----------|
| `/finance/all-transactions` | `/finance/account/all/transactions` |
| `/finance/{id}` | (kept, numeric constraint) |
| `/finance/{id}/duplicates` etc. | (kept with numeric constraint) |

---

## Account Settings

Each account has configurable settings accessible from the **Maintenance** page:

### Account Type
- **Asset** – positive contribution (e.g. checking, savings, brokerage accounts)
- **Liability** – negative contribution (e.g. credit cards, loans)
- **Retirement** – positive contribution but shown separately in reports

Stored as two boolean flags on `fin_accounts`: `acct_is_debt` (Liability), `acct_is_retirement` (Retirement). Both `false` = Asset.

### Account Number
Stored in `fin_accounts.acct_number` (nullable string). Used for suffix matching during multi-account PDF import (only last 4 digits sent to AI) and display in account settings UI.

---

## Account Performance (Cost Basis Tracking)

The Statements page includes **Account Performance** tracking via a cost basis series. Each statement record has `cost_basis` (decimal) and `is_cost_basis_override` (boolean) fields.

The `GET /api/finance/{account_id}/balance-timeseries` endpoint computes cost basis dynamically:
1. Start from 0; walk all Deposit/Withdrawal/Transfer transactions chronologically
2. Deposits add, Withdrawals subtract, Transfers use signed amount
3. If a statement has `is_cost_basis_override = true`, reset the running total to its stored value
4. Continue adding from the new baseline

---

## Transaction Linking

Transaction linking connects related transactions across accounts (typically transfer pairs). Links are stored in normalized direction: `a_t_id` (older/lower ID) → `b_t_id` (newer/higher ID).

### Linker Tool

The Linker tab provides a bulk linking interface:
- Finds unlinked transactions within the selected year
- Shows potential matches with **exact amount** and ±5 day date window
- Checkbox selection for batch linking
- Excluded: option transactions (`opt_type` set), assignment trades

### Link Balance Detection

When linked transactions sum to $0.00, the link is considered "balanced" (green indicator).

---

## Stock Options

The `StockOptionUtil.ts` module provides consolidated option description parsing supporting multiple broker formats:

| Format | Example | Source |
|--------|---------|--------|
| E-Trade CSV | `1 AAPL Jan 15 '24 $150.00 Call` | E-Trade CSV exports |
| QFX | `CALL AAPL 01/15/24 150` | E-Trade/Fidelity QFX |
| Fidelity Symbol | `-AAPL250117C00150000` | Fidelity CSV Symbol column |
| Fidelity Description | `PUT (AAPL) APPLE INC JAN 17 25 $150 (100 SHS)` | Fidelity CSV Description |
| IB Space | `AMZN 03OCT25 225 C` | Interactive Brokers |
| IB Compact | `TSLA 251024C00470000` | Interactive Brokers symbol |

### Option Transaction Types

- `Buy to Open` / `Sell to Open` - Opening positions
- `Buy to Close` / `Sell to Close` - Closing positions
- `Assignment` - Option assigned (excluded from linker)
- `Exercise` - Option exercised
- `Expired` - Option expired worthless

---

## Utility Bill Tracker

**Routes**: `GET /utility-bill-tracker`, `GET /utility-bill-tracker/{id}/bills`
**Components**: `resources/js/components/utility-bill-tracker/`

Standalone module for tracking recurring utility bills across multiple accounts.

Features:
- Add/Edit/Delete accounts and bills via modals
- Toggle paid/unpaid status per bill
- Import bill from PDF (Gemini AI parsing)
- PDF attachment (upload/download/delete)
- Link to finance transaction via `LinkBillModal`
- Electricity accounts show kWh, Rate, and trend data

---

## API Controllers

| Controller | Responsibility |
|------------|---------------|
| `FinanceTransactionsApiController` | CRUD operations for transactions (unified fetching) |
| `FinanceTransactionLinkingApiController` | Link/unlink transactions, find linkable pairs |
| `FinanceTransactionTaggingApiController` | Tag CRUD and application |
| `FinanceTransactionsDedupeApiController` | Find duplicate transactions |
| `FinanceScheduleCController` | Schedule C tax-year summary aggregation |
| `FinanceApiController` | Account summary, account list, and other utilities |

---

## Data Persistence & Cleanup

When a statement is deleted:
- Associated **Lots** are un-linked (`statement_id` → NULL) but data remains
- Associated **Transactions** are un-linked (`statement_id` → NULL) but data remains

---

## Related Docs

- [transactions-table.md](transactions-table.md) — Transaction display, filtering, tagging
- [import.md](import.md) — Transaction import (CSV, PDF, GenAI)
- [csv-parsers.md](csv-parsers.md) — Broker CSV/QFX parsers
- [tax-system.md](tax-system.md) — Tax documents, Tax Preview, K-1
- [lot-analyzer.md](lot-analyzer.md) — Wash sale engine, lot matching
- [tags.md](tags.md) — Tag structure, tax characteristics
- [rules-engine.md](rules-engine.md) — Transaction automation rules
- [cli.md](cli.md) — Artisan CLI commands
- [payslips.md](payslips.md) — Payslip CRUD and W-2 data
- [mcp-server.md](mcp-server.md) — MCP server for AI agents
- [statements.md](statements.md) — Statement viewing and import
- [account-matching.md](account-matching.md) — Multi-account matching algorithm
- [../exports.md](../exports.md) — Inventory of every data-export surface (XLSX, PDF, CSV, TXF, clipboard)
