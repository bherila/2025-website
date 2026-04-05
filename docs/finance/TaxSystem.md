# Tax System

## Overview

The tax system tracks employment entities, links them to transaction tags and payslips, and generates tax-year summaries for Schedule C (self-employment), W-2, and investment income reporting. It also tracks marriage/filing status per year.

See `/database/schema/mysql-schema.sql` for the full database schema. Relevant tables:
- `fin_employment_entity` — W-2 jobs, Schedule C businesses, and hobbies
- `fin_account_tag` — transaction tags with optional `tax_characteristic` and `employment_entity_id`
- `fin_payslip` — payslips linked to employment entities
- `users.marriage_status_by_year` — JSON column with per-year filing status

---

## Employment Entities

Employment entities represent income sources and are stored in `fin_employment_entity`.

**Model**: `app/Models/FinanceTool/FinEmploymentEntity.php`

### Entity Types

| Type | Purpose | Links To |
|------|---------|----------|
| `sch_c` | Self-employment / sole proprietorship | Tags with Schedule C tax characteristics |
| `w2` | W-2 employer | Payslips; tags with W-2 tax characteristics |
| `hobby` | Hobby income (not subject to SE tax) | Tags (optional) |

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `display_name` | string | Human-readable name shown in the UI |
| `type` | enum | `sch_c`, `w2`, or `hobby`; immutable after creation |
| `start_date` | date | When the employment/business started |
| `end_date` | date\|null | When it ended (null if current) |
| `is_current` | boolean | Whether the entity is still active |
| `ein` | string\|null | Employer Identification Number |
| `address` | text\|null | Mailing address |
| `sic_code` | integer\|null | SIC code (Schedule C only) |
| `is_spouse` | boolean | Whether this entity belongs to the spouse |
| `is_hidden` | boolean | When `true`, the entity is excluded from all selection dropdowns but remains manageable in Settings |

### `is_hidden` Behaviour

When `is_hidden` is `true` for an entity:
- The entity **is excluded** from: payslip import dropdown, payslip detail form, tag editor entity selector, and any other picker that uses `?visible_only=true`.
- The entity **remains visible** in the Settings → Employment and Self-Employment table so it can be managed (edited or un-hidden).
- Hidden entities still appear on the Tax Preview page if they have tagged transactions or payslips.

API usage:
- Default (`GET /api/finance/employment-entities`) — returns **all** entities including hidden; used by the Settings page.
- With `?visible_only=true` — returns only non-hidden entities; used by payslip/tag dropdowns.

### Relationships

- `hasMany` → `FinAccountTag` (via `employment_entity_id`) — tags with entity-specific characteristics
- `hasMany` → `FinPayslips` (via `employment_entity_id`) — payslips from W-2 employers

### Security

- A global scope automatically filters by `auth()->id()`, ensuring users only see their own entities.
- The `creating` event auto-sets `user_id` from the authenticated user and prevents cross-user creation.

---

## Tag → Employment Entity Linking

Tags link to employment entities via `employment_entity_id` on `fin_account_tag`. The applicable characteristics depend on entity type:

- **Schedule C** (`sch_c`): `business_income`, `business_returns`, `sce_*`, `scho_*`
- **W-2** (`w2`): `w2_wages`, `w2_other_comp`
- **Other** (no entity): `interest`, `ordinary_dividend`, `qualified_dividend`, `other_ordinary_income`

The Tax Preview page groups Schedule C income/expenses by entity, generating separate Schedule C sections per business.

See [Tags.md](Tags.md) for the full list of tax characteristics and helpers.

---

## Payslip → Employment Entity Linking

Payslips (`fin_payslip` table) link to W-2 employment entities via `employment_entity_id`. This enables:
- Grouping payslips by employer for W-2 reconciliation
- Tracking gross pay, taxes withheld, and deductions per employer per year

---

## Marriage Status

Marriage/filing status is stored per year as a JSON column (`marriage_status_by_year`) on the `users` table. The UI shows all years from the earliest known year through the current year, with missing years defaulting to `false` (single/unmarried). Changes to individual years do not cascade to other years.

### API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/finance/marriage-status` | Get marriage status for all years |
| `POST` | `/api/finance/marriage-status` | Set status for a specific year (`{ year, is_married }`) |

