# TransactionsTable Documentation

## Overview

The **TransactionsTable** component is a comprehensive, feature-rich table for displaying and managing financial transactions in the Finance module. It provides sorting, filtering, tagging, linking, and inline editing capabilities.

---

## Account-Level Navigation

The finance module uses a multi-level navigation system:

### Finance Sub-Navigation

**Location**: `resources/js/components/finance/FinanceSubNav.tsx`

A shared sub-navigation bar across all finance pages providing quick access to:
- **Accounts** — Account list and management
- **All Transactions** — Cross-account transaction view with Lot Analyzer
- **Schedule C** — Tax year summary for IRS Schedule C expenses and home office deductions
- **RSU** — Restricted Stock Unit tracking
- **Payslips** — Payslip management

This component renders a breadcrumb and a horizontal section-switcher bar. It accepts `breadcrumbItems` (additional breadcrumb entries) and `children` (content below the breadcrumb, like account-specific tabs).

### All Transactions Page

**Location**: `resources/js/components/finance/AllTransactionsPage.tsx`

Unified view across all accounts with advanced features:
- **Year Selector**: Defaults to the current year.
- **Filter Bar**: Toggle between **Show All**, **Cash Only**, and **Stock Only**.
- **On-demand Loading**: Click **Get Transactions** to fetch data based on the selected year and filter.
- **Lot Analyzer**: Toggle button to display IRS Form 8949 style wash sale and gain/loss analysis.

### Account Navigation Component

**Location**: `resources/js/components/finance/AccountNavigation.tsx`

Wraps `FinanceSubNav` and adds account-specific navigation:
- **Breadcrumb**: Finance > Accounts > [Account Combobox] > [Active Tab]
- **Tabs** (left side): Transactions, Duplicates, Statements, Linker, Lots, Summary
- **Year Selector** (inline): Shared across tabs that support year filtering
- **Utility Buttons** (right side): Import, Maintenance

### Year Selection

**Location**: `resources/js/lib/financeRouteBuilder.ts`

The year selector uses URL query strings for shareable, bookmarkable links:
- URL parameter: `?year=2024` or `?year=all`
- Also synced to `sessionStorage` for persistence
- Dispatches `financeYearChange` custom event when changed
- Special values: `all` (all transactions)

---

## Component Location

- **Frontend Component**: `resources/js/components/finance/TransactionsTable.tsx`
- **CSS Styles**: `resources/js/components/finance/TransactionsTable.css`
- **Primary Usage**: `resources/js/components/finance/FinanceAccountTransactionsPage.tsx`
- **Type Definitions**: `resources/js/data/finance/AccountLineItem.ts`

---

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `AccountLineItem[]` | required | Array of transaction line items to display |
| `onDeleteTransaction` | `(transactionId: string) => Promise<void>` | optional | Callback for deleting a transaction |
| `enableTagging` | `boolean` | `false` | Enable tag application functionality |
| `refreshFn` | `() => void` | optional | Callback to refresh data after changes |
| `duplicates` | `AccountLineItem[]` | optional | Array of existing transactions for duplicate detection |
| `enableLinking` | `boolean` | `false` | Enable transaction linking functionality |
| `accountId` | `number` | optional | Account ID for lot management features |
| `pageSize` | `number` | `5000` | Number of rows per page (pagination) |
| `highlightTransactionId` | `number` | optional | Transaction ID to auto-scroll to (triggers page auto-selection) |

---

## Pagination

TransactionsTable supports client-side pagination to optimize DOM performance with large datasets.

### Behavior
- **Default page size**: 5,000 rows
- **Filtering**: Operates across the entire in-memory dataset (not just the current page)
- **Totals**: Computed from all filtered data, not just the current page
- **Controls**: Displayed at both the top and bottom of the table
- **Page changes**: Do not trigger browser scrolling
- **View All**: A button allows bypassing pagination for the current session
- **Go to transaction**: When `highlightTransactionId` is set, the correct page is automatically selected

