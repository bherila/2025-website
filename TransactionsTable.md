# TransactionsTable Documentation

## Overview

The **TransactionsTable** component is a comprehensive, feature-rich table for displaying and managing financial transactions in the Finance module. It provides sorting, filtering, tagging, linking, and inline editing capabilities.

---

## Component Location

- **Frontend Component**: `resources/js/components/TransactionsTable.tsx`
- **CSS Styles**: `resources/js/components/TransactionsTable.css`
- **Primary Usage**: `resources/js/components/finance/FinanceAccountTransactionsPage.tsx`

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
- Fetches available tags from `/api/finance/tags`

---

## Data Schema

```typescript
interface AccountLineItem {
  t_id?: number
  t_account?: number
  t_date?: string
  t_date_posted?: string | null
  t_type?: string | null
  t_schc_category?: string | null
  t_description?: string | null
  t_symbol?: string | null
  t_cusip?: string | null
  t_qty?: number | null
  t_price?: number | string | null
  t_commission?: number | string | null
  t_fee?: number | string | null
  t_amt?: number | string | null
  t_comment?: string | null
  t_account_balance?: number | string | null
  parent_t_id?: number | null
  parent_of_t_ids?: number[]
  parent_transaction?: LinkedTransaction | null
  child_transactions?: LinkedTransaction[]
  tags?: Tag[]
  // Option fields
  opt_expiration?: string | null
  opt_type?: string | null
  opt_strike?: number | string | null
}

interface LinkedTransaction {
  t_id: number
  t_account: number
  acct_name?: string
  t_date: string
  t_description?: string
  t_amt: number | string
}
```

---

## API Endpoints

### Transaction Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/finance/{account_id}/line_items` | Get transactions |
| GET | `/api/finance/{account_id}/line_items?year={year}` | Get transactions filtered by year |
| POST | `/api/finance/{account_id}/line_items` | Import transactions |
| DELETE | `/api/finance/{account_id}/line_items` | Delete transaction |
| POST | `/api/finance/transactions/{id}/update` | Update transaction fields |
| GET | `/api/finance/{account_id}/transaction-years` | Get available years |

### Transaction Linking

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/finance/transactions/{id}/links` | Get links for transaction |
| GET | `/api/finance/transactions/{id}/linkable` | Find linkable transactions |
| POST | `/api/finance/transactions/link` | Create link between transactions |
| POST | `/api/finance/transactions/{id}/unlink` | Remove link |

### Tagging

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/finance/tags` | Get user's tags |
| POST | `/api/finance/tags/apply` | Apply tag to transactions |

---

## Related Components

### TransactionDetailsModal

**Location**: `resources/js/components/TransactionDetailsModal.tsx`

Modal for viewing and editing transaction details:
- Editable fields: Description, Symbol, Qty, Price, Commission, Fee, Memo
- Displays read-only Date, Type, and Amount

### TransactionLinkModal

**Location**: `resources/js/components/TransactionLinkModal.tsx`

Modal for managing transaction links:
- Shows existing parent/child transaction links
- "Go to" button navigates to linked transaction (with year parameter)
- "Unlink" button removes relationship
- Finds potential matches within ±7 days and ±5% of amount
- Linking is disabled when linked amounts equal or exceed parent amount

### FinanceAccountTransactionsPage

**Location**: `resources/js/components/finance/FinanceAccountTransactionsPage.tsx`

Main page component that:
- Fetches transactions for an account
- Provides year selector UI (horizontal button group)
- Handles URL hash for scrolling to specific transaction (`#t_id=123`)
- Handles URL query param for year selection (`?year=2024`)
- Enables tagging and linking

---

## CSS Styling

### TransactionsTable.css

```css
/* Highlight animation for navigated-to transactions */
@keyframes highlight-pulse {
  0%, 100% { background-color: transparent; }
  50% { background-color: rgb(254 243 199); }
}

.highlight-transaction {
  animation: highlight-pulse 1s ease-in-out 3;
}
```

---

## Usage Examples

### Basic Usage

```tsx
<TransactionsTable
  data={transactions}
  onDeleteTransaction={handleDelete}
/>
```

### With Full Features

```tsx
<TransactionsTable
  data={transactions}
  onDeleteTransaction={handleDelete}
  enableTagging
  enableLinking
  refreshFn={() => refetchData()}
/>
```

### For Import Preview (with Duplicate Detection)

```tsx
<TransactionsTable
  data={parsedCsvData}
  duplicates={existingTransactions}
/>
```

---

## Backend Controller

**Location**: `app/Http/Controllers/FinanceTransactionsApiController.php`

Extracted from `FinanceApiController.php` for better separation of concerns.

### Methods

| Method | Description |
|--------|-------------|
| `getLineItems` | Get transactions with year filtering |
| `deleteLineItem` | Delete a transaction |
| `importLineItems` | Bulk import transactions |
| `updateTransaction` | Update transaction fields |
| `getTransactionYears` | Get distinct years for year selector |
| `findLinkableTransactions` | Find potential link targets |
| `linkTransactions` | Create parent-child link |
| `unlinkTransaction` | Remove parent-child link |
| `getTransactionLinks` | Get link details for a transaction |

### Linking Logic

- Parent transaction: typically the withdrawal (source of transfer)
- Child transaction: typically the deposit (destination of transfer)
- Linking is prevented when linked child amounts >= parent amount
- API returns `linking_allowed` boolean for UI control

