# Data Exports

This document enumerates every place the application produces downloadable files, clipboard payloads, or other external artifacts derived from user data. It is the reference for security reviews, watermarking work, and change-management around sensitive data leaving the system.

> **Watermarking roadmap.** All exports listed below are slated to carry a user-identifying watermark (full name, company, email, timestamp with timezone, project codename, short NDA legal line, session ID, and IP address) rendered as a visible but non-disruptive diagonal/repeated pattern across every page or rendered surface, and as metadata in structured formats. See the tracking issue linked from the `Dean's list` milestone for the requirements and rollout plan.

## Server-generated exports

### 1. Tax Preview workbook (XLSX)

- **Endpoint:** `POST /api/finance/tax-preview/export-xlsx`
- **Controller:** `app/Http/Controllers/FinanceTool/TaxPreviewExportController.php` (`export()`)
- **Client builder:** `resources/js/lib/finance/buildTaxWorkbook.ts`, triggered from `TaxPreviewPage.tsx`
- **Contents:** Multi-sheet tax-return preview — Forms 1040, Schedule A–E, Schedule SE, K-1 summaries, Form 8582, cross-sheet formula references.
- **Format:** XLSX (PhpSpreadsheet 3.x), auto-sized columns, bold headers/totals.
- **Current watermark:** none.

### 2. Tax Preview IRS PDF export readiness

- **Endpoint:** `POST /finance/tax-preview/export-pdf`
- **Controller:** `app/Http/Controllers/FinanceTool/TaxReturnPdfExportController.php` (`export()`)
- **Client:** `TaxPreviewPage.tsx` and `TaxReturnPdfExportDialog.tsx`
- **Contents:** Intended to populate IRS Form 1040 from backend Tax Preview facts and backend-owned tax-return profile data.
- **Format:** PDF (`application/pdf`) when a native editable AcroForm engine is available.
- **Current status:** blocked/readiness MVP. The pinned official 2025 Form 1040 template and field map are present, field inspection works, and export attempts are audited, but the native editable fill engine is intentionally unavailable because FPDM cannot fill the current IRS PDF without PDF preprocessing.
- **Generated file retention:** no generated PDFs are persisted by default.
- **Current watermark:** none; no PDF is generated in the blocked MVP.

See `docs/finance/tax-return-pdf.md` for the spike result, pinned-template workflow, and production path.

### 3. Brokerage / bank statement PDFs

- **Endpoint:** `GET /api/finance/{accountId}/statements/{statementId}/pdf`
- **Controller:** `app/Http/Controllers/FileController.php` (`viewStatementPdf()`)
- **Client:** `StatementPdfButton.tsx`
- **Contents:** User-uploaded statement PDFs, returned via S3 signed URL (view + download).
- **Current watermark:** none (pass-through of the original upload).

### 4. Tax document downloads

- **Endpoint:** `GET /api/finance/tax-documents/{id}/download`
- **Controller:** `app/Http/Controllers/FinanceTool/TaxDocumentController.php` (`download()`)
- **Client:** `TaxDocumentReviewModal`, `FinanceDocumentsPage`
- **Contents:** W-2, 1099-*, K-1, K-3, broker consolidated 1099s and similar tax forms.
- **Current watermark:** none; download count is tracked server-side.

### 5. Utility bill PDFs

- **Endpoint:** `GET /api/utility-bill-tracker/accounts/{accountId}/bills/{billId}/download-pdf`
- **Controller:** `app/Http/Controllers/UtilityBillTracker/UtilityBillApiController.php` (`downloadPdf()`)
- **Client:** `UtilityBillListPage` (via `window.open()`)
- **Current watermark:** none.

### 6. Client portal file downloads

Signed-URL passthrough for files uploaded into the client-management module. All served via `app/Http/Controllers/FileController.php`.

- `GET /api/client/portal/{slug}/files/{fileId}/download`
- `GET /api/client/portal/{slug}/projects/{projectSlug}/files/{fileId}/download`
- `GET /api/client/portal/{slug}/projects/{projectSlug}/tasks/{taskId}/files/{fileId}/download`
- `GET /api/client/portal/{slug}/agreements/{agreementId}/files/{fileId}/download`
- `GET /api/finance/{accountId}/files/{fileId}/download`

**Contents:** arbitrary user-uploaded files (PDFs, docs, images, spreadsheets). **Current watermark:** none.

### 7. Invoice view (print-friendly HTML)

