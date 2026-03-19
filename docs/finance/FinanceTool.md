# Finance Tool Knowledge

This document contains information about the finance tools in the `bwh-php` project.

## Development Environment

The development environment is configured to handle large datasets efficiently.

### Memory Limit
The `composer run dev` command is configured to run PHP with a **1GB memory limit** (`-d memory_limit=1G`) for both `artisan serve` and `artisan queue:listen`. This prevents out-of-memory errors when processing or viewing thousands of transactions.

## Main Navigation

Finance pages use a dedicated layout (`resources/views/layouts/finance.blade.php`) that **replaces** the main site navbar with the Finance-specific navigation bar. The main site navbar (`resources/js/components/navbar.tsx`) is not rendered on finance pages.

## Finance Navigation Bar

All finance pages share a **FINANCE** navigation bar (`FinanceNavbar`, `resources/js/components/finance/FinanceNavbar.tsx`) that serves as the primary navigation when inside the Finance tool.

The legacy name `FinanceSubNav` (`resources/js/components/finance/FinanceSubNav.tsx`) is preserved as a backwards-compatible re-export.

### Layout

The navbar has a **two-sided layout**:

| Region | Content |
|--------|---------|
| Far Left | "←" back button (links to `/`, tooltip "Back to BWH") |
| Left | "FINANCE" branding in all-caps (tracked text) |
| Left (account pages) | Account combobox (with "All Accounts" option) |
| Left (account pages) | Account tabs: Transactions, Duplicates, Linker, Statements, Lots, Summary |
| Right (`ml-auto`) | Section links: Tax Preview, RSU, Payslips, Tags, Accounts |

Account combobox and tabs appear only when `accountId` prop is provided.
When `accountId === undefined` (non-account pages such as Schedule C, Tags, RSU), a standalone **Transactions** link is shown instead of the account combobox and tabs; it defaults to the All Accounts transactions view (`/finance/account/all/transactions`).
Duplicates, Linker, Statements, and Summary tabs are disabled when `accountId === 'all'`; Transactions and Lots are always enabled.

### Props

```ts
interface FinanceNavbarProps {
  accountId?: number | 'all'   // number = specific account, 'all' = all accounts, undefined = no account nav
  activeTab?: string            // active account tab (left side)
  activeSection?: FinanceSection // active right-side section
  children?: React.ReactNode
}
```

### Right-Side Section Links

| Link | Route |
|------|-------|
| Tax Preview | `/finance/tax-preview` |
| RSU | `/finance/rsu` |
| Payslips | `/finance/payslips` |
| Tags | `/finance/tags` |
| Accounts | `/finance/accounts` |
| Config (⚙ icon) | `/finance/config` |

### Navigation Menu Component

The navigation uses the shadcn `NavigationMenu` component (`resources/js/components/ui/navigation-menu.tsx`) built on `@radix-ui/react-navigation-menu`.

### Blade Layout

Finance pages extend `layouts.finance` instead of `layouts.app`. This layout:
- Includes the `app-initial-data` script tag for server-provided JSON (auth, user info)
- Loads CSS and `back-to-top.tsx` only (no main navbar)
- Skips the `<header>` section and `navbar.tsx` bundle

Finance pages mount `FinanceNavbar` from a `<div id="FinanceNavbar" data-account-id="..." data-active-tab="..." data-active-section="...">` element. The `finance.tsx` entry point reads these data attributes.

## Account Navigation

The `AccountNavigation` component (`resources/js/components/finance/AccountNavigation.tsx`) renders a simplified toolbar below `FinanceNavbar` on account-specific non-transaction pages (duplicates, linker, statements, lots, summary, maintenance, import).

> **Transactions page:** The `TransactionsPage` component now renders its own inline toolbar with year selector, tag/filter dropdowns, and Import/Maintenance/New Transaction action buttons. `AccountNavigation` is **not** rendered on the transactions page.

### Content

- **Year selector** (shown for tabs that support year filtering: duplicates, linker, statements, summary)
- **Import** button → `/finance/account/{id}/import`
- **Maintenance** button → `/finance/account/{id}/maintenance`

