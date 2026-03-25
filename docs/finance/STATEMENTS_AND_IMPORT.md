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

- `FileController::viewStatementPdf` returns signed view/download URLs. It now
  supports two file sources (in priority order):
  1. A file in `files_for_fin_accounts` linked to the statement via `statement_id`.
  2. A GenAI import job linked to the statement via `genai_job_id` (see below).
  If neither is present, the endpoint returns 404.

- **Duplicate File Prevention**: `FileController` uses SHA-256 hashes to prevent
  re-saving the same file multiple times for an account. The hash is stored in
  `files_for_fin_accounts.file_hash`.

- **Statement ↔ GenAI Job Link**: `fin_statements` now has an optional
  `genai_job_id` (nullable FK → `genai_import_jobs.id`). This avoids copying
  file metadata between the GenAI system and the statement system when a PDF
  was imported via the GenAI queue. The import workflow can set `genai_job_id`
  on the created statement to record the source job. The file is served directly
  from the GenAI job's S3 path; no duplication required.

- **Automated Cache Cleanup**: Deleting a statement triggers cleanup of any
  cached Gemini AI responses associated with the statement's files.

---

## Import Page: GenAI Job Queue Panel

The **Import** tab on the finance transactions page now shows a **Recent AI Import Jobs** panel above the file drop zone. This panel:

- Lists all `finance_transactions` GenAI import jobs for the current account (or all accounts when viewing the global import page), most recent first.
- Shows each job's filename, status badge, and relative timestamp.
- **Auto-polls every 5 seconds** while any job is in `pending` or `processing` state.
- For jobs in `parsed` or `imported` state, shows a **Select** button. Clicking it loads the parsed AI result directly into the review UI — the same preview workflow that occurs after uploading a new file.
- After uploading a new PDF via the drop zone, the panel immediately shows the new pending job and updates as it progresses through the queue.
- When the user receives the job-complete email notification and returns to the page, the panel will show the completed job with a **Select** button to start the review/import workflow.

### Filtering

The `GET /api/genai/import/jobs` endpoint now accepts optional query parameters:
- `job_type` — filter by job type (e.g. `finance_transactions`). Required to use the 50-job limit; without it the default is 20.
- `acct_id` — filter to jobs for a specific account (ownership is validated).

The response shape has changed from paginated (`data`, `meta`, `links`) to a non-paginated object of the form `{ data: GenAiImportJob[] }` for all requests (regardless of filters). The panel consumes this `{ data: ... }` response shape.

---

## Notes

- The `fin_account_line_items` table includes a `statement_id` column to link
  transactions back to their source statement.
- When a statement is deleted, associated lots and transactions are **un-linked**
  (their `statement_id` is set to `NULL`) rather than deleted, ensuring data
  integrity.
- The `FinAccountBalanceSnapshot` model was renamed to `FinStatement` to align
  with the table name.
