# Transaction Import

The transaction import feature allows users to import transactions from various file formats. Import is available from both specific account pages (`/finance/account/{id}/import`) and the all-accounts view (`/finance/account/all/import`).

---

## Import Modes

1. **Single-Account Import** (from `/finance/account/{id}/import`):
   - Supports CSV, QFX, HAR, IB statements, and PDF files
   - All imports are associated with the specific account
   - Duplicate detection compares against existing transactions in that account

2. **Multi-Account Import** (from `/finance/account/all/import`):
   - **PDF only**: Multi-account PDFs are parsed with Gemini AI and automatically distributed to the correct accounts
   - CSV/QFX/HAR imports require a specific account and will show an error if attempted from the "all" page
   - User can override automatic account assignments via dropdown selectors

---

## Import Flow

1. The user drops a file onto the import page.
2. The frontend parses the file and determines the earliest and latest transaction dates.
3. The frontend makes an API call to get all transactions for the account between these dates.
4. Client-side duplicate detection compares imported vs existing transactions.
5. The frontend displays imported transactions in a table, highlighting duplicates.
6. The user chooses to import the new transactions.

---

## PDF Import (GenAI)

> **Full documentation:** See [GenAI Import](../genai-import.md) for the complete architecture, API reference, and security details.

PDF statements are parsed using the GenAI Import system. The frontend uploads files directly to S3 via pre-signed URLs, then creates an import job processed asynchronously by the queue worker.

**Async queue UX:**
After selecting/dropping a PDF, the file is uploaded to S3 and an import job is dispatched. The import page shows a **"Recent AI Import Jobs"** panel that tracks job status in real time (auto-polling every 5 seconds while active). When parsing completes, the user can click **Select** to load parsed results into the review UI.

**After AI parsing completes,** two checkboxes appear:
- **Import Transactions** – import parsed transaction line items
- **Attach as Statement** – create a statement/statement-details record

Checkbox states are persisted globally in `localStorage`.

When a statement is attached, the backend also synthesizes fee transactions from
parsed statement detail rows. `Management Fee` becomes a dated `Fee` line item
at statement close with a negative `t_amt` and a `fee_irc67g` tag; `Incentive
Allocation` becomes a negative `Fee` line item tagged `fee_schE`. `Total Fees`
is treated as a subtotal and ignored. Credit, rebate, reversal, or negative
fee-detail rows are imported as positive `t_amt` values so the signed fee math
nets them out. See [tags.md](tags.md#investment-management-fees) for the fee
tag characteristics.

Synthetic fee transactions use `t_source = stmt_fee_synth` and the imported
`statement_id` as their idempotency marker. Re-importing the same statement
returns the existing statement rows; if synthesis is rerun for a statement, old
synthetic fee rows for that `statement_id` are removed before the current fee
details are inserted. If the parsed `transactions[]` payload already contains a
matching fee transaction for the same statement period, import keeps that broker
row and attaches the fee tax-characteristic tag instead of inserting a duplicate
synthetic line item.

---

## Multi-Account PDF Import

When a bank summary statement contains transactions for multiple accounts, the system supports automatic distribution via the `accounts` context in the import job. See [GenAI Import — Job Types & Context Schema](../genai-import.md#job-types--context-schema).

The frontend (`accountMatcher.ts`) automatically matches each parsed account block to the user's accounts using suffix matching and name disambiguation. See [account-matching.md](account-matching.md) for the algorithm.

---

## Unified Document Import

Consolidated brokerage 1099 PDFs (e.g., Fidelity Tax Reporting Statement) and statement documents are created through the unified document import flow:

1. Upload PDF via `POST /api/finance/documents/request-upload`
2. Confirm via `POST /api/finance/documents` with `document_kind`
3. GenAI uses the `document_extract` job type with `document_kind` in context
4. Server-side matching creates `fin_document_accounts` rows; unmatched tax-form entries get `account_id = null`
5. User reviews/corrects assignments in `DocumentImportModal`, then confirms account links

---

## Duplicate Detection

A transaction is considered a duplicate if it has the same `t_date`, `t_type`, `t_description`, `t_qty`, and `t_amt` as an existing transaction. The comparison for `t_type` and `t_description` is a substring match.

### Dedupe Page

The Duplicates tab (`/finance/{id}/duplicates`) provides:
- Automatic grouping of similar transactions
- Checkbox selection for marking duplicates to delete
- **Mark as Not Duplicate**: prevents future flagging
- Bulk delete selected duplicates

---

## Duplicate File Prevention

The file management system uses SHA-256 hashing:
- When a file is uploaded, its hash is stored in `files_for_fin_accounts.file_hash`
- If a file with the same hash already exists for the account, the existing record is reused
- The GenAI import system also de-duplicates by file hash

---

## Backend API

| Endpoint | Description |
|----------|-------------|
| `POST /api/genai/import/request-upload` | Get a pre-signed S3 URL for uploading a PDF |
| `POST /api/genai/import/jobs` | Create a new async import job after S3 upload |
| `GET /api/genai/import/jobs` | List recent import jobs (supports `job_type` and `acct_id` filters) |
| `GET /api/finance/documents` | List unified import documents; supports `document_kind` filtering |
| `POST /api/finance/documents/request-upload` | Get a pre-signed S3 URL for unified document uploads |
| `POST /api/finance/documents` | Confirm and ingest a tax form, statement, CSV, JSON, or TOON document |

---

## Import UI Components

| Component/Hook | File | Purpose |
|----------------|------|---------|
| `ImportTransactions` | `ImportTransactions.tsx` | Main import page component |
| `ImportProgressDialog` | `ImportProgressDialog.tsx` | Progress bar during import |
| `StatementPreviewCard` | `StatementPreviewCard.tsx` | Preview IB statement data |
| `PdfStatementPreviewCard` | `PdfStatementPreviewCard.tsx` | Preview PDF statement details |
| `useImportTransactionDragDrop` | `useImportTransactionDragDrop.ts` | File drag-and-drop handlers |
| `useImportTransactionPaste` | `useImportTransactionPaste.ts` | Ctrl+V paste handler |
| `useDuplicateDetection` | `useDuplicateDetection.ts` | Load existing transactions and filter duplicates |
| `useImportExecution` | `useImportExecution.ts` | Import execution lifecycle (chunking, retry) |
| `useImportSummary` | `useImportSummary.ts` | Computes import summary counts and button text |
| `usePdfAccountMapping` | `usePdfAccountMapping.ts` | Auto-maps PDF account blocks to user accounts |
| `usePdfImportOptions` | `usePdfImportOptions.ts` | Manages PDF import checkboxes |
| `useGenAiFileUpload` | `genai-processor/useGenAiFileUpload.ts` | Shared async file upload hook |
| `useGenAiJobPolling` | `genai-processor/useGenAiJobPolling.ts` | Shared job status polling hook |

### Import Button Text

The import button shows contextual text based on what will be imported:
- "Import 11 Transactions" — transactions only
- "Import Statement" — statement only
- "Import 11 Transactions and 1 Statement" — both
- "Import 11 Transactions and 1 Statement and 5 Lots" — all three types

---

## Statement Schema

Statement snapshots and metadata are stored in `fin_statements`. Statement details (MTD/YTD line items) are stored in `fin_statement_details`. See `/database/schema/mysql-schema.sql` for full schemas.