Account tabs and account combobox have moved to `FinanceNavbar`.

### Navigation Tabs (now in FinanceNavbar)

| Tab | Route | Description |
|-----|-------|-------------|
| Transactions | `/finance/account/{id}/transactions` | Main transaction list with filtering, sorting, tagging, linking |
| Duplicates | `/finance/account/{id}/duplicates` | Find and remove duplicate transactions |
| Linker | `/finance/account/{id}/linker` | Bulk transaction linking tool |
| Statements | `/finance/account/{id}/statements` | Upload and view account statements |
| Lots | `/finance/account/{id}/lots` | Track investment positions and lots (open/closed, ST/LT gains) |
| Summary | `/finance/account/{id}/summary` | Account summary |

### Utility Buttons

| Button | Route | Description |
|--------|-------|-------------|
| Import | `/finance/account/{id}/import` or `/finance/account/all/import` | Import transactions from CSV files or multi-account PDFs |
| Maintenance | `/finance/account/{id}/maintenance` | Account maintenance operations (hidden when viewing "All" accounts) |

### Year Selector

The year selector uses URL query strings for shareable, bookmarkable links:
- URL parameter: `?year=2024` or `?year=all`
- Also synced to `sessionStorage` for persistence  
- All tab navigation preserves the year selection
- Uses `financeRouteBuilder.ts` for centralized URL construction

**`YearSelectorWithNav` component** (`resources/js/components/finance/YearSelectorWithNav.tsx`) is the reusable year-selection widget used across the finance module. It renders a dropdown with −/+ navigation buttons to step through available years:
- The **−** button goes to the previous (older) year
- The **+** button goes to the next (newer) year
- Buttons are disabled when no older/newer year is available
- Supports optional "All Years" entry (enabled by default via `includeAll` prop)
- Used by `AccountYearSelector`, `TransactionsPage`, and `ScheduleCPage`

## URL Routes

### New account-prefixed routes

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

## All Transactions Page

The **All Transactions** page (`/finance/account/all/transactions`) provides a unified view of all transactions across all accounts for the current user.

### Performance Optimizations

To handle thousands of transactions across multiple accounts, the following optimizations are implemented:

1.  **JSON Streaming**: The backend (`FinanceTransactionsApiController@getLineItems`) uses `response()->stream()` to send data to the client as it's being read from the database.
2.  **Lazy Loading**: The backend uses Eloquent's `lazy()` method to chunk database results, keeping memory usage constant regardless of the total number of records.
3.  **Client-side Account Mapping**: To avoid repeating account name strings in every transaction record (saving significant bandwidth), the API returns only the account ID. The frontend fetches the account list once and builds an `accountMap` for display lookups.
4.  **Auto-loading**: Transactions are loaded automatically on page mount and re-fetched when year/filter/tag controls change.
5.  **Initial Data Bootstrapping**: Available transaction years are passed directly from the Blade template to the React component via a data attribute, eliminating an initial API request.

### Tag Filtering

The All Transactions page supports filtering by tag:
- URL parameter: `?tag=TagName`
- A **Select tag** dropdown allows choosing from all available user tags.
- When a tag is specified in the URL on mount, the page automatically fetches transactions for that tag.

## Transaction Import

The transaction import feature allows users to import transactions from various file formats. Import is available from both specific account pages (`/finance/account/{id}/import`) and the all-accounts view (`/finance/account/all/import`).

### Import Modes

1. **Single-Account Import** (from `/finance/account/{id}/import`):
   - Supports CSV, QFX, HAR, IB statements, and PDF files
   - All imports are associated with the specific account
   - Duplicate detection compares against existing transactions in that account

2. **Multi-Account Import** (from `/finance/account/all/import`):
   - **PDF only**: Multi-account PDFs are parsed with Gemini AI and automatically distributed to the correct accounts
   - CSV/QFX/HAR imports require a specific account and will show an error if attempted from the "all" page
   - User can override automatic account assignments via dropdown selectors

(see PDF Import Enhancements below for additional options when processing PDF files)

The transaction import process is as follows:

1.  The user drops a file onto the import page.
2.  The frontend parses the file and determines the earliest and latest transaction dates.
3.  The frontend makes an API call to the backend to get all transactions for the account between these dates.
4.  The frontend performs duplicate detection on the client-side by comparing the imported transactions with the existing transactions.
5.  The frontend displays the imported transactions in a table, highlighting any duplicates.
6.  The user can then choose to import the new transactions.

### PDF Import Enhancements

PDF statements now offer a two-stage experience with explicit options:

**Stage 1 (Pre-Gemini):** After selecting/dropping a PDF, one checkbox is shown:
- **Save File to Storage** – upload the original PDF to S3 for later reference

**Stage 2 (Post-Gemini):** After AI parsing completes, additional checkboxes appear before the Import button:
- **Import Transactions** – import parsed transaction line items (shown only when transactions are detected)
- **Attach as Statement** – create a statement/statement-details record (shown only when statement details are detected)

Checkbox states are persisted globally in `localStorage` (`pdf_import_transactions`,
`pdf_attach_statement`, `pdf_save_file_s3`) so users don’t need to reconfigure each
session or per account.

When the storage option is selected the file is immediately uploaded to
`/api/finance/{accountId}/files` after Gemini processing completes; the resulting
record will surface in the **Statement Files** card on the Statements page even
if no transactions or details were imported.

The backend endpoint for AI parsing (`FinanceGeminiImportController@parseDocument`)
caches responses by SHA-256 file hash **and** accounts context hash for one hour. A companion endpoint
(`/api/finance/statement/{statement_id}/pdf`) returns signed URLs for
viewing/downloading any PDF tied to a statement.

### Multi-Account PDF Import

When a bank summary statement (e.g. Ally Bank combined statement) contains transactions for multiple accounts, the system supports automatic distribution. This feature works from **both** the specific account import page and the "All Accounts" import page (`/finance/account/all/import`):

1. **AI Context**: The import page sends the user’s account names and last-4 digits of account
   numbers to the Gemini API along with the PDF. The full account number is **never** sent to the AI.
2. **Grouped Response**: Gemini returns an `accounts[]` array grouping transactions by account.
   Single-account PDFs also return this format (array of one element) for consistency.
3. **Suffix Matching**: The frontend (`accountMatcher.ts`) automatically matches each parsed
   account block to the user’s accounts using:
   - Exact account number match
   - Last-4-digit suffix match
   - Word-overlap name disambiguation when multiple accounts share the same suffix
4. **Per-Account Preview**: Each account group is shown as a separate card before import,
   with a dropdown for manual account assignment override.
5. **Import**: Clicking "Import" calls `POST /api/finance/multi-import-pdf` which creates
   statement records and inserts transactions for each account in a single DB transaction.
6. **Store PDF Once**: The PDF file is uploaded to S3 once (for the primary account).
   For additional accounts, `POST /api/finance/{accountId}/files/attach` creates a
   `files_for_fin_accounts` record pointing to the same S3 path by file hash.

#### Account Mapping Override

The per-account dropdowns in the import preview default to auto-detected accounts.
The current page’s account (from the URL) is used as the fallback for unmatched blocks.
Users can change any mapping before clicking import.

#### Backend API

| Endpoint | Description |
|----------|-------------|
| `POST /api/finance/transactions/import-gemini` | Parse PDF with Gemini; accepts optional `accounts[]` context (name + last4 only) |
| `POST /api/finance/multi-import-pdf` | Import data for multiple accounts in one transaction |
| `POST /api/finance/{accountId}/files/attach` | Attach an already-stored file (by hash) to an account |

### Duplicate File Prevention
To save storage and processing time, the file management system uses SHA-256 hashing:
- When a file is uploaded, its hash is stored in `files_for_fin_accounts.file_hash`.
- If a file with the same hash already exists for the account, the existing record is reused.
- If the file was already uploaded but not yet linked to a statement, it is updated with the new `statement_id`.

### Gemini Cache Management
Gemini API responses are cached by file hash + accounts context hash. To allow re-processing a file:
- Deleting a statement from the **Statements** tab will automatically clear the Gemini cache for all associated files.
- This allows the user to re-upload the same file and have Gemini parse it again (useful if the prompt or parsing logic changed).