### Pagination Controls
- First page (`««`), Previous (`«`), Next (`»`), Last (`»»`)
- Current page indicator (e.g., "Page 3 of 12")
- Row range display (e.g., "Showing 10,001–15,000 of 52,413 rows")
- "View All" button to disable pagination
- "Paginate" button to re-enable pagination from View All mode

---

## Features

### 1. Column Display

The table displays the following columns (hidden if all data is empty):

| Column | Field | Description |
|--------|-------|-------------|
| Date | `t_date` | Transaction date |
| Post Date | `t_date_posted` | Date transaction posted |
| Type | `t_type` | Transaction type (e.g., BUY, SELL, DIVIDEND) |
| Category | `t_schc_category` | Schedule C category |
| Description | `t_description` | Transaction description |
| Symbol | `t_symbol` | Stock/security symbol |
| Qty | `t_qty` | Quantity of shares |
| Price | `t_price` | Price per share |
| Commission | `t_commission` | Commission fee |
| Fee | `t_fee` | Other fees |
| Amount | `t_amt` | Transaction amount |
| Memo | `t_comment` | User comments |
| Cash Balance | `t_account_balance` | Running cash balance |
| Tags | `tags` | Applied tags |
| Link | n/a | Link management (if enabled) |
| Details | n/a | Opens details modal |
| Actions | n/a | Delete button |

### 2. Sorting

- Click any column header to sort
- Click again to reverse sort direction
- Default: Sorted by date descending

### 3. Filtering

Each column has an inline filter input:
- Type to filter by substring match
- Tags support comma-separated filtering
- Click a tag badge to filter by that tag

### 4. Duplicate Detection

When `duplicates` prop is provided:
- Checks for matching transactions based on date, amount, and description
- Duplicate rows are highlighted with red background
- Uses `isDuplicateTransaction()` utility from `@/data/finance/isDuplicateTransaction`

### 5. Transaction Linking

When `enableLinking` is true:
- Shows "Link" column with 🔗 button
- Green button indicates existing links
- Opens `TransactionLinkModal` for managing links
- Links connect related transactions across accounts (e.g., transfers)
- **Balanced Detection**: When linked transactions sum to $0.00, the modal shows a green "balanced" indicator and hides the "Available Transactions to Link" section
- Uses `fin_account_line_item_links` table for many-to-many relationships

### 6. Transaction Details Modal

Click "Details" button to open `TransactionDetailsModal`:
- Edit Description, Symbol, Qty, Price, Commission, Fee, Memo
- Current values are pre-populated in the form
- Changes saved via API to `/api/finance/transactions/{id}/update`

### 7. Delete Confirmation

When clicking the 🗑️ delete button:
- A confirmation dialog is displayed
- Shows transaction date, description, and amount
- User must confirm before deletion occurs
- Action is irreversible

### 8. Tagging

When `enableTagging` is true:
- Tags are displayed as colored badges
- "Apply Tag" button to apply tags to filtered transactions
- Fetches available tags via the shared `useFinanceTags` hook (`resources/js/components/finance/useFinanceTags.ts`)
- Tag API response contract is a stable JSON envelope: `{ "data": Tag[] }`
- "Manage Tags" button links to `/finance/tags` for tag CRUD

---

## API Endpoints

### Transaction Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/finance/all-line-items` | Get all transactions (supports streaming and year/filter params) |
| GET | `/api/finance/{account_id}/line_items` | Get transactions for an account |
| POST | `/api/finance/{account_id}/line_items` | Import transactions |
| DELETE | `/api/finance/{account_id}/line_items` | Delete transaction |
| POST | `/api/finance/transactions/{id}/update` | Update transaction fields |
| GET | `/api/finance/{account_id}/transaction-years` | Get available years |
| GET | `/api/finance/{account_id}/summary` | Get account summary |

...