- **Routes:** `GET /client/portal/{slug}/invoices`, `GET /client/portal/{slug}/invoice/{invoiceId}`
- **Controller:** `ClientPortalController`
- **Format:** HTML designed for the browser print dialog (no dedicated PDF endpoint at time of writing).
- **Current watermark:** none.

### 8. GenAI import job results

- **Routes:** `GET /genai/import/jobs`, `GET /genai/import/jobs/{job_id}`
- **Controller:** `app/GenAiProcessor/Http/Controllers/GenAiImportController.php`
- **Client:** `AdminGenAiJobsPage`
- **Format:** JSON API response with parsed import results (transactions, payslip rows, etc.).
- **Current watermark:** none (metadata-only: `job_id`, `status`, `original_filename`, `error_message`).

### 9. PHR DICOM original study ZIP

- **Endpoint:** `GET /api/phr/patients/{patient}/dicom/studies/{study}/download`
- **Controller:** `app/Http/Controllers/PHR/DICOM/DicomFileController.php` (`downloadStudy()`)
- **Client:** `resources/js/phr/imaging/index.tsx`
- **Contents:** Original retained DICOM files and `DICOMDIR` for a patient imaging study, with original relative paths preserved inside the ZIP.
- **Current watermark:** none; pass-through medical imaging data is zipped without modifying source files.

## Client-side exports (browser-generated)

### 10. Transactions CSV / JSON

- **Module:** `resources/js/components/finance/transactionTable/transactionExport.ts`
- **Filenames:** `transactions_{accountId}_{selectedYear}.csv|json`
- **Columns:** Date, Type, Description, Symbol, Amount, Qty, Price, Commission, Fee, Memo.
- **Trigger:** Export buttons in the transactions table.
- **Current watermark:** none.

### 11. TXF (Tax eXchange Format) lot sales

- **Module:** `resources/js/lib/finance/txfExport.ts`
- **Trigger:** `LotAnalyzer.tsx` → `downloadTxf()`
- **Filename:** `{year}.txf` or `all.txf`
- **Format:** TXF v042 with reference numbers 321 (short-term) / 323 (long-term); includes wash-sale adjustments.
- **Current watermark:** header carries `V042` + software name + export date, but no user identity.

### 12. Stacked balance chart TSV (clipboard)

- **Module:** `resources/js/components/finance/StackedBalanceChart.tsx` (`generateTSV()`)
- **Format:** TSV copied to clipboard, suitable for pasting into a spreadsheet.
- **Current watermark:** none.

### 13. MCP API key clipboard copy

- **Module:** `resources/js/user/mcp-api-key.tsx`
- **Format:** plaintext API key via `navigator.clipboard.writeText()`.
- **Current watermark:** not applicable (secret token, must not be altered) — but copy events should still be audited.

### 14. Payslip prompt / schema clipboard copy

- **Modules:** `resources/js/components/payslip/PayslipJsonModal.tsx`, `resources/js/components/finance/ManualJsonAttachModal.tsx`
- **Format:** plaintext prompt + JSON schema.
- **Current watermark:** none (developer reference material; low sensitivity but still leaves the system).

## Summary

| # | Export | Format | Surface | Watermark today |
|---|--------|--------|---------|-----------------|
| 1 | Tax Preview workbook | XLSX | server | none |
| 2 | Tax Preview IRS PDF readiness | PDF | server | none (blocked MVP) |
| 3 | Brokerage/bank statements | PDF | server (passthrough) | none |
| 4 | Tax documents | PDF | server (passthrough) | none |
| 5 | Utility bill PDFs | PDF | server (passthrough) | none |
| 6 | Client portal files | mixed | server (passthrough) | none |
| 7 | Invoice view | HTML (print) | server | none |
| 8 | GenAI import results | JSON | server API | metadata only |
| 9 | PHR DICOM study originals | ZIP | server (proxied R2) | none |
| 10 | Transactions | CSV / JSON | browser | none |
| 11 | Lot sales | TXF | browser | filename + V042 header |
| 12 | Balance chart | TSV (clipboard) | browser | none |
| 13 | MCP API key | text (clipboard) | browser | n/a (secret) |
| 14 | Payslip schema | text (clipboard) | browser | none |

## Adding a new export

When introducing a new export surface:

1. Add it to the table above in the same PR.
2. Route structured-file generation (XLSX/CSV/PDF) through a shared watermarking helper once the watermark work lands — do not reinvent.
3. For passthrough downloads of user-uploaded PDFs, document whether re-rendering with a watermark is feasible (signed S3 URL vs. streamed through the app).
4. Record an audit entry: user ID, timestamp, export type, and identifying row/scope.