## Account Settings

Each account has configurable settings accessible from the **Maintenance** page:

### Account Type
The account type determines how balances are treated in net-worth calculations:
- **Asset** – positive contribution (e.g. checking, savings, brokerage accounts)
- **Liability** – negative contribution (e.g. credit cards, loans)
- **Retirement** – positive contribution but shown separately in reports

Account type is stored as two boolean flags on the `fin_accounts` table:
- `acct_is_debt` = `true` → Liability
- `acct_is_retirement` = `true` → Retirement
- Both `false` → Asset

### Account Number
The full account number can be stored in `fin_accounts.acct_number` (nullable string).
It is used for:
- Suffix matching during multi-account PDF import (only last 4 digits are sent to AI)
- Display in the account settings UI

The account number is stored at rest in the database. Only the last 4 digits are ever
shared with third-party AI services for account matching purposes.

## Duplicate Detection

Duplicate detection is performed on the client-side. A transaction is considered a duplicate if it has the same `t_date`, `t_type`, `t_description`, `t_qty`, and `t_amt` as an existing transaction. The comparison for `t_type` and `t_description` is a substring match.

## Transaction Linking

Transaction linking connects related transactions across accounts, typically transfer pairs.

### Link Normalization

Links are stored in a normalized direction:
- `a_t_id`: The transaction with the older date, or lower t_id if dates are equal
- `b_t_id`: The transaction with the newer date, or higher t_id if dates are equal

### Linker Tool

The Linker tab provides a bulk linking interface:
- Finds unlinked transactions within the selected year
- Shows potential matches with **exact amount** and ±5 day date window
- Uses in-memory matching for efficiency (reduces SQL roundtrips)
- Checkbox selection for batch linking multiple transactions
- One-click "Link All Selected" for efficient bulk operations

**Excluded from linking:**
- Option transactions (where `opt_type` is set)
- Assignment trades (where `t_description` starts with "Assignment")

Note: For single-transaction linking (via TransactionLinkModal), the criteria is more relaxed (±7 days, ±5% amount).

### Link Balance Detection

When linked transactions sum to $0.00 (e.g., -$500 linked to +$500), the link is considered "balanced" and the UI displays a green indicator.

## Duplicate Detection

Duplicate detection is performed on the client-side. A transaction is considered a duplicate if it has the same `t_date`, `t_type`, `t_description`, `t_qty`, and `t_amt` as an existing transaction. The comparison for `t_type` and `t_description` is a substring match.

### Dedupe Page Features

The Duplicates tab (`/finance/{id}/duplicates`) provides:
- Automatic grouping of similar transactions
- Checkbox selection for marking duplicates to delete
- **Mark as Not Duplicate**: When all items in a group are unchecked and submitted, both transactions are marked as "not duplicate" to prevent future flagging
- Bulk delete selected duplicates

## Transaction Tagging

Tags can be applied to transactions for categorization:
- Tags have a label and color
- Bulk apply tags to all currently-filtered transactions (up to 1,000 items)
- Manage tags at `/finance/tags`

### Tag API Response Contract

Tag fetch endpoints return a consistent JSON envelope:
- `GET /api/finance/tags` → `{ data: Tag[] }`
- `GET /api/finance/tags?include_counts=true` → `{ data: TagWithCount[] }`
- `GET /api/finance/tags?totals=true` → `{ data: TagWithTotals[] }` — each tag includes a `totals` map of `{ year: amount, all: totalAllYears }`
- `POST /api/finance/tags/apply` → Bulk apply a tag to multiple transactions.
- Both `include_counts=true` and `totals=true` can be combined in one request.

Both `TransactionsTable` and `ManageTagsPage` use the shared hook `resources/js/components/finance/useFinanceTags.ts` to consume this contract.

**Important**: The `fallbackTags` option uses a `useRef` internally so that passing a default `[]` literal does **not** cause an infinite re-render loop. Do not include `fallbackTags` in `useCallback` dependencies.

### Tagging Limit