---

## Tax Preview Page

**Routes**: `GET /finance/tax-preview` (canonical), `GET /finance/schedule-c` (301 redirect)
**Component**: `resources/js/components/finance/TaxPreviewPage.tsx` (orchestrator) + `ScheduleCPreview.tsx` (Schedule C section)
**Controller**: `app/Http/Controllers/FinanceTool/FinanceScheduleCController.php`

### Sections (top to bottom)

1. **W-2 Row** — Grid layout (1/3 + 2/3):
   - Left: W-2 Income Summary from payslips
   - Right: W-2 Document Upload & Reconciliation (per employment entity, with processing status)

2. **Form 1040 Preview** — Key income lines from Form 1040 (wages, interest, dividends, Schedule C, total income)

3. **Schedule B & 1099 Row** — Grid layout (1/3 + 2/3):
   - Left: Schedule B Preview (Part I: Interest, Part II: Dividends) from confirmed 1099 documents
   - Right: 1099-INT/DIV Upload with processing status badges and "Other 1099" manual entry

4. **Federal Taxes** — Quarterly cumulative tax estimate table (Q1/Q2/Q3/Q4). Income = W-2 payslip income + Schedule C net income (income − expenses − allowable home office). Reuses the `TotalsTable` component from the Payslips page via the `extraIncome` prop.

5. **California State Taxes** — Same as Federal Taxes but for CA state brackets.

6. **Schedule C Preview** (`ScheduleCPreview` component) — Transaction-tag-based Schedule C summary:
   - Ordinary Income (interest, dividends, other)
   - W-2 income tagged via transaction tags
   - Schedule C sections per entity (income / expenses / home office)
   - **"List transactions in-line" toggle** — when enabled, Schedule C cards expand to full container width (single column) so inline transaction rows are readable
   - Cards are always single-column on mobile/small screens (< md breakpoint)
   - All years loaded at once; year selector filters display client-side
   - `onScheduleCNetIncomeChange` callback emits net Schedule C income to the parent for tax table calculations

### API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/finance/schedule-c` | Tax data grouped by characteristic and year |
| `GET` | `/api/payslips?year=YYYY` | Payslip records for the year (W-2 summary and tax tables) |

---

## Employment Entity API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/finance/employment-entities` | List all entities (including hidden) — used by Settings page |
| `GET` | `/api/finance/employment-entities?visible_only=true` | List only non-hidden entities — used by payslip/tag dropdowns |
| `POST` | `/api/finance/employment-entities` | Create a new entity (`is_hidden` supported) |
| `PUT` | `/api/finance/employment-entities/{id}` | Update an entity (`is_hidden` supported) |
| `DELETE` | `/api/finance/employment-entities/{id}` | Delete an entity |

**Controller**: `app/Http/Controllers/FinanceTool/FinanceEmploymentEntityController.php`

### Settings Page UX

- The Employment and Self-Employment table shows all entities including hidden ones.
- Hidden entities are visually dimmed and display a **Hidden** badge.
- Each row has only an **Edit** (pencil) icon — no delete icon on the row.
- The **Edit** modal includes an `is_hidden` toggle switch.
- The **Delete** button is inside the Edit modal footer (not on the table row) since deletion is uncommon. Clicking it closes the modal and opens a confirmation dialog.

---

## Data Flow Summary

```
Employment Entity (sch_c)
  └── Tags (with sce_*/scho_*/business_* tax_characteristic)
        └── Tagged Transactions → Schedule C tax preview

Employment Entity (w2)
  ├── Payslips → W-2 income summary + Federal/State quarterly tax estimates
  └── Tags (with w2_* tax_characteristic) → W-2 income summary (transaction-based)

Marriage Status (per year on users table)
  └── Filing status for tax year calculations

Non-entity Tags (interest, dividends, etc.)
  └── Tagged Transactions → Investment income summary (no entity required)
```

---

## Related Documentation

- [Tags.md](Tags.md) — Tag structure, tax characteristics, and tagging API
- [FinanceTool.md](FinanceTool.md) — Finance tool overview and navigation
- [TransactionsTable.md](TransactionsTable.md) — Transaction display and filtering
- `/database/schema/mysql-schema.sql` — Full database schema

