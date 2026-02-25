# Finance Tool Knowledge

This document contains information about the finance tools in the `bwh-php` project.

## Account Navigation

The finance module uses a tabbed navigation system with a shared year selector at the account level.

### Navigation Tabs

| Tab | Route | Description |
|-----|-------|-------------|
| Transactions | `/finance/{id}` | Main transaction list with filtering, sorting, tagging, linking |
| Duplicates | `/finance/{id}/duplicates` | Find and remove duplicate transactions |
| Statements | `/finance/{id}/statements` | Upload and view account statements |
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

### Route Builder

**Location**: `resources/js/lib/financeRouteBuilder.ts`

Centralized URL construction and navigation for the finance module:

```typescript
import { 
  transactionsUrl,     // /finance/{id}?year=X
  duplicatesUrl,       // /finance/{id}/duplicates?year=X
  linkerUrl,           // /finance/{id}/linker?year=X
  statementsUrl,       // /finance/{id}/statements?year=X
  summaryUrl,          // /finance/{id}/summary?year=X
  importUrl,           // /finance/{id}/import-transactions
  maintenanceUrl,      // /finance/{id}/maintenance
  goToTransaction,     // Navigate to specific transaction
  getEffectiveYear,    // Get year from URL or sessionStorage
  updateYearInUrl,     // Update URL without navigation
} from '@/lib/financeRouteBuilder'
```

## Transaction Import

The transaction import feature allows users to import transactions from a file. The import process is as follows:

1.  The user drops a file onto the import page.
2.  The frontend parses the file and determines the earliest and latest transaction dates.
3.  The frontend makes an API call to the backend to get all transactions for the account between these dates.
4.  The frontend performs duplicate detection on the client-side by comparing the imported transactions with the existing transactions.
5.  The frontend displays the imported transactions in a table, highlighting any duplicates.
6.  The user can then choose to import the new transactions.

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
- Tags support parent-child hierarchy via `parent_tag_id`
- Bulk apply tags to filtered transactions
- Manage tags at `/finance/tags`

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
| `FinanceTransactionsApiController` | CRUD operations for transactions |
| `FinanceTransactionLinkingApiController` | Link/unlink transactions, find linkable pairs |
| `FinanceTransactionTaggingApiController` | Tag CRUD and application |
| `FinanceTransactionsDedupeApiController` | Find duplicate transactions |
| `FinanceApiController` | Account summary and other utilities |

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
2. If the file is text (CSV/QFX/HAR/etc.) it is parsed immediately in the browser. If it is a PDF the file is held in state and a summary card appears, along with two checkboxes:
   - **Import Transactions**
   - **Attach as Statement**
   Both are checked by default, giving the user control to skip one type if desired.
3. When the user clicks **Process with AI**, the PDF is POSTed to `/api/finance/transactions/import-gemini`.
   The backend endpoint is now `GeminiImportController@parseDocument`; responses (successful JSON payloads) are cached by SHA‑256 hash of the file contents for one hour to avoid repeat API calls. Errors are **not** cached so retries always re‑contact Gemini.
4. Gemini returns a structured JSON object containing any combination of statement information, statement detail rows, and transaction entries. The front end renders preview cards showing the parsed output and highlights duplicates.
5. After reviewing the data, the user confirms by clicking the import button. The existing import logic remains unchanged: transactions are POSTed in chunks and, if statement details exist, the page calls `/api/finance/{id}/import-pdf-statement` to save them (the server‑side controller is `StatementController`).

### API Endpoints

| Endpoint | Controller | Purpose |
|----------|------------|---------|
| `POST /api/finance/transactions/import-gemini` | `GeminiImportController@parseDocument` | Parse PDF or other file with Gemini (cached by file hash) |
| `POST /api/finance/statement/{statement_id}/import-gemini` | `GeminiImportController@importStatementDetails` | Parse PDF and insert statement line items (cached by file hash) |
| `POST /api/finance/{id}/import-pdf-statement` | `StatementController` | Save parsed statement data |

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
- "Import 11 Transactions and Statement" - both
