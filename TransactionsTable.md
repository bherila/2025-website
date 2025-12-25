# TransactionsTable Documentation

## Overview

The **TransactionsTable** component is a comprehensive, feature-rich table for displaying and managing financial transactions in the Finance module. It provides sorting, filtering, tagging, linking, and inline editing capabilities.

---

## Account-Level Navigation

The finance module uses a tabbed navigation system at the account level with a shared year selector.

### Account Navigation Component

**Location**: `resources/js/components/finance/AccountNavigation.tsx`

The navigation bar displays:
- **Tabs** (left side): Transactions, Duplicates, Statements, Linker
- **Year Selector** (inline): Shared across all tabs
- **Utility Buttons** (right side): Import, Maintenance

### Year Selection

**Location**: `resources/js/lib/financeRouteBuilder.ts`

The year selector uses URL query strings for shareable, bookmarkable links:
- URL parameter: `?year=2024` or `?year=all`
- Also synced to `sessionStorage` for persistence
- Dispatches `financeYearChange` custom event when changed
- Special values: `all` (all transactions)

```typescript
// Import from financeRouteBuilder
import { 
  getEffectiveYear,      // Get year from URL or sessionStorage
  updateYearInUrl,       // Update URL without navigation
  YEAR_CHANGED_EVENT,    // Event name for year changes
  transactionsUrl,       // Build transactions page URL
  goToTransaction,       // Navigate to specific transaction
  type YearSelection 
} from '@/lib/financeRouteBuilder'

// Get effective year (URL > sessionStorage > 'all')
const year = getEffectiveYear(accountId)

// Update year in URL and storage
updateYearInUrl(accountId, 2024)

// Listen for year changes
window.addEventListener(YEAR_CHANGED_EVENT, (e) => {
  const { accountId, year } = (e as CustomEvent).detail
  // Handle year change
})

// Build URL with year
const url = transactionsUrl(accountId, { year: 2024 })
// Result: /finance/123?year=2024

// Navigate to a transaction with year
goToTransaction(accountId, transactionId, 2024)
// Navigates to: /finance/123?year=2024#t_id=456
```

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
- Fetches available tags from `/api/finance/tags`
- "Manage Tags" button links to `/finance/tags` for tag CRUD

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
| GET | `/api/finance/{account_id}/summary` | Get account summary (optionally filtered by year) |
| GET | `/api/finance/{account_id}/duplicates` | Find duplicate transactions (optionally filtered by year) |

### Transaction Linking

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/finance/transactions/{id}/links` | Get links for transaction |
| GET | `/api/finance/transactions/{id}/linkable` | Find linkable transactions |
| POST | `/api/finance/transactions/link` | Create link between transactions |
| POST | `/api/finance/transactions/{id}/unlink` | Remove link |
| GET | `/api/finance/{account_id}/linkable-pairs` | Find unlinked transactions with potential matches |

### Tagging

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/finance/tags` | Get user's tags |
| GET | `/api/finance/tags?include_counts=true` | Get tags with transaction counts |
| POST | `/api/finance/tags` | Create a new tag |
| PUT | `/api/finance/tags/{tag_id}` | Update a tag |
| DELETE | `/api/finance/tags/{tag_id}` | Delete a tag (soft delete) |
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

### ManageTagsPage

**Location**: `resources/js/components/finance/ManageTagsPage.tsx`

Page for managing user's tags:
- Create new tags with label and color
- Edit existing tags
- Delete tags (with confirmation)
- Shows transaction count per tag
- Route: `/finance/tags`

### LinkerPage

**Location**: `resources/js/components/finance/LinkerPage.tsx`

Bulk transaction linking tool:
- Finds unlinked transactions with potential matches in other accounts
- Shows source transactions on the left with potential matches on the right
- Checkbox selection for batch linking multiple transactions
- "Link All Selected" button to create multiple links at once
- Supports unlinking existing links
- Route: `/finance/{account_id}/linker`

### DuplicatesPage

**Location**: `resources/js/components/finance/DuplicatesPage.tsx`

