# Finance Tool Knowledge

This document contains information about the finance tools in the `bwh-php` project.

## Development Environment

The development environment is configured to handle large datasets efficiently.

### Memory Limit
The `composer run dev` command is configured to run PHP with a **1GB memory limit** (`-d memory_limit=1G`) for both `artisan serve` and `artisan queue:listen`. This prevents out-of-memory errors when processing or viewing thousands of transactions.

## Account Navigation

The finance module uses a tabbed navigation system with a shared year selector at the account level.

### Navigation Tabs

| Tab | Route | Description |
|-----|-------|-------------|
| Transactions | `/finance/{id}` | Main transaction list with filtering, sorting, tagging, linking |
| Duplicates | `/finance/{id}/duplicates` | Find and remove duplicate transactions |
| Statements | `/finance/{id}/statements` | Upload and view account statements (detail view on the same page via query params) |
| Lots | `/finance/{id}/lots` | Track investment positions and lots (open/closed, ST/LT gains) |
| Linker | `/finance/{id}/linker` | Bulk transaction linking tool |

### Utility Buttons

| Button | Route | Description |
|--------|-------|-------------|
| Import | `/finance/{id}/import` | Import transactions from CSV files |
| Maintenance | `/finance/{id}/maintenance` | Account maintenance operations |

### Year Selector

The year selector uses URL query strings for shareable, bookmarkable links:
- URL parameter: `?year=2024` or `?year=all`
- Also synced to `sessionStorage` for persistence  
- All tab navigation preserves the year selection
- Uses `financeRouteBuilder.ts` for centralized URL construction

## All Transactions Page

The **All Transactions** page (`/finance/all-transactions`) provides a unified view of all transactions across all accounts for the current user.

### Performance Optimizations

To handle thousands of transactions across multiple accounts, the following optimizations are implemented:

1.  **JSON Streaming**: The backend (`FinanceTransactionsApiController@getLineItems`) uses `response()->stream()` to send data to the client as it's being read from the database.
2.  **Lazy Loading**: The backend uses Eloquent's `lazy()` method to chunk database results, keeping memory usage constant regardless of the total number of records.
3.  **Client-side Account Mapping**: To avoid repeating account name strings in every transaction record (saving significant bandwidth), the API returns only the account ID. The frontend fetches the account list once and builds an `accountMap` for display lookups.
4.  **On-demand Loading**: Transactions are not loaded automatically on page mount. Users select a year and optional filters (Cash Only / Stock Only) and click **Get Transactions** to trigger the API request.
5.  **Initial Data Bootstrapping**: Available transaction years are passed directly from the Blade template to the React component via a data attribute, eliminating an initial API request.

## Transaction Import

(see PDF Import Enhancements below for additional options when processing PDF files)


The transaction import feature allows users to import transactions from a file. The import process is as follows:

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
caches responses by SHA-256 file hash for one hour. A companion endpoint
(`/api/finance/statement/{statement_id}/pdf`) returns signed URLs for
viewing/downloading any PDF tied to a statement.


### Duplicate File Prevention
To save storage and processing time, the file management system uses SHA-256 hashing:
- When a file is uploaded, its hash is stored in `files_for_fin_accounts.file_hash`.
- If a file with the same hash already exists for the account, the existing record is reused.
- If the file was already uploaded but not yet linked to a statement, it is updated with the new `statement_id`.

### Gemini Cache Management
Gemini API responses are cached by file hash. To allow re-processing a file:
- Deleting a statement from the **Statements** tab will automatically clear the Gemini cache for all associated files.
- This allows the user to re-upload the same file and have Gemini parse it again (useful if the prompt or parsing logic changed).
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
| `POST /api/finance/transactions/import-gemini` | `FinanceGeminiImportController@parseDocument` | Parse PDF or other file with Gemini (cached by file hash) |
| `POST /api/finance/{id}/import-pdf-statement` | `StatementController` | Save parsed statement data (details and lots) |
| `GET /api/finance/{id}/lots` | `FinanceLotsController@index` | Fetch open/closed lots for an account |
| `POST /api/finance/{id}/lots` | `FinanceLotsController@store` | Manually add a lot to an account |


### Statement Details Schema

The `fin_statement_details` table stores MTD/YTD line items:

```sql
CREATE TABLE fin_statement_details (
  id INT AUTO_INCREMENT PRIMARY KEY,
  statement_id INT NOT NULL,        -- FK to fin_statements
  label VARCHAR(255) NOT NULL,      -- e.g., "Interest", "Dividends", "Fees"
  mtd_amount DECIMAL(15,2),         -- Month-to-date value
  ytd_amount DECIMAL(15,2),         -- Year-to-date value
  FOREIGN KEY (statement_id) REFERENCES fin_statements(statement_id)
);
```

### Statement Schema

The `fin_statements` table stores account balance snapshots and statement metadata:

```sql
CREATE TABLE fin_statements (
  statement_id INT AUTO_INCREMENT PRIMARY KEY,
  acct_id INT NOT NULL,                  -- FK to fin_accounts
  balance DECIMAL(15,2) NOT NULL,        -- Closing balance
  statement_opening_date DATE,           -- Statement period start date
  statement_closing_date DATE NOT NULL,  -- Statement period end date
  FOREIGN KEY (acct_id) REFERENCES fin_accounts(acct_id)
);
```

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

| Column | Type | Description |
|--------|------|-------------|
| `lot_id` | BIGINT | Primary Key |
| `acct_id` | BIGINT | Account ID |
| `symbol` | VARCHAR(50) | Ticker symbol |
| `quantity` | DECIMAL(18,8) | Share quantity |
| `purchase_date` | DATE | Date acquired |
| `cost_basis` | DECIMAL(18,4) | Total cost basis |
| `sale_date` | DATE | Date sold (NULL for open) |
| `proceeds` | DECIMAL(18,4) | Total sale proceeds |
| `realized_gain_loss` | DECIMAL(18,4) | Calculated realized P/L |
| `is_short_term` | BOOLEAN | Auto-computed holding period |
| `lot_source` | VARCHAR(50) | `import` or `manual` |
| `statement_id` | BIGINT | Link to the statement this lot was imported from |

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