---

## Seeder Data for Tax Preview Testing

The default `DatabaseSeeder` now runs `Database\Seeders\Finance\FinanceDemoDataSeeder` for `test@example.com`.
This includes:
- A Schedule C employment entity (`Blue Harbor Consulting`)
- A Schedule C tax-characterized tag (`sce_office_expenses`) linked to that entity
- Seeded transactions + tag mappings so Tax Preview has immediately testable data

This helps with local QA and screenshot generation for the Tax Preview and tags workflows.

---

## Tax Documents (`fin_tax_documents`)

### Overview

The `fin_tax_documents` table stores uploaded tax form PDFs (W-2, W-2c, 1099-INT, 1099-INT-C, 1099-DIV, 1099-DIV-C, 1099-MISC, K-1) for each user. Documents are stored in S3 and referenced by their path. Uploaded PDFs are automatically processed by the GenAI system to extract structured field data (e.g., W-2 box values, 1099 amounts, K-1 pass-through data).

### Table Schema

| Column | Type | Description |
|--------|------|-------------|
| `id` | PK | Auto-increment |
| `user_id` | FK → users | Owner of the document |
| `tax_year` | integer | Tax year (e.g., 2024) |
| `form_type` | enum | `w2`, `w2c`, `1099_int`, `1099_int_c`, `1099_div`, `1099_div_c`, `1099_misc`, `k1` |
| `employment_entity_id` | FK → fin_employment_entity (nullable) | Set for W-2 form types |
| `account_id` | FK → fin_accounts.acct_id (nullable) | Set for 1099/K-1 form types |
| `original_filename` | string | User's original filename |
| `stored_filename` | string | S3-stored filename with date prefix |
| `s3_path` | string | Full S3 key (`tax_docs/{userId}/{storedFilename}`) |
| `mime_type` | string | Default: `application/pdf` |
| `file_size_bytes` | integer | File size |
| `file_hash` | string | SHA-256 hash for deduplication |
| `uploaded_by_user_id` | bigint unsigned (nullable) | Who uploaded it |
| `notes` | text (nullable) | Optional notes |
| `is_reviewed` | boolean | Whether extracted data has been reviewed and confirmed by user |
| `genai_job_id` | FK → genai_import_jobs (nullable) | Linked GenAI processing job |
| `genai_status` | string (nullable) | Processing status: `pending`, `processing`, `parsed`, `failed` |
| `parsed_data` | json (nullable) | Structured data extracted from the PDF (box values). For K-1, stored as a flexible JSON blob. |
| `download_history` | json | Track who downloaded and when |
| `deleted_at` | timestamp | Soft delete timestamp |

### Model: `App\Models\Files\FileForTaxDocument`

Uses `HasFileStorage`, `SerializesDatesAsLocal`, and `SoftDeletes` traits.

Form type constants:
- `FORM_TYPES` — all valid form type strings (includes `k1`)
- `W2_FORM_TYPES` — `['w2', 'w2c']` (require `employment_entity_id`)
- `ACCOUNT_FORM_TYPES` — `['1099_int', '1099_int_c', '1099_div', '1099_div_c', '1099_misc', 'k1']` (require `account_id`)