When more than 1,000 transactions are shown in the filtered view, the tagging apply buttons are disabled and a warning `Alert` is displayed. Users must refine their filters to fewer than 1,000 transactions before applying tags.

### Totals by Tag

The `TagTotalsView` component (`resources/js/components/finance/TagTotalsView.tsx`) renders a table of tag totals broken down by year plus an "All Years" column. It is used in:
- **All Transactions page** (`?view=tag-totals`): accessible via the view selector ButtonGroup.
- **Manage Tags page**: rendered below the tags list when totals are available.

### All Transactions Page Views & URL State

The All Transactions page supports three views selectable via a `ButtonGroup` in the toolbar:

| View | URL param | Description |
|------|-----------|-------------|
| Transactions | `?view=` (default) | TransactionsTable with tagging enabled |
| Lot Analyzer | `?view=lots` | LotAnalyzer component |
| Totals by Tag | `?view=tag-totals` | TagTotalsView component |

The following state is persisted in the URL so the browser back button works:
- `?year=YYYY` — selected year (or omitted for "all")
- `?show=cash|stock` — filter type (or omitted for "all")
- `?view=lots|tag-totals` — active view (or omitted for default transactions view)

## Schedule C View

**Route**: `GET /finance/schedule-c`  
**Component**: `resources/js/components/finance/ScheduleCPage.tsx`  
**API**: `GET /api/finance/schedule-c[?year=YYYY]` → `FinanceScheduleCController@getSummary`

The Schedule C view is a dedicated tax-reporting summary page. It aggregates tagged transactions into IRS Schedule C (Profit or Loss from Business) line-item totals grouped by tax year.

### What it Shows

- **Year selector** (top-right) with −/+ navigation buttons to step through years; defaults to the current year. Choosing "All Years" shows all years.
- **"List transactions in-line" toggle** (top-right Switch) — when enabled, each Schedule C line item expands to show individual transactions (Date, Name, Amount with a "Go to" link) indented beneath it.
- For each tax year (most recent first):
  - **Full-width year header** — e.g., "2024"
  - **Income table** — one row per `business_*` category (shown only when there is data)
  - **Two 50/50 side-by-side tables**:
    - **Schedule C Expenses**: One row per `sce_*` category with a positive dollar total
    - **Home Office Deductions**: One row per `scho_*` category with a positive dollar total
  - **Total row** at the bottom of each table
  - **Click any row** to open a Transaction List Modal showing each transaction that contributes to that line, with a "Go to" link using `transactionsUrl()` from `financeRouteBuilder.ts`

Amounts are stored as negatives in the database (expenses) but displayed as positive values in this view.

### API Parameters

| Parameter | Description |
|-----------|-------------|
| `year` | (optional) Filter to a single year, e.g. `?year=2024`. Omit for all years. |

### API Response Shape

```json
{
  "available_years": ["2024", "2023"],
  "years": [
    {
      "year": "2024",
      "schedule_c_income": { ... },
      "schedule_c_expense": { ... },
      "schedule_c_home_office": { ... }
    }
  ]
}
```

`available_years` always contains all years with data regardless of the `year` filter. This allows the year-selector UI to populate correctly even when a specific year is selected.

### How it Works

1. The API fetches all non-deleted tags for the authenticated user that have a non-null `tax_characteristic` starting with `sce_`, `scho_`, or `business_`.
2. It JOINs `fin_account_line_items` → `fin_account_line_item_tag_map` → `fin_account_tag` → `fin_accounts`.
3. All rows are fetched (unfiltered) to derive `available_years`. The year filter is then applied on the collection.
4. The server applies `abs()` for expense and home-office items; income items are shown as-is.
5. Years are sorted descending.
6. Each category entry in the JSON response includes a `transactions` array with `t_id`, `t_date`, `t_description`, `t_amt`, and `t_account`.

See `docs/finance/Tags.md` for the full list of valid `tax_characteristic` values and the tag management system.

## Utility Bill Tracker

**Routes**: `GET /utility-bill-tracker`, `GET /utility-bill-tracker/{id}/bills`  
**Components**: `resources/js/components/utility-bill-tracker/`

