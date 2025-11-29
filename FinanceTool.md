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

The year selector is shared across all tabs:
- Displayed inline on the navigation bar
- Persisted to `sessionStorage` with key `finance_year_${accountId}`
- Dispatches `yearChanged` custom event when changed
- Special values: `all` (all transactions), `latest` (most recent year)

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
- Shows potential matches (±7 days, ±5% amount) from other accounts
- Checkbox selection for batch linking multiple transactions
- One-click "Link All Selected" for efficient bulk operations

### Link Balance Detection

When linked transactions sum to $0.00 (e.g., -$500 linked to +$500), the link is considered "balanced" and the UI displays a green indicator.

## Transaction Tagging

Tags can be applied to transactions for categorization:
- Tags have a label and color
- Tags support parent-child hierarchy via `parent_tag_id`
- Bulk apply tags to filtered transactions
- Manage tags at `/finance/tags`

## API Controllers

| Controller | Responsibility |
|------------|---------------|
| `FinanceTransactionsApiController` | CRUD operations for transactions |
| `FinanceTransactionLinkingApiController` | Link/unlink transactions, find linkable pairs |
| `FinanceTransactionTaggingApiController` | Tag CRUD and application |
| `FinanceTransactionsDedupeApiController` | Find duplicate transactions |
| `FinanceApiController` | Account summary and other utilities |