Duplicate transaction finder and remover:
- Finds potential duplicate transactions within the selected year
- Groups duplicates by matching criteria (date, amount, description)
- Allows selecting specific duplicates to delete
- Respects the shared year selector
- Route: `/finance/{account_id}/duplicates`

### FinanceAccountTransactionsPage

**Location**: `resources/js/components/finance/FinanceAccountTransactionsPage.tsx`

Main page component that:
- Fetches transactions for an account
- Provides year selector UI (horizontal button group)
- Handles URL hash for scrolling to specific transaction (`#t_id=123`)
- Handles URL query param for year selection (`?year=2024`)
- Enables tagging and linking

---

## Backend Controllers

### FinanceTransactionsApiController

**Location**: `app/Http/Controllers/FinanceTransactionsApiController.php`

| Method | Description |
|--------|-------------|
| `getLineItems` | Get transactions with year filtering |
| `deleteLineItem` | Delete a transaction |
| `importLineItems` | Bulk import transactions |
| `updateTransaction` | Update transaction fields |
| `getTransactionYears` | Get distinct years for year selector |

### FinanceTransactionLinkingApiController

**Location**: `app/Http/Controllers/FinanceTransactionLinkingApiController.php`

| Method | Description |
|--------|-------------|
| `findLinkableTransactions` | Find potential link targets for a single transaction |
| `linkTransactions` | Create link between two transactions (normalizes direction) |
| `unlinkTransaction` | Remove link between transactions |
| `getTransactionLinks` | Get link details for a transaction |
| `findLinkablePairs` | Find unlinked transactions with potential matches (for Linker tab) |

### FinanceTransactionTaggingApiController

**Location**: `app/Http/Controllers/FinanceTransactionTaggingApiController.php`

| Method | Description |
|--------|-------------|
| `getUserTags` | Get user's tags (optionally with counts) |
| `createTag` | Create a new tag |
| `updateTag` | Update tag label/color |
| `deleteTag` | Soft delete a tag and its mappings |
| `applyTagToTransactions` | Bulk apply tag to transactions |

### FinanceTransactionsDedupeApiController

**Location**: `app/Http/Controllers/FinanceTransactionsDedupeApiController.php`

| Method | Description |
|--------|-------------|
| `findDuplicates` | Find potential duplicate transactions (with year filtering) |

### FinanceApiController

**Location**: `app/Http/Controllers/FinanceApiController.php`

| Method | Description |
|--------|-------------|
| `getAccountSummary` | Get account summary with optional year filtering |

### Linking Logic

- Links are normalized: lower t_id is always `a_t_id`, higher is `b_t_id`
- When dates differ, older transaction is `a_t_id`, newer is `b_t_id`
- Same-date transactions use t_id as tie-breaker
- Linking is prevented when linked amounts >= original amount
- API returns `linking_allowed` boolean for UI control

---

## Eloquent Models

### FinAccountLineItems

**Location**: `app/Models/FinAccountLineItems.php`

```php
// Relationships - transactions can link to each other in either direction
public function linkedTransactionsAsA()
{
    return $this->belongsToMany(
        FinAccountLineItems::class,
        'fin_account_line_item_links',
        'a_t_id',
        'b_t_id'
    )->wherePivotNull('when_deleted');
}

public function linkedTransactionsAsB()
{
    return $this->belongsToMany(
        FinAccountLineItems::class,
        'fin_account_line_item_links',
        'b_t_id',
        'a_t_id'
    )->wherePivotNull('when_deleted');
}
```

### FinAccountLineItemLink

**Location**: `app/Models/FinAccountLineItemLink.php`

Link table model for transaction relationships:
- `a_t_id`: The transaction with lower t_id (or older date)
- `b_t_id`: The transaction with higher t_id (or newer date)
- Supports soft deletion via `when_deleted` timestamp
- Foreign keys to `fin_account_line_items` for both sides

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

## CSV Parsing (Fidelity Format)

**Location**: `resources/js/data/finance/parseFidelityCsv.ts`

See function `splitTransactionString()` for Action column parsing logic. Test coverage in `resources/js/data/finance/parseFidelityCsv.test.ts`.