The Utility Bill Tracker is a standalone module within the Finance dropdown that allows users to track recurring utility bills across multiple accounts (e.g., electricity, gas, water, internet).

### Concepts

- **Utility Account** — A named account representing one utility service (e.g., "Pacific Gas & Electric"). Accounts have a type (`Electricity` or `General`) and optional notes.
- **Bill** — A single billing record for an account, with a due date, amount due, status (paid/unpaid), and optional PDF attachment.

### Pages

| Page | Route | Component | Description |
|------|-------|-----------|-------------|
| Account List | `/utility-bill-tracker` | `UtilityAccountListPage.tsx` | List all utility accounts; click a row to view bills |
| Bill List | `/utility-bill-tracker/{id}/bills` | `UtilityBillListPage.tsx` | View and manage bills for one account |

### Features

- **Add/Edit/Delete accounts** via modals
- **Add/Edit/Delete bills** via modals
- **Toggle paid/unpaid status** per bill
- **Import bill from PDF** — uploads a PDF to Gemini AI for structured parsing, pre-filling the bill form
- **PDF attachment** — store a PDF of the bill for reference (download/delete supported)
- **Link to finance transaction** — associate a bill with a matching transaction in the Finance module via `LinkBillModal`
- **Account notes** — free-form text notes per account (auto-saved on blur)

### Electricity Account View

When `accountType === 'Electricity'`, the bill list shows additional columns:
- **kWh** — kilowatt-hours consumed
- **Rate** — computed cost per kWh
- Charts and trend analysis (if available)

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/utility-bill-tracker/accounts` | List all accounts |
| `POST` | `/api/utility-bill-tracker/accounts` | Create account |
| `GET` | `/api/utility-bill-tracker/accounts/{id}` | Get account detail |
| `PUT` | `/api/utility-bill-tracker/accounts/{id}/notes` | Update account notes |
| `DELETE` | `/api/utility-bill-tracker/accounts/{id}` | Delete account |
| `GET` | `/api/utility-bill-tracker/accounts/{id}/bills` | List bills for account |
| `POST` | `/api/utility-bill-tracker/accounts/{id}/bills` | Create bill |
| `GET` | `/api/utility-bill-tracker/accounts/{id}/bills/{billId}` | Get bill detail |
| `PUT` | `/api/utility-bill-tracker/accounts/{id}/bills/{billId}` | Update bill |
| `POST` | `/api/utility-bill-tracker/accounts/{id}/bills/{billId}/toggle-status` | Toggle paid/unpaid |
| `DELETE` | `/api/utility-bill-tracker/accounts/{id}/bills/{billId}` | Delete bill |
| `GET` | `/api/utility-bill-tracker/accounts/{id}/bills/{billId}/download-pdf` | Download PDF |
| `DELETE` | `/api/utility-bill-tracker/accounts/{id}/bills/{billId}/pdf` | Delete PDF |
| `POST` | `/api/utility-bill-tracker/accounts/{id}/bills/import-pdf` | Import bill from PDF via Gemini |
| `GET` | `/api/utility-bill-tracker/accounts/{id}/bills/{billId}/linkable` | Find linkable finance transactions |
| `POST` | `/api/utility-bill-tracker/accounts/{id}/bills/{billId}/link` | Link bill to transaction |
| `POST` | `/api/utility-bill-tracker/accounts/{id}/bills/{billId}/unlink` | Unlink bill from transaction |

**Controllers**: `app/Http/Controllers/UtilityBillTracker/`

## Stock Options

### Option Parsing

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

Option transactions may have special types:
- `Buy to Open` / `Sell to Open` - Opening positions
- `Buy to Close` / `Sell to Close` - Closing positions
- `Assignment` - Option assigned (excluded from linker)
- `Exercise` - Option exercised
- `Expired` - Option expired worthless

## API Controllers

| Controller | Responsibility |
|------------|---------------|
| `FinanceTransactionsApiController` | CRUD operations for transactions (unified fetching) |
| `FinanceTransactionLinkingApiController` | Link/unlink transactions, find linkable pairs |
| `FinanceTransactionTaggingApiController` | Tag CRUD and application |
| `FinanceTransactionsDedupeApiController` | Find duplicate transactions |
| `FinanceScheduleCController` | Schedule C tax-year summary aggregation |
| `FinanceApiController` | Account summary, account list, and other utilities |

## CSV Parsers

### Supported Formats

| Parser | File | Broker |
|--------|------|--------|
| `parseEtradeCsv.ts` | E-Trade CSV | E-Trade |
| `parseFidelityCsv.ts` | Fidelity CSV | Fidelity |
| `parseIbCsv.ts` | IB Activity Statement | Interactive Brokers |
| `parseQuickenQFX.ts` | QFX/OFX | Various |
| `parseWealthfrontHAR.ts` | HAR export | Wealthfront |

### IB CSV Statement Data

The IB CSV parser (`parseIbCsv.ts`) extracts both transaction-level and statement-level data:

**Transaction Data:**
- Trades (stocks and options)
- Interest transactions
- Fee transactions

**Statement Data:**
- Statement info (period, account, broker)
- Net Asset Value (NAV) by asset class
- Cash Report line items
- Open Positions with cost basis
- Mark-to-Market Performance by symbol
- Realized & Unrealized Performance summary

Statement data is stored in dedicated tables linked to `fin_statements`:
- `fin_statement_nav` - NAV breakdown
- `fin_statement_cash_report` - Cash flow items
- `fin_statement_positions` - Holdings snapshot
- `fin_statement_performance` - P/L by symbol
- `fin_statement_details` - Statement line items (MTD/YTD values)

### Unified Import Parser

The `parseImportData.ts` module provides a unified entry point for parsing imported data:

**Location**: `resources/js/data/finance/parseImportData.ts`

```typescript
import { parseImportData } from '@/data/finance/parseImportData'