---

## Database Schema

### fin_account_line_items

```sql
t_id INT PRIMARY KEY AUTO_INCREMENT
t_account INT NOT NULL (FK to fin_accounts)
t_date DATE
t_date_posted DATE
t_type VARCHAR(50)
t_schc_category VARCHAR(50)
t_description VARCHAR(255)
t_symbol VARCHAR(20)
t_cusip VARCHAR(20)
t_qty DECIMAL(15,6)
t_price DECIMAL(15,6)
t_commission DECIMAL(15,2)
t_fee DECIMAL(15,2)
t_amt DECIMAL(15,2)
t_comment TEXT
t_account_balance DECIMAL(15,2)
parent_t_id INT (FK to fin_account_line_items for linking)
opt_expiration DATE
opt_type VARCHAR(10)
opt_strike DECIMAL(15,2)
```

### Eloquent Model

**Location**: `app/Models/FinAccountLineItems.php`

```php
// Relationships
public function parentTransaction()
{
    return $this->belongsTo(FinAccountLineItems::class, 'parent_t_id', 't_id');
}

public function childTransactions()
{
    return $this->hasMany(FinAccountLineItems::class, 'parent_t_id', 't_id');
}
```

---

## CSV Parsing (Fidelity Format)

**Location**: `resources/js/data/finance/parseFidelityCsv.ts`

### Field Mapping

When parsing Fidelity CSV exports, the Action column is parsed by `splitTransactionString()`:

| Action Column Example | Description (t_description) | Memo (t_comment) | Type (t_type) |
|----------------------|---------------------------|------------------|---------------|
| `BOUGHT` | `BOUGHT` | *(empty)* | `Buy` |
| `DIVIDEND RECEIVED APA CORPORATION COM (APA) (Margin)` | `APA CORPORATION COM (APA) (MARGIN)` | `DIVIDEND RECEIVED` | `Dividend` |
| `TRANSFER OF ASSETS ACAT RECEIVE BROADCOM INC COM (AVGO)` | `ACAT RECEIVE BROADCOM INC COM (AVGO)` | `TRANSFER OF ASSETS` | `Transfer` |
| `MERGER MER PAYOUT #REORCM00516... (WBA) (Cash)` | `MER PAYOUT #REORCM00516... (WBA) (CASH)` | `MERGER` | `Merger` |
| `FOREIGN TAX PAID NXP SEMICONDUCTORS NV (NXPI)` | `NXP SEMICONDUCTORS NV (NXPI)` | `FOREIGN TAX PAID` | `Tax` |
| `INTEREST EARNED FIMM TREASURY ONLY PORTFOLIO (FSIXX)` | `FIMM TREASURY ONLY PORTFOLIO (FSIXX)` | `INTEREST EARNED` | `Interest` |
| `INTEREST SHORT SALE REBATE TESLA INC (TSLA)` | `TESLA INC (TSLA)` | `INTEREST SHORT SALE REBATE` | `Interest` |
| `MARGIN INTEREST CHARGED (Margin)` | `CHARGED (MARGIN)` | `MARGIN INTEREST` | `Interest` |

### Logic

1. The function matches known prefixes (e.g., `DIVIDEND RECEIVED`, `TRANSFER OF ASSETS`, `MARGIN INTEREST`)
2. **Description** (`t_description`) = The "rest" after the prefix (more specific details)
3. **Memo** (`t_comment`) = The matched prefix (the transaction action category)
4. If no "rest" exists (e.g., simple `BOUGHT` or `SOLD`), description is the prefix and memo is empty

### Supported Transaction Types

| Prefix | Type |
|--------|------|
| `YOU BOUGHT`, `BOUGHT` | `Buy` |
| `YOU SOLD`, `SOLD` | `Sell` |
| `DIVIDEND RECEIVED`, `DIVIDEND CHARGED` | `Dividend` |
| `INTEREST EARNED`, `INTEREST SHORT SALE REBATE`, `MARGIN INTEREST` | `Interest` |
| `TRANSFER OF ASSETS`, `TRANSFERRED TO VS`, `TRANSFERRED FROM VS` | `Transfer` |
| `MERGER` | `Merger` |
| `FOREIGN TAX PAID` | `Tax` |
| `WIRE TRANSFER FROM BANK`, `WIRE TRANSFER TO BANK` | `Wire` |
| `DIRECT DEPOSIT`, `ELECTRONIC FUNDS TRANSFER RECEIVED`, `CHECK RECEIVED` | `Deposit` |
| `DIRECT DEBIT`, `ELECTRONIC FUNDS TRANSFER PAID`, `CHECK PAID` | `Withdrawal` |
| `REINVESTMENT` | `Reinvest` |
| `REDEMPTION FROM CORE ACCOUNT`, `REDEMPTION PAYOUT` | `Redeem` |
| `JOURNALED`, `JOURNALED GOODWILL` | `Journal` |
| `ASSET/ACCT FEE` | `Fee` |
| `BILL PAYMENT` | `Payment` |
| `YOU SOLD SHORT SALE...` | `Sell Short` |

### Test Coverage

**Location**: `resources/js/data/finance/parseFidelityCsv.test.ts`

- 63 test cases covering all supported transaction types
- Tests both `splitTransactionString()` function and full CSV parsing
- Validates description/memo field assignment