### Controller: `App\Http\Controllers\FinanceTool\TaxDocumentController`

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/finance/tax-documents` | List documents. Optional filters: `year`, `form_type` (comma-sep), `employment_entity_id`, `account_id` |
| POST | `/api/finance/tax-documents/request-upload` | Get presigned S3 upload URL. Returns `{ upload_url, s3_key, expires_in }` |
| POST | `/api/finance/tax-documents` | Confirm upload, create DB record, dispatch GenAI job. Returns 201. |
| POST | `/api/finance/tax-documents/manual` | Create a manual entry (no PDF) with pre-filled parsed_data |
| GET | `/api/finance/tax-documents/{id}/download` | Get signed download URLs. Returns `{ view_url, download_url, filename }` |
| DELETE | `/api/finance/tax-documents/{id}` | Soft-delete document and remove from S3 |
| PUT | `/api/finance/tax-documents/{id}` | Update notes, parsed_data, is_reviewed |
| PUT | `/api/finance/tax-documents/{id}/mark-reviewed` | Mark document as reviewed (also saves notes/parsed_data) |

### Upload Flow

1. POST `/api/finance/tax-documents/request-upload` with `{ filename, content_type, file_size }` → get `{ upload_url, s3_key }`
2. PUT file bytes directly to `upload_url` (S3 presigned URL)
3. Compute SHA-256 of file using Web Crypto API
4. POST `/api/finance/tax-documents` with `{ s3_key, original_filename, form_type, tax_year, file_size_bytes, file_hash, employment_entity_id | account_id }` → 201
5. A `GenAiImportJob` is automatically created and dispatched to the `genai-imports` queue
6. The tax document's `genai_status` is set to `pending`

### S3 Key Validation

The `store` endpoint validates that the S3 key:
- Starts with `tax_docs/{userId}/` (prevents accessing other users' files)
- Contains no subdirectories (prevents path traversal)
- Has a valid filename

### GenAI Processing

When a tax document PDF is uploaded, a GenAI job (`job_type: tax_document`) is automatically dispatched. The processing flow is:

1. **Upload** → Document created with `genai_status: pending`
2. **Queue processing** → Job picked up by `genai:run-queue`, status becomes `processing`
3. **AI extraction** → Gemini API extracts structured data based on form type:
   - **W-2/W-2c**: All box values (1–20), employer/employee info, Box 12 codes, Box 14 items
   - **1099-INT**: Interest income, penalties, savings bonds, foreign tax, bond premiums
   - **1099-DIV**: Ordinary/qualified dividends, capital gains, foreign tax, liquidation distributions
   - **1099-MISC**: Rents, royalties, other income, federal tax withheld
   - **K-1 / K-3**: Full pass-through entity data (see K-1 section below)
4. **Results stored** → Parsed JSON saved to `parsed_data` column, `genai_status` → `parsed`
5. **User review** → User can view/edit extracted fields, then mark as reviewed

### Processing Status in W-2 Documents Table

The W-2 Documents table shows a combined **Review** column (replaces separate Status + Reviewed columns):
- **Disabled "Processing" button** (orange) — `genai_status` is `pending` or `processing`
- **Disabled "Failed" button** (red) — `genai_status` is `failed`
- **"Needs Review" button** — `genai_status` is `parsed` but not yet reviewed
- **"Reviewed" button** (green) — document has been reviewed and confirmed

### Review Document Modal

The Review Document modal (`TaxDocumentReviewModal`) provides:
- **Extracted Data** panel — editable fields from `parsed_data` (read-only when document is confirmed/reviewed)
- **Review Notes** — free-text notes
- **Save Changes** button — only shown when document is not yet reviewed
- **W-2 Comparison table** — compares W-2 box values against payslips calculations
  - Each "Payslips" amount is clickable → opens a **Data Source** modal showing the individual payslip rows that contributed
- **Delete button** in the footer — removes the document (disabled when reviewed)
- **Mark as Reviewed / Reopen for Review** button

### W-2 Income Summary

The **W-2 Income Summary** table (derived from payslip data) now has clickable amounts that open a **Data Source** modal showing the contributing payslip rows for each line item (wages, bonus, RSU, tax withheld, etc.).

### Payslips Filter Bug Fix

The W-2 comparison uses `getPayslipsForEntity()` which filters payslips by `employment_entity_id`. If no payslips have the entity ID set (common if payslips predate the entity linkage feature), it falls back to using ALL payslips for the year, ensuring the comparison never shows zero.

---

## K-1 / K-3 Form Support

### Overview

Schedule K-1 forms are issued by partnerships (Form 1065), S-corporations (Form 1120-S), estates (Form 1041), and trusts to report each partner's/shareholder's/beneficiary's share of income, deductions, and credits.

K-1 data is highly variable — the number of coded line items, footnotes, and supplemental statements can be extensive. For this reason, all extracted K-1 data is stored as a **flexible JSON blob** in `parsed_data`, rather than a fixed schema.

### K-1 GenAI Extraction

The `extractK1Data` tool (`TAX_DOCUMENT_K1_TOOL_NAME`) extracts:
- Entity and partner/shareholder identification (name, EIN, ownership %)
- All income/deduction boxes (Box 1: ordinary income, Box 2: rental, Box 14: SE earnings, etc.)
- Credits (coded arrays)
- Foreign transactions (Box 16) — **future Form 1116 extension point**
- AMT adjustments — **future Form 6251 extension point**
- State tax information
- Supplemental statement text

### Future Extension: Form 1116 (Foreign Tax Credit)

Box 16 (foreign transactions) from K-1 will feed into Form 1116 (Foreign Tax Credit) when that support is added. The `box16_foreign_taxes_paid`, `box16_foreign_country`, and `box16_foreign_income_category` fields in the K-1 parsed data are designed for this purpose. See comments in `GenAiJobDispatcherService::buildK1Prompt()` and `buildK1ToolDefinition()` for implementation details.

### TypeScript Type

The `FK1ParsedData` interface in `resources/js/types/finance/tax-document.ts` provides TypeScript typing for K-1 parsed data, including the index signature `[key: string]: unknown` to allow for additional AI-extracted fields.

---

## Account Documents Section

The **Account Documents** section (formerly "1099 Documents") on the Tax Preview page shows a table with one row per account and one column per document type:

| Account | 1099-INT | 1099-DIV | 1099-MISC | K-1 / K-3 |
|---------|----------|----------|-----------|-----------|
| Account A | [Upload/doc] | [Upload/doc] | [Upload/doc] | [Upload/doc] |

### Account Ordering

Accounts are sorted into two groups:
1. **Active accounts** (top) — accounts with at least one transaction in the selected year
2. **Inactive accounts** (bottom, dimmed) — accounts with no transactions in the selected year, separated by a "No transactions in YYYY" divider row

This sorting uses the `/api/finance/accounts?active_year=YYYY` endpoint, which returns an `active_account_ids` array alongside the normal account lists.

### Upload Button Style

The Upload buttons in the Account Documents table use the `ghost` variant to reduce visual clutter.

---

## Tax Preview Page Layout

The Tax Preview page (`TaxPreviewPage.tsx`) uses a structured grid layout:

### Row 1: W-2 Section
- **Left (1/3)**: W-2 Income Summary — derived from payslip data; each line item is clickable to show a Data Source modal listing contributing payslips
- **Right (2/3)**: W-2 Documents — per-entity document management with combined Review column

### Row 2: Form 1040 Preview
- **Full width**: Shows key 1040 lines (Line 1a: W-2 wages, Line 2b: taxable interest, Line 3b: ordinary dividends, Line 8: Schedule C income, Line 9: total income)

### Row 3: Schedule B & Account Documents Section
- **Left (1/3)**: Schedule B Preview — Interest (Part I) and Dividends (Part II) totals from confirmed 1099 documents
- **Right (2/3)**: Account Documents — 1099-INT/DIV/MISC/K-1 document management

### Remaining Sections
- Federal Taxes (quarterly estimates)
- California State Taxes (quarterly estimates)
- Schedule C Preview (per-entity income/expense detail)

### Frontend Components

- **`TaxDocumentsSection`** (`TaxDocumentsSection.tsx`) — W-2/W-2c documents grouped by employment entity. Combined Review column. Delete moved to Review modal.
- **`TaxDocumentReviewModal`** (`TaxDocumentReviewModal.tsx`) — Document review with editable extracted data (read-only when confirmed), W-2 vs. payslip comparison with clickable Data Source links, and Delete button in footer.
- **`TaxDocuments1099Section`** (`TaxDocuments1099Section.tsx`) — "Account Documents" section for 1099/K-1 forms. Ghost-style upload buttons. Accounts without transactions appear at the bottom in dimmed style.

### Shared Types

TypeScript types are defined in `resources/js/types/finance/tax-document.ts`:
- `TaxDocument` interface — API response shape
- `EmploymentEntity` interface
- `W2ParsedData`, `F1099IntParsedData`, `F1099DivParsedData`, `F1099MiscParsedData`, `FK1ParsedData` — per-form parsed data interfaces
- `FORM_TYPE_LABELS` — display labels for form types (`k1` → `'K-1 / K-3'`)
- `W2_FORM_TYPES`, `ACCOUNT_FORM_TYPES_1099` — form type groupings (includes `k1`)
