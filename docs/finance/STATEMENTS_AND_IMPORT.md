# Statement Features & Import Enhancements

This document covers the statement viewing experience and related backend enhancements.

For the full transaction import workflow (supported formats, checkboxes, UI components), see [FinanceTool.md § Transaction Import](FinanceTool.md#transaction-import).  
For the GenAI asynchronous import pipeline (architecture, API, quota), see [GenAI Import](../GenAI-Import.md).

---

## Statements Page & Statement Detail

Statement management has been refactored for a more natural navigation
experience:

- The **Statement Details** button now opens a **full-screen view** instead of a
  modal. The page URL reflects the current statement via a query parameter,
  e.g. `/finance/32/statements?statement_id=12345&year=2025`.

- Breadcrumb navigation is displayed at the top of the detail view, allowing
  users to easily return to the listing while preserving the year filter.

- Since the listing route already loads statement data, the detail view will
  use preloaded information when possible and only fetch details if necessary.
  This avoids unnecessary network requests when switching between statements.

- The **Statement Files** card is hidden when viewing a statement detail; it's
  only shown on the list page.

- A new API endpoint (`GET /finance/{accountId}/statements/{statementId}/pdf`)
  returns signed URLs for viewing or downloading the original PDF if one is
  attached to the statement. The detail view shows **View Original PDF** and
  **Download PDF** buttons in the top-right corner when a file exists.

- Browser back/forward buttons work seamlessly due to `pushState`/`popstate`
  handling, and the detail view logic is entirely client-side.

---

## API & Backend Changes

- `FileStorageService::getSignedViewUrl` generates inline-viewing signed URLs
  (used by the statement detail view to show the original PDF).

- `FileController::viewStatementPdf` returns signed view/download URLs and
  requires the file to be associated with the requested statement.

- **Duplicate File Prevention**: `FileController` uses SHA-256 hashes to prevent
  re-saving the same file multiple times for an account. The hash is stored in
  `files_for_fin_accounts.file_hash`.

- **Automated Cache Cleanup**: Deleting a statement triggers cleanup of any
  cached Gemini AI responses associated with the statement's files.

---

## Notes

- The `fin_account_line_items` table includes a `statement_id` column to link
  transactions back to their source statement.
- When a statement is deleted, associated lots and transactions are **un-linked**
  (their `statement_id` is set to `NULL`) rather than deleted, ensuring data
  integrity.
- The `FinAccountBalanceSnapshot` model was renamed to `FinStatement` to align
  with the table name.