const { data, statement, parseError } = parseImportData(text)
```

The parser tries each format in order until one succeeds:
1. E-Trade CSV
2. Quicken QFX/OFX
3. Wealthfront HAR
4. Fidelity CSV
5. Interactive Brokers CSV (with statement data)
6. Generic CSV fallback

## PDF Statement Import

PDF statements can be imported using Gemini AI for parsing. The frontend now provides a two‑step experience with explicit options and server‑side caching.

### Import Flow

1. User drops or pastes a file on the import page, or chooses one via the file picker.
2. If the file is text (CSV/QFX/HAR/etc.) it is parsed immediately in the browser. If it is a PDF the file is held in state and a summary card appears with a **Save File to Storage** checkbox.
3. When the user clicks **Process with AI**, the PDF is POSTed to `/api/finance/transactions/import-gemini`.
   The backend endpoint is now `FinanceGeminiImportController@parseDocument`; responses (successful JSON payloads) are cached by SHA‑256 hash of the file contents for one hour to avoid repeat API calls. Errors are **not** cached so retries always re‑contact Gemini.
   **Date handling:** any dates extracted from the PDF (e.g. transaction dates or statement period dates) are truncated to the `YYYY-MM-DD` string form on the server before being returned. This avoids timezone conversions and ensures the database stores plain date strings without time or zone components.
   **Fund-Level Filtering:** The import process automatically filters out fund-level information. The Gemini prompt instructs the AI to ignore sections like "Fund Level Capital Account," and a server-side filter provides a safety net by skipping any parsed rows where the section name contains "Fund Level."
4. Gemini returns a structured JSON object containing any combination of statement information, statement detail rows, transaction entries, and investment lots. The front end renders preview cards showing the parsed output and highlights duplicates.
5. After reviewing the data, the user confirms by clicking the import button. The existing import logic remains unchanged: transactions are POSTed in chunks and, if statement details or lots exist, the page calls `/api/finance/{id}/import-pdf-statement` to save them (the server‑side controller is `StatementController`).

### API Endpoints

| Endpoint | Controller | Purpose |
|----------|------------|---------|
| `GET /api/finance/all/line_items` | `FinanceTransactionsApiController@getLineItems` | Get all transactions across all accounts (supports streaming, year/filter/tag params) |
| `GET /api/finance/{account_id}/line_items` | `FinanceTransactionsApiController@getLineItems` | Get transactions for a single account |
| `POST /api/finance/transactions/import-gemini` | `FinanceGeminiImportController@parseDocument` | Parse PDF or other file with Gemini (cached by file hash) |
| `POST /api/finance/{id}/import-pdf-statement` | `StatementController` | Save parsed statement data (details and lots) |
| `GET /api/finance/{id}/lots` | `FinanceLotsController@index` | Fetch open/closed lots for an account |
| `POST /api/finance/{id}/lots` | `FinanceLotsController@store` | Manually add a lot to an account |


### Statement Details Schema

Statement details (MTD/YTD line items) are stored in the `fin_statement_details` table. See `/database/schema/mysql-schema.sql` for the full schema.

### Statement Schema

Statement snapshots and metadata are stored in `fin_statements`. See `/database/schema/mysql-schema.sql` for the full schema.

### Import UI Components

The import page uses extracted components for better maintainability:

| Component | File | Purpose |
|-----------|------|---------|
| `ImportProgressDialog` | `ImportProgressDialog.tsx` | Progress bar during import |
| `StatementPreviewCard` | `StatementPreviewCard.tsx` | Preview IB statement data |
| `IbStatementDetailModal` | `IbStatementDetailModal.tsx` | Detailed view of IB statement |

### Import Button Text

The import button shows contextual text based on what will be imported:
- "Import 11 Transactions" - transactions only
- "Import Statement" - statement only
- "Import 11 Transactions and 1 Statement" - transactions + statement
- "Import 11 Transactions and 1 Statement and 5 Lots" - all three types

## Position and Lot Tracking

The finance module supports tracking investment positions at the lot level. This data can be entered manually or extracted automatically from PDF statements via the Gemini AI parser.

### Core Logic

- **Open vs. Closed**: Lots with a `sale_date` of `NULL` are considered "Open." Once a `sale_date` is provided, the lot is "Closed."
- **ST/LT Classification**: The transition from Short-Term (ST) to Long-Term (LT) occurs after holding a lot for more than 365 days. The system automatically computes this based on `purchase_date` and `sale_date`.
- **Gains and Losses**: Realized gains and losses are calculated as `proceeds - cost_basis` upon closing a lot.

### Database Schema (`fin_account_lots`)

Lot data is stored in `fin_account_lots`. See `/database/schema/mysql-schema.sql` for the full schema. Key columns: `lot_id`, `acct_id`, `symbol`, `quantity`, `purchase_date`, `cost_basis`, `sale_date`, `proceeds`, `realized_gain_loss`, `is_short_term`, `lot_source`, `statement_id`.

### Lots UI Page

The Lots tab (`/finance/{id}/lots`) provides:
- **Toggles**: Switch between "Open Lots" and "Closed Lots".
- **Year Filter**: For closed lots, filter by tax year.
- **Summary Cards**: Visual breakdown of ST/LT gains and losses for the selected year.
- **Detailed Table**: Complete list of lots with symbol, quantity, dates, performance, and source.
- **Statement Link**: For imported lots, a clickable link to the original statement detail view. Shows "Statement Deleted" if the statement was removed but the lot was preserved.

## Data Persistence & Cleanup
When a statement is deleted:
- Associated **Lots** are un-linked (their `statement_id` is set to NULL) but the data remains.
- Associated **Transactions** are un-linked (their `statement_id` is set to NULL) but the data remains.
- This ensures that deleting a statement doesn't accidentally wipe out your transaction history or position tracking.

## Transaction Rules Engine

The rules engine automates actions on transactions when they are created, imported, or when rules are explicitly run. Rules are user-owned and combine conditions (AND logic) with ordered actions.

For full documentation, see [TransactionRulesEngine.md](TransactionRulesEngine.md).

## Tax System

The tax system tracks employment entities (Schedule C businesses, W-2 employers, hobbies), links them to transaction tags and payslips, and provides tax-year summaries. Tags carry tax characteristics (Schedule C expenses, home office deductions, and non-Schedule C items like interest and dividends). Marriage/filing status is tracked per year.

For full documentation, see [TaxSystem.md](TaxSystem.md).
