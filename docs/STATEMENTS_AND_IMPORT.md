# Transaction Import & Statement Features

This document describes recent enhancements to the transaction import workflow and
statement viewing experience.

## Import Transactions Page

The import UI now offers finer control when processing PDF files:

- **Three options when a PDF is dropped or pasted**:
  * **Import Transactions** – bring parsed transactions into the account
  * **Attach as Statement** – insert a statement record and/or statement details
  * **Save File to Storage** – upload the original file to S3 for later reference

- Checkboxes are persisted in `localStorage` under the keys
  `pdf_import_transactions`, `pdf_attach_statement`, and `pdf_save_file_s3`, which
  ensures the settings carry across accounts and page reloads.

- The **"Process with AI"** button is disabled unless **at least one** option is
  selected. State is restored on mount so users don’t accidentally re-upload with
  all options off.

- When the user opts to save the file, the PDF is uploaded immediately after the
  AI parsing completes. The file record is created via the existing
  `/api/finance/{accountId}/files` endpoint and will appear on the
  **Statement Files** list under the account regardless of whether the document
  produced transactions or statement details.

## Statements Page & Statement Detail

Statement management has been refactored for a more natural navigation
experience:

- The **Statement Details** button now opens a **full–screen view** instead of a
  modal. The page URL reflects the current statement via a query parameter,
  e.g. `/finance/32/statements?statement_id=12345&year=2025`.

- Breadcrumb navigation is displayed at the top of the detail view, allowing
  users to easily return to the listing while preserving the year filter.

- Since the listing route already loads statement data, the detail view will
  use preloaded information when possible and only fetch details if necessary.
  This avoids unnecessary network requests when switching between statements.

- The **Statement Files** card is hidden when viewing a statement detail; it’s
  only shown on the list page.

- A new API endpoint (`GET /finance/{accountId}/statements/{statementId}/pdf`)
  returns signed URLs for viewing or downloading the original PDF if one is
  attached to the statement. The detail view shows **View Original PDF** and
  **Download PDF** buttons in the top-right corner when a file exists.

- Browser back/forward buttons work seamlessly due to `pushState`/`popstate`
  handling, and the detail view logic is entirely client-side.

## API & Backend Changes

- Introduced `getSignedViewUrl` to the `FileStorageService` for inline viewing
  of files (used by the detail view).

- Added the `viewStatementPdf` method on `FileController` with a matching route.
  This method requires the file to be associated with the requested statement.

## Testing & Quality Assurance

- New unit tests cover the checkbox persistence and disabling behavior in the
  import dialog.
- Statement page tests were updated to accommodate the refactor and still
  validate key functionality like chart toggling and file list presence.

## Notes

- The `files_for_fin_accounts` table already had a `statement_id` column; files
  uploaded via the import workflow are automatically tagged with it when the
  corresponding statement exists.
- All TypeScript and PHP tests currently pass after these changes. Linting
  and type-checking were also updated to accommodate new imports and
  dependencies.

This documentation file can be updated further as new features search or user
feedback arrives.