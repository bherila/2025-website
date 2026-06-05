# Tax System

## Overview

The tax system tracks employment entities, links them to transaction tags and payslips, and generates tax-year summaries for Schedule C (self-employment), W-2, and investment income reporting. It also tracks marriage/filing status per year.

See `/database/schema/mysql-schema.sql` for the full database schema. Relevant tables:
- `fin_employment_entity` — W-2 jobs, Schedule C businesses, and hobbies
- `fin_account_tag` — transaction tags with optional `tax_characteristic` and `employment_entity_id`
- `fin_payslip` — payslips linked to employment entities
- `users.marriage_status_by_year` — JSON column with per-year filing status
- `fin_user_tax_states` — per-year list of states the user files in (drives which state tax tables render in Tax Estimate)
- `fin_user_deductions` — per-year user-entered Schedule A deductions (property tax, mortgage interest, charitable, etc.)

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

See [tags.md](tags.md) for the full list of tax characteristics and helpers.

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

**Route**: `GET /finance/tax-preview` (canonical), `GET /finance/schedule-c` (301 redirect)
**Controller**: `app/Http/Controllers/Finance/TaxPreviewController.php` (shell preload only)
**API Controller**: `app/Http/Controllers/Finance/TaxPreviewDataController.php`
**Services**: `app/Services/Finance/TaxPreviewDataService.php`, `app/Services/Finance/ScheduleCSummaryService.php`, `app/Services/Finance/TaxPreviewFactsService.php`, `app/Services/Finance/TaxPreviewFacts/Builders/*`
**Components**: `resources/js/components/finance/TaxPreviewPage.tsx` + `TaxPreviewContext.tsx`

### Data Loading Architecture

Year changes are **full page navigations** (`window.location.href = ...`). Blade now preloads only a lightweight shell payload via `<script type="application/json" id="tax-preview-data">`:

**Preloaded shell data** (safe to embed in Blade):
- `year`
- `availableYears`

**Mutable tax-preview dataset** (owned by React context and fetched from API):
- Payslips for the selected year
- Pending review count
- W-2 documents
- Account documents (1099 + K-1)
- Schedule C data
- Employment entities
- Accounts + active-account IDs
- Backend `taxFacts` source lines for Schedule 1, Schedule A, Schedule B, Schedule D, Schedule E, Form 1116, Form 4952, Form 8949, and Form 8960 debug paths

The React mini-SPA is wrapped in `TaxPreviewProvider`, which loads `/api/finance/tax-preview-data?year=YYYY`, exposes getters/setters for shared data, stores backend `taxFacts`, derives reviewed document subsets, computes 1099 totals and Schedule C net income, and provides `refreshAll()` for mutation sync after upload/review/edit actions. Tax totals are still rendered from the client-side calculation system; `taxFacts` is an audit/debug contract first.

### Backend Tax Facts

`TaxPreviewFactsService` loads the tax-year context, partitions documents, and delegates source-line calculations to per-slice builders under `app/Services/Finance/TaxPreviewFacts/Builders/`. The assembled facts are returned in the `taxFacts` key on `/api/finance/tax-preview-data`, MCP `get_tax_preview`, and the read-only CLI command:

```bash
php artisan finance:tax-preview-facts --user=1 --year=2025 --slice=schedule1 --format=toon
```

The current pilot covers the highest-value debug paths:

| Slice | Lines | Source behavior |
|-------|-------|-----------------|
| `schedule1` | Schedule 1 line 5 | Reviewed K-1 ordinary/rental/partnership-statement sources that flow through Schedule E to Schedule 1 line 5. Form 4952 investment-interest items are excluded from this line. |
| `schedule1` | Schedule 1 line 8 family / line 9 / line 10 | 1099-MISC sources, including unreviewed parsed sources. Unrouted 1099-MISC defaults to Schedule 1 line 8z unless explicitly routed to Schedule C or Schedule E. Explicit Schedule 1 subroutes are bucketed into line 8b, 8h, 8i, or 8z; `line9TotalOtherIncome` is the sum of those line 8 buckets, not a synonym for line 8z. |
| `scheduleB` | Schedule B line 1 / line 5 / line 6 | 1099-INT Box 1 and Box 3, 1099-DIV Box 1a and Box 1b, and K-1 Box 5 / 6a / 6b sources are itemized with review metadata. Direct 1099 interest plus direct 1099 ordinary dividends feed the Form 4952 line 4a Schedule B bucket. |
| `form4952` | Form 4952 line 1 / line 4a / line 4c / line 5 / line 8 | Investment-interest sources are separated from excluded investment-expense debug sources. Form 4952 gross investment income composes Schedule B direct interest/dividends with the K-1 Box 20A gross-investment-income bucket, exposes line 4c after subtracting qualified dividends, and keeps line 5 investment expenses distinct so Schedule A line 9 and Schedule E exclusions can be debugged without reading React state. |
| `scheduleA` | Schedule A lines 5a/5b/5c/7/8a/9/11/12/16/17 | W-2 Box 17 state tax, user-entered itemized deductions, K-1 Box 13L portfolio deductions, and Form 4952 investment interest are exposed with source metadata. Line 5a selects the larger of state/local income tax or general sales tax before adding real estate tax, uses the current 2025+ SALT cap, and exposes gross versus deductible investment-interest totals so Form 4952 limitations are auditable. The builder returns both single and MFJ standard-deduction comparisons because filing status is not yet backend-owned by this fact slice. |
| `scheduleE` | Schedule E Part I/II partnership and rental buckets | Explicitly routed Schedule E 1099-MISC sources and K-1 Boxes 1/2/3/4/5/11ZZ/13ZZ are separated into passive, nonpassive, and trader-fund NII totals. Trader-fund detection mirrors the existing K-1 utility logic so Form 8960 can reuse the same backend source facts. |
| `form8949` | Form 8949 rows / Schedule D rollups / wash sales | `CapitalGainsTaxReportService` loads account-lot transactions, runs the PHP `WashSaleAnalysisEngine`, and feeds `Form8949ReportBuilder` so API, tax facts, and future XLSX exports share one canonical Form 8949 path. Imported 1099-B copies are excluded when matched account lots exist to avoid double-counting. |
| `scheduleD` | Schedule D lines 1a-16 / line 21 | Schedule D facts combine Form 8949 rollups with K-1 Box 8/9/10, Box 11C Form 6781 60/40 allocations, Box 11S character routing, and 1099-DIV Box 2a capital-gain distributions. Ambiguous Box 11S rows are exposed as `needs_review` sources instead of being silently routed. |
| `form1116` | Form 1116 passive/general income, line 4b, and foreign tax | K-1/K-3 passive and general category income, sourced-by-partner election state, K-1 Box 21 / K-3 foreign tax, and 1099-DIV/1099-INT foreign tax are exposed. 1099-DIV foreign-source income is estimated from Box 7 at the same default 15% withholding rate as the React calculator and is marked `needs_review` because the gross foreign-source income is inferred. K-3 Part II line 24 column (f) "sourced-by-partner" amounts default to **U.S.-source** (excluded from foreign-source passive income on Form 1116) because the typical taxpayer is a U.S. person and partner-level sourcing follows the partner's residency. The `k3Elections.sourcedByPartnerAsUSSource` flag is only required to flip when the partner is *not* a U.S. person or is subject to a treaty that resources the income as foreign — in which case the column (f) amount is treated as foreign-source passive income. |
| `form8960` | Form 8960 NII components | Schedule B interest/dividends, positive Schedule D net capital gains, Schedule E passive income, trader-fund nonpassive NII, and Form 4952 investment-interest deductions are composed into backend NII facts. MAGI-dependent NIIT tax is intentionally nullable until MAGI and filing status are moved into backend-owned facts. |

Each `TaxFactSource` carries review metadata:

| Field | Meaning |
|-------|---------|
| `isReviewed` | `false` when the amount is calculated from an unreviewed document or account-link entry |
| `reviewStatus` | `reviewed` or `needs_review`; UI should treat `needs_review` as an estimated/yellow value |
| `reviewAction` | Human-readable pointer to the document/link that should be reviewed |

Totals intentionally include `needs_review` sources so the preview can estimate the return while showing exactly which source lines still need review in supporting-details modals.

Maintainability rule: the fact layer is audit-first and slice-first. Keep DTOs in `app/Services/Finance/TaxPreviewFacts/Data/`; keep form collection/calculation logic in `app/Services/Finance/TaxPreviewFacts/Builders/{Slice}FactsBuilder.php`; keep shared parsed-data/source helpers in `TaxPreviewFactBuilder`; and keep `TaxPreviewFactsService` as orchestration/compatibility glue. New forms should add or extend a builder instead of adding private calculation methods to `TaxPreviewFactsService`.

Money math in backend tax facts should route through `App\Services\Finance\MoneyMath` or the builder helpers that wrap it. The fact layer stores/output dollars as floats for API compatibility, but sums, differences, and 60/40 allocations should be rounded through integer cents so source totals reconcile predictably to filed-return line amounts. `TaxFactSource` routing/source-type values should be produced from the PHP backed enums and serialized as strings; the frontend contract remains string-based.

Frontend consumers import the generated DTO contracts from `resources/js/types/generated/tax-preview-facts.ts`. The PHP DTOs live in `app/Services/Finance/TaxPreviewFacts/Data/` and are regenerated with:

```bash
php artisan typescript:transform
```

Tax document update/review/account-link routing endpoints preserve their legacy response shape by default. Callers that pass `?include_tax_facts=1` receive `{ document, taxFacts }` or `{ link, taxFacts }`, allowing React to merge the changed document/link and replace only the fact patch instead of reloading the whole Tax Preview dataset. When a source moves from `needs_review` to `reviewed`, replacing `taxFacts` is enough for supporting details and future line coloring to update without a full dataset refresh.

The fact DTO shape is source-line oriented on purpose: XLSX builders can reuse the same backend-auditable facts later for workbook detail rows and cross-checks. Capital gains are now shared through the PHP `CapitalGainsTaxReportService`; Schedule A, Schedule E, Form 1116, and Form 8960 now have backend source facts as well. Avoid adding new duplicated tax math to React-only analyzers unless it is purely UI exploration.

### Filed Return Reconciliation

Use `finance:tax-reconcile` to compare backend `taxFacts` against a CPA-prepared or filed-return expected-line fixture:

```bash
php artisan finance:tax-reconcile --user=1 --year=2025 --fixture=tests/Fixtures/Finance/tax-return-reconciliations/2025-cpa-anonymized.json --format=json
```

Committed fixtures must be anonymized: line numbers, labels, expected amounts, fact paths, precision, and notes are OK; raw documents, taxpayer names, payer names, SSNs, account names, and account numbers are not. Keep private source artifacts in ignored `training_data/tax_reconciliation/` when they help local debugging. The default 2025 fixture currently verifies Schedule 1, Schedule B, and Form 4952 line values against the backend fact layer; add Schedule D/Form 8949 lines as filed-return fixtures become available.

### Dock Form Structure

The dock form registry is defined in `resources/js/components/finance/tax-preview/registry.tsx`. Some preview components still use source-navigation IDs from `resources/js/components/finance/tax-tab-ids.ts`; dock adapters translate those IDs to form IDs.

```
Home | Documents | Tax Estimate | Action Items | Schedules | Forms | Worksheets
```

| Dock entry | Component(s) | Description |
|-----|---|---|
| Home | `DockHomeView` | Pinned, recent, app, form, and worksheet launchers |
| Documents | `TaxDocuments1099Section`, `TaxDocumentsSection` | Account and W-2 document management with review actions |
| Schedule B / Form 4952 | `ScheduleBPreview` + `Form4952Preview` | Schedule B (interest/dividends) + Form 4952 (investment interest) |
| Schedule A | `ScheduleAPreview` + `UserDeductionsSection` | Itemized deductions — investment interest (K-1, 1099, short dividends) + user-entered SALT/mortgage/charitable via `fin_user_deductions` |
| Schedule 1 | `Schedule1Preview` | Part I (additional income: Schedule C line 3, Schedule E line 5, 1099-MISC line 8z → line 10 total) + Part II (adjustments: deductible SE tax line 15, placeholders for HSA/health insurance/IRA/student loan → line 26 total). Feeds Form 1040 lines 8 and 10. |
| Schedule 2 | `AdditionalTaxesPreview` (per-section) | Additional taxes (AMT line 1, Form 8959 Additional Medicare, Form 8960 NIIT) — surfaced both here and on the Tax Estimate tab. |
| Schedule 3 | `Schedule3Preview` | Additional credits and payments. |
| Schedule E | `ScheduleEPreview` | Partnership/S-corp income from K-1 — Box 1 ordinary, Box 2/3 rental, Box 4 guaranteed payments, trader-fund Box 11ZZ ordinary items, and Box 13ZZ other deductions |
| Schedule SE | `ScheduleSEPreview` | Self-employment tax computation from K-1 Box 14A/14C + Schedule C |
| Capital Gains | `ScheduleDPreview` | Form 6781 + Schedule D, including K-1 Box 11S non-portfolio capital gain/loss when ST/LT character is known |
| Form 1116 | `Form1116Preview` | Passive foreign tax credit |
| Form 6251 | `Form6251Preview` | Alternative minimum tax computation |
| Form 8582 | `Form8582Preview` | Passive activity loss limitations with per-activity breakdown and carryforward persistence |
| Form 8995 | `Form8995Preview` | Sec. 199A QBI deduction — per-partnership breakdown, threshold check, estimated deduction |
| Schedule C | `ScheduleCTab` | Self-employment income/expenses + Form 8829 home office |
| Tax Estimate | `TaxEstimateHeader`, `AdditionalTaxesPreview`, `Form1040Preview`, `TotalsTable` | Additional taxes (Schedule 2), Form 1040 preview, federal/state tax tables, and estimated tax payments |
| Action Items | `ActionItemsTab` | Resolved/outstanding alerts |

**Short dividend integration:** `TaxPreviewContext` fetches transactions for all active accounts on load, runs `analyzeShortDividends()`, and exposes `shortDividendSummary` on the context. `Form4952Preview` receives `shortDividendDeduction` (the >45-day bucket total) as investment interest expense. `ScheduleAPreview` renders both the K-1/1099 sources and the short dividend breakdown in one place. See [lot-analyzer.md](lot-analyzer.md#short-dividend-analysis) for details.

### Trader-Fund K-1 Processing

For tax year 2025 trader-fund K-1s, the preview treats attached statement detail as authoritative when the face-page box is an aggregate:

- Box 11 code S is non-portfolio capital gain/loss. Each sub-line routes to Schedule D line 5 when classified short-term and line 12 when classified long-term.
- Box 11S lines with missing or mixed ST/LT wording are not routed by default. They surface as unclassified Schedule D rows and require the K-1 review modal's Short-term / Long-term setting before inclusion.
- All-in-One K-1 destination cells expose those unclassified rows as an actionable footnote review control. The control aggregates contributing source boxes/codes and captured notes across K-1s, opens `K1CodesModal` for coded-row classification, and shows the routed destination after refreshed tax facts include the resolved source.
- Box 11 code ZZ trader-fund items such as Section 988 FX, swap income/loss, and PFIC mark-to-market are ordinary income/loss on Schedule E Part II nonpassive, not Schedule D.
- Box 13 code H investment interest runs through Form 4952 first. For trader-fund supporting-statement footnotes that direct Schedule E treatment, only the Form 4952-allowed portion reduces Schedule E Part II nonpassive income; any disallowed amount remains a Form 4952 carryforward.
- Box 13 code ZZ trader, management, administrative, and similar statement deductions reduce Schedule E Part II nonpassive income.
- Box 20 code AJ is Form 461 / §461(l) support only. It is exported and displayed as an audit disclosure, but it is not separately deducted.
- Form 8960 includes ordinary trader-fund Schedule E items as NII when statement notes identify them as trading in financial instruments/commodities.
- K-1 code values and flat K-1 money fields are parsed through the shared `currency.js` helper so commas, currency symbols, signs, and accounting parentheses are handled consistently.
- GenAI extraction normalizes code casing/whitespace server-side and may set `character: "short" | "long"` on Box 11S sub-lines only when the supporting statement identifies the exact character.

Inline tooltips in the K-1 code modal, Schedule D, and Schedule E explain the routing where users commonly need to validate statement treatment.

Use `php artisan finance:k1-codes --year=2025 --account=<acct_id> --box=11 --code=S --format=json` to audit the trader-fund rows. In typical trader-fund data, Box 11S does not store explicit `character` values, but the command resolves `short`/`long` from the supporting-statement notes and shows Schedule D line 5 / line 12 destinations.

### Schedule C Tab

`ScheduleCTab` (`resources/js/components/finance/ScheduleCTab.tsx`) renders:
- Per-entity Schedule C income/expense summaries using `FormBlock`/`FormLine` primitives
- Net profit/loss calculation
- **Form 8829 — Home Office Deduction**: office/home area inputs, business-use percentage, expense breakdown by Form 8829 line, income limitation, carry-forward
- **Simplified Method Comparison**: side-by-side comparison of simplified ($5/sqft, max $1,500) vs. regular method

`ScheduleCPreview` (`resources/js/components/finance/ScheduleCPreview.tsx`) still exports the shared Schedule C calculation utilities (`computeScheduleCNetIncome`, `computeHomeOfficeCalcs`) used by the Tax Preview context.

### API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/finance/tax-preview-data?year=YYYY` | Consolidated mutable Tax Preview dataset for the React context |
| `POST` | `/api/finance/tax-preview/export-xlsx` | Server-generated Tax Preview XLSX export. Defaults to the full backend fact workbook; accepts optional normalized K-1/K-3 grid sheets for append or scoped grid-only exports. |
| `GET` | `/api/finance/schedule-c` | Tax data grouped by characteristic and year |
| `GET` | `/api/payslips?year=YYYY` | Payslip records for the year (still available for other pages) |
| `GET` | `/api/finance/tax-documents` | Tax documents with various filters (year, form_type, is_reviewed) |
| `PUT` | `/api/finance/tax-documents/{id}?include_tax_facts=1` | Update a document and optionally return `{ document, taxFacts }` |
| `PUT` | `/api/finance/tax-documents/{id}/mark-reviewed?include_tax_facts=1` | Mark reviewed and optionally return `{ document, taxFacts }` |
| `PATCH` | `/api/finance/tax-documents/{id}/accounts/{linkId}?include_tax_facts=1` | Update an account-link routing/review state and optionally return `{ link, taxFacts }` |

The XLSX export request accepts `scope: "full" | "k1-all-in-one" | "k3-all-in-one"` with `full` as the default. `full` exports the existing backend fact workbook and appends any supplied normalized `grids`; the Tax Preview dock supplies All K-1s and All K-3s grids from the React comparison view models when reviewed K-1/K-3 data exists. Scoped K-1/K-3 exports skip fact sheets and include only matching normalized grid sheets, which powers the per-view **Download XLSX** buttons. Grid sheets carry `name`, optional sheet `scope`, `columns` (`key`, `label`, optional `width`, optional `format: "currency" | "number" | "percent" | "text"`), and `rows` with `kind`, optional `label`, and `cells` keyed by column key. Cell values are limited to strings, numbers, or null; numeric cells default to currency formatting unless a column format hint says otherwise.

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
        └── Tagged Transactions → Schedule C tab + Form 8829 home office

Employment Entity (w2)
  ├── Payslips → W-2 income summary + Federal/State quarterly tax estimates
  └── Tags (with w2_* tax_characteristic) → W-2 income summary (transaction-based)

Tax Documents (W-2, 1099, K-1)
  └── GenAI extraction → parsed_data → Overview/Schedules/Capital Gains/Form 1116 tabs

Marriage Status (per year on users table)
  └── Filing status for tax year calculations

Non-entity Tags (interest, dividends, etc.)
  └── Tagged Transactions → Investment income summary (no entity required)
```

---

## Related Documentation

- [tags.md](tags.md) — Tag structure, tax characteristics, and tagging API
- [overview.md](overview.md) — Finance tool overview and navigation
- [transactions-table.md](transactions-table.md) — Transaction display and filtering
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

The `fin_tax_documents` table stores uploaded tax form PDFs (W-2, W-2c, 1099-INT, 1099-INT-C, 1099-DIV, 1099-DIV-C, 1099-MISC, 1099-NEC, 1099-R, 1099-B, Broker Consolidated 1099, K-1, Form 1116) for each user. Documents are stored in S3 and referenced by their path. Uploaded PDFs are automatically processed by the GenAI system to extract structured field data.

Consolidated brokerage 1099s (form_type `broker_1099`) contain multiple form types (1099-DIV, 1099-INT, 1099-MISC, 1099-B) for one or more accounts within the same PDF. These are processed via the unified `document_extract` job type, which creates one `fin_document_accounts` row per detected form/account combination. For 1099-B entries the AI also extracts individual transaction lots, which are automatically upserted into `fin_account_lots` and linked to matching native `fin_account_line_items` buy/sell rows when those transactions already exist. Wealthfront 1099-B lots can also be parsed directly from the PDF by `finance:lots-import`, using the PHP PDF parser instead of an external `pdftotext` binary. The import does not create synthetic 1099-B sell line items.

### Table Schema

| Column | Type | Description |
|--------|------|-------------|
| `id` | PK | Auto-increment |
| `user_id` | FK → users | Owner of the document |
| `tax_year` | integer | Tax year (e.g., 2024) |
| `form_type` | TEXT NOT NULL | `w2`, `w2c`, `1099_int`, `1099_int_c`, `1099_div`, `1099_div_c`, `1099_misc`, `1099_nec`, `1099_r`, `1099_b`, `broker_1099`, `k1`, `1116` |
| `employment_entity_id` | FK → fin_employment_entity (nullable) | Set for W-2 form types |
| `account_id` | FK → fin_accounts.acct_id (nullable) | **Legacy** — kept for backward compat; new code uses `fin_document_accounts` join table |
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
| `parsed_data` | json (nullable) | Structured data extracted from the PDF. Single-form docs: flat object. `broker_1099`: array of `MultiAccountParsedEntry` objects. |
| `download_history` | json | Track who downloaded and when |

### Account Links Table (`fin_document_accounts`)

The canonical source for document–account associations. One row per (document, account, form_type) tuple.

| Column | Type | Description |
|--------|------|-------------|
| `id` | PK | Auto-increment |
| `document_id` | FK → fin_documents (CASCADE DELETE) | Parent imported document |
| `account_id` | FK → fin_accounts.acct_id (nullable, SET NULL) | Matched account (null if unresolved) |
| `form_type` | TEXT NOT NULL | Specific form type for this account (e.g., `1099_div`) |
| `tax_year` | integer | Denormalized for query efficiency |
| `ai_identifier` | varchar(100, nullable) | AI-detected account identifier (e.g., last-4 digits) |
| `ai_account_name` | varchar(255, nullable) | AI-detected account name from the PDF |
| `is_reviewed` | boolean (default false) | Per-account review state |
| `notes` | text (nullable) | Per-account notes |

**Key design decisions:**
- All new writes go to the join table; `fin_tax_documents.account_id` is not read or written by new code.
- For single-account uploads (`store()`, `storeManual()`), one join row is created automatically.
- For multi-account imports, the `document_extract` GenAI job creates one row per detected form/account combination.
- `is_reviewed` and `notes` live on the join row because review is per-account, not per-document.
- Write-through: `markReviewed()` and `update()` propagate `is_reviewed`/`notes` to all join rows for consistency.
- When the last join row for a document is deleted, the parent document is also hard-deleted and S3 cleanup is queued.

**Model:** `App\Models\FinanceTool\FinDocumentAccount`

### Model: `App\Models\Files\FileForTaxDocument`

Uses `HasFileStorage` and `SerializesDatesAsLocal` traits. Records are **hard-deleted** (no soft-delete). The `booted()` deleting event dispatches `DeleteS3Object` to remove the S3 file asynchronously when a record is deleted via Eloquent. Bulk deletes (`Model::where()->delete()`) bypass Eloquent events and must dispatch `DeleteS3Object` manually.

Form type constants:
- `FORM_TYPES` — all valid form type strings
- `W2_FORM_TYPES` — `['w2', 'w2c']` (require `employment_entity_id`)
- `ACCOUNT_FORM_TYPES` — `['1099_int', '1099_int_c', '1099_div', '1099_div_c', '1099_misc', '1099_nec', '1099_r', '1099_b', 'broker_1099', 'k1', '1116']` (require `account_id`)

### Controller: `App\Http\Controllers\FinanceTool\TaxDocumentController`

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/finance/tax-documents` | List documents. Filters: `year`, `form_type` (comma-sep), `employment_entity_id`, `account_id` (queries via join table) |
| POST | `/api/finance/tax-documents/request-upload` | Get presigned S3 upload URL. Returns `{ upload_url, s3_key, expires_in }` |
| POST | `/api/finance/tax-documents` | Confirm single-account upload, create DB record + join row, dispatch GenAI job. Returns 201. |
| POST | `/api/finance/tax-documents/multi-account` | Upload consolidated broker PDF. No `account_id` required — accounts matched after AI parsing. |
| POST | `/api/finance/tax-documents/manual` | Create a manual entry (no PDF) with pre-filled parsed_data |
| GET | `/api/finance/tax-documents/{id}` | Get single document with account links (for polling during multi-account import) |
| GET | `/api/finance/tax-documents/{id}/download` | Get signed download URLs. Returns `{ view_url, download_url, filename }` |
| DELETE | `/api/finance/tax-documents/{id}` | Delete document and remove from S3 |
| PUT | `/api/finance/tax-documents/{id}` | Update notes, parsed_data, is_reviewed (writes through to join rows) |
| PUT | `/api/finance/tax-documents/{id}/mark-reviewed` | Mark document as reviewed (writes through to all join rows) |
| POST | `/api/finance/tax-documents/{id}/accounts` | Replace all account links atomically (for multi-account confirm) |
| PATCH | `/api/finance/tax-documents/{id}/accounts/{linkId}` | Update single link (assign account, mark reviewed, add notes) |
| DELETE | `/api/finance/tax-documents/{id}/accounts/{linkId}` | Delete single link; deletes parent when last link removed |

### Upload Flow

#### Single-Account Upload
1. POST `/api/finance/tax-documents/request-upload` with `{ filename, content_type, file_size }` → get `{ upload_url, s3_key }`
2. PUT file bytes directly to `upload_url` (S3 presigned URL)
3. Compute SHA-256 of file using Web Crypto API
4. POST `/api/finance/tax-documents` with `{ s3_key, original_filename, form_type, tax_year, file_size_bytes, file_hash, employment_entity_id | account_id }` → 201
5. One `fin_document_accounts` row is created for account-based form types
6. A `GenAiImportJob` (`job_type: document_extract`) is dispatched with `document_kind: tax_form`; `genai_status` → `pending`

#### Multi-Account Upload (Consolidated Broker 1099)
1. Same S3 upload steps (1–3 above)
2. POST `/api/finance/tax-documents/multi-account` with `{ s3_key, original_filename, tax_year, file_size_bytes, file_hash, context_accounts }` → 201
3. `form_type` is always `broker_1099`; no `account_id` required at upload time
4. GenAI job (`job_type: document_extract`) is dispatched with `document_kind: tax_form` and account context hints
5. AI returns a JSON array of `{ account_identifier, account_name, form_type, tax_year, parsed_data }` entries
6. Server-side account matching: exact match → last-4 suffix → name word-overlap → null (manual assignment)
7. One `fin_document_accounts` row created per detected form/account pair; unmatched entries have `account_id = null`
8. Frontend polls `GET /api/finance/tax-documents/{id}` until `genai_status === 'parsed'`
9. User reviews/corrects account assignments in the unified document import flow, then confirms via `POST .../accounts`

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
   - **1099-NEC**: Nonemployee compensation, federal tax withheld
   - **1099-R**: Retirement/pension distributions, taxable amount, distribution codes
   - **K-1 / K-3**: Full pass-through entity data (see K-1 section below)
4. **Results stored** → Parsed JSON saved to `parsed_data` column, `genai_status` → `parsed`
5. **User review** → User can view/edit extracted fields, then mark as reviewed

### Processing Status in W-2 Documents Table

The W-2 Documents table shows a combined **Review** column (replaces separate Status + Reviewed columns):
- **"Processing" button** (orange) — `genai_status` is `pending` or `processing`
  - For **K-1 documents only**: the button is **clickable** and opens the review modal (to allow deletion if processing is stuck)
  - For other document types: the button is **disabled** 
- **Disabled "Failed" button** (red) — `genai_status` is `failed`
- **"Needs Review" button** — `genai_status` is `parsed` but not yet reviewed
- **"Reviewed" button** (green) — document has been reviewed and confirmed

### Review Document Modal

The Review Document modal (`TaxDocumentReviewModal`) provides:
- **Extracted Data** panel — editable fields from `parsed_data` (read-only when confirmed/reviewed)
- **Review Notes** — free-text notes
- **Save Changes** button — only shown when document is not yet reviewed
- **W-2 Comparison table** — compares W-2 box values against payslips calculations
  - Each "Payslips" amount is clickable → opens a **Data Source** modal showing the individual payslip rows that contributed
- **Edit JSON button** (pencil icon) in the footer — opens `ManualJsonAttachModal` in edit mode
- **Delete button** in the footer — removes the document (disabled when reviewed)
- **Mark as Reviewed / Reopen for Review** button

#### Per-Link Review (Multi-Account Documents)

For `broker_1099` documents with multiple account links, the modal accepts an optional `accountLink` prop:
- **Header** shows the account name and AI-detected identifier instead of the parent document's info
- **Extracted Data** shows only the matching entry from the parent's `parsed_data` array (matched by `ai_identifier` + `form_type`)
- **Review state** uses the per-link `is_reviewed` instead of the parent's
- **Mark as Reviewed** PATCHes the individual link and persists edited data back into the parent's array

Review state is owned by the pages that launch `TaxDocumentReviewModal`; unified document intake starts from `FinanceDocumentsPage`.

Matching and iteration utilities live in `resources/js/lib/finance/taxDocumentUtils.ts`:
- `findMatchingLink()` / `findMatchingEntry()` — correlate links ↔ parsed_data entries
- `extractLinkParsedData()` / `patchLinkParsedDataInArray()` — read/write per-entry data
- `iterateReviewedBrokerEntries()` — generator for iterating reviewed entries with their links
- `hasReviewedContent()` — checks if a document has any reviewed content (parent or per-link)

### JSON-First Upload Flow

Instead of uploading a PDF and waiting for AI extraction, users can supply pre-parsed JSON before uploading the file:

1. In the **Upload Document** modal, click **"Attach JSON from LLM"**
2. Paste or write JSON in the editor — the modal validates it against the schema for the selected form type
3. Click **"Attach JSON"** — the JSON is stored locally in the upload dialog (no API call yet); a green indicator shows "JSON attached — upload the PDF to complete"
4. Select the PDF file and click **Upload**
5. The upload API (`POST /api/finance/tax-documents`) receives both the file and `parsed_data`. The backend sets `genai_status = 'parsed'` and skips AI extraction entirely

This flow is ideal for K-1 / K-3 documents where an LLM prompt is used externally.

To remove the attached JSON before uploading, click the **✕** next to the green indicator.

### W-2 Income Summary

The **W-2 Income Summary** table (derived from payslip data) now has clickable amounts that open a **Data Source** modal showing the contributing payslip rows for each line item (wages, bonus, RSU, tax withheld, etc.).

### Payslips Filter Bug Fix

The W-2 comparison uses `getPayslipsForEntity()` which filters payslips by `employment_entity_id`. If no payslips have the entity ID set (common if payslips predate the entity linkage feature), it falls back to using ALL payslips for the year, ensuring the comparison never shows zero.

---

## K-1 / K-3 Form Support

### Overview

Schedule K-1 forms are issued by partnerships (Form 1065), S-corporations (Form 1120-S), estates (Form 1041), and trusts to report each partner's/shareholder's/beneficiary's share of income, deductions, and credits.

All K-1 data is stored as a structured JSON blob in `parsed_data` using **schema version "2026.1"** (`FK1StructuredData`).

### Structured Data Format (schemaVersion "2026.1")

```json
{
  "schemaVersion": "2026.1",
  "formType": "K-1-1065",
  "pages": 3,
  "fields": {
    "A": { "value": "12-3456789", "confidence": 0.98 },
    "D": { "value": "true",       "confidence": 0.92 },
    "1": { "value": "15000.00",   "confidence": 0.97 }
  },
  "codes": {
    "11": [{ "code": "A", "value": "150.00", "notes": "", "confidence": 0.90 }],
    "13": [{ "code": "G", "value": "200.00", "notes": "" }]
  },
  "k3": {
    "sections": [
      { "sectionId": "K3-1", "title": "Foreign Source Income", "data": {}, "notes": "" }
    ]
  },
  "raw_text": "...",
  "warnings": [],
  "extraction": {
    "model": "gemini",
    "version": "2026.1",
    "timestamp": "2026-04-05T19:30:00Z",
    "source": "ai"
  },
  "createdAt": "2026-04-05T19:30:00Z"
}
```

- **`fields`** — all flat boxes (A–O, 1–10, 12) keyed by box identifier
- **`codes`** — coded boxes (11, 13–20) keyed by box number; each is an array of `{ code, value, notes }`
- **`k3.sections`** — Schedule K-3 sections (foreign source income reporting)
- **`extraction`** — server-stamped AI provenance metadata
- **`manualOverride`** — when `true` on a field/code item, re-extraction will not overwrite it

### K-1 Code Organization

All K-1 specific TypeScript code lives in two layers:

**Data types** (`resources/js/types/finance/k1-data.ts`) — no component dependencies:

| Export | Purpose |
|--------|---------|
| `FK1StructuredData` | Canonical structured format (schemaVersion "2026.1") |
| `K1FieldValue`, `K1CodeItem`, `K3Section`, `K1ExtractionInfo` | Sub-types |
| `isFK1StructuredData(data)` | Type guard: detects new-format documents |

**UI components** (`resources/js/components/finance/k1/`):

| File | Purpose |
|------|---------|
| `k1-types.ts` | Re-exports data types + adds UI spec types (`K1FieldSpec`, `K1FieldType`) |
| `k1-spec.ts` | `K1_SPEC` array — all A–O and 1–20 field definitions; drives generic rendering |
| `k1-codes.ts` | Code definitions for boxes 11, 13–20 (from IRS instructions) |
| `K1CodesModal.tsx` | Sub-modal for viewing / editing coded items on a single box |
| `K1ReviewPanel.tsx` | Spec-driven two-panel K-1 review/edit UI (left: identification, right: financial) |
| `index.ts` | Barrel exports |

### K-1 GenAI Extraction

The `extractK1Data` tool (`TAX_DOCUMENT_K1_TOOL_NAME`) extracts ALL boxes using structured flat parameter names:
- `field_A` through `field_O` — entity/partner identification (left panel)
- `field_1` through `field_12` — income/deduction boxes (right panel, excluding coded boxes)
- `codes_11`, `codes_13` through `codes_20` — arrays of `{ code, value (NUMBER), notes }` for coded boxes
- `k3_sections` — Schedule K-3 sections array
- `raw_text`, `warnings` — supplemental text and extraction warnings

The PHP `coerceK1Args()` method transforms the flat tool output into the canonical `FK1StructuredData` JSON and stamps the `extraction` provenance metadata. Coded box values are returned as numbers by Gemini and stringified for storage. Boolean boxes (D, H2) are robustly coerced from PHP booleans, integers, and strings.

### K-1 UI (TaxDocumentReviewModal)

When `form_type === 'k1'` and the data contains `schemaVersion`, the modal renders `K1ReviewPanel` instead of the generic `ParsedDataEditor`:
- **Left panel**: Entity/partner identification fields (A–O), including checkboxes and dropdowns
- **Right panel**: Income/deduction/credit fields (1–20); coded boxes show a "Details →" button
- Clicking "Details →" opens `K1CodesModal` for that box's codes
- Fields edited by the user get `manualOverride: true` to prevent AI re-extraction from overwriting them
- Extraction confidence and timestamp shown above the panels

### TypeScript Types

- `FK1StructuredData` — canonical structured format (defined in `@/types/finance/k1-data`, re-exported from `@/types/finance`)
- `FK1ParsedData` — legacy flat format (kept for backward compat with pre-2026.1 documents)
- `isFK1StructuredData(data)` — type guard to detect new-format documents

### Legacy K-1 Transformer (`K1LegacyTransformer`)

Legacy parsed_data records (no `schemaVersion`) are migrated to the canonical `fields`/`codes` shape by `App\Services\Finance\K1LegacyTransformer`. Readers that don't already know they're handling 2026.1+ data should call `isLegacy()` + `transform()` defensively before reading `fields`/`codes`.

The transformer's numeric box map is **form-source aware** for the three boxes that differ between K-1 (Form 1065) and K-1 (Form 1120S):

| Legacy field | Form 1065 canonical box | Form 1120S canonical box |
|--------------|-------------------------|--------------------------|
| `box7_net_section_1231_gain` | `10` | `9` |
| `box8_other_income` | `11` | `10` |
| `box9_section_179_deduction` | `12` | `11` |

Legacy field `box10_other_deductions` is **intentionally not mapped** to a canonical box — historical data shows it is often the same amount also reported as a coded item like `13AE` (suspended portfolio deductions), so a canonical remap would double-count. The raw value is preserved under `legacyFields` for audit/recovery; downstream readers that need it should pull from there rather than expecting a canonical field.

### Form 8959 / 8960 / Capital Loss Carryover Support

**New modules:**

| Path | Purpose |
|------|---------|
| `resources/js/finance/8959/form8959.ts` | `computeForm8959Lines` — Additional Medicare Tax (0.9% × wages over $200k/$250k MFJ) |
| `resources/js/finance/8960/form8960.ts` | `computeForm8960Lines` — full NIIT computation (interest + dividends + cap gains + passive − investment interest) |
| `resources/js/finance/capitalLoss/capitalLossCarryover.ts` | `computeCapitalLossCarryover` — ST/LT carryforward with correct IRS ordering rules |

All three are computed in `TaxPreviewContext` using the `isMarried` flag (MFJ threshold: $250k for Form 8959/8960 vs. $200k single).

**UI:** `AdditionalTaxesPreview` component rendered at the top of the Tax Estimate tab. Shows Form 8959 (when applicable), full Form 8960 NII breakdown, and capital loss carryforward with ST/LT split and planning callout.

**XLSX:** Form 8959, Form 8960, and Capital Loss Carryover sheets added to `buildTaxWorkbook`.

**Note:** The overview tab `addlMedicare` estimate still uses a hardcoded $200k threshold (a sub-component without `isMarried` access). The Tax Estimate tab's Form 8959 block uses the correct MFJ-aware value from the context.

---

### Form 4952 (Investment Interest Expense) Support

**Computation:** `computeForm4952Lines` in `resources/js/components/finance/Form4952Preview.tsx` builds two independent source lists, then runs a QD-election optimiser.

**Part I — Investment interest expense (Line 1, flowing to Line 3):**
- K-1 Box 13 codes **H** (investment interest), **G**, **AC**, **AD** — collected into `invIntSources` as negative values.
- `invIntSources.allowedAmount` prorates Form 4952 Line 8 back to each source. `scheduleEDeductibleInvestmentInterestExpense` is the subset eligible for Schedule E treatment under trader-fund supporting-statement footnotes.
- 1099-INT **Box 5** — investment expense reported by the payer also feeds Part I Line 1 under current convention.
- Short dividends held >45 days (from `analyzeShortDividends`) — deductible investment interest expense per Pub. 550.

**Part II — Net investment income (Lines 4a–6):**
- Gross investment income (Line 4h): when K-1 **Box 20 Code A** is present it is authoritative; otherwise reconstruct from K-1 Box 5 interest + non-qualified dividends + Section 1256 (Box 11 C) + direct 1099 interest and non-qualified dividends.
- K-1 **Box 20 Code B** (investment expenses) — collected into `invExpSources` and summed as `totalInvExp`. This is Form 4952 **Line 5** and reduces NII. It is **not** Part I interest expense.
- `niiBefore = max(0, niiGross − totalInvExp)` — Form 4952 Line 6 (NII, floored at zero).

**Backend facts pilot:** `TaxPreviewFactsService` follows the filed-return treatment for current debug output: K-1 Box 20B amounts are exposed under `excludedInvestmentExpenseSources` / `totalExcludedInvestmentExpenses`, while `investmentExpenseSources` / `totalInvestmentExpenses` represent amounts included on Form 4952 line 5. For the 2025 return this means line 5 is `0`, with Box 20B still available as excluded supporting detail.

**Part III — Deduction and carryforward:**
- Scenario A (no QD election): deductible = `min(Line 3, Line 6)`.
- Scenarios B / C evaluate the 4g qualified-dividend election when Line 3 > Line 6, picking the best net benefit at 37% vs. the 13.2% QD rate delta.
- `deductibleInvestmentInterestExpense` is Line 8; `disallowedCarryforward` is Line 7 (rolls forward to next year's Line 2).

**Known gaps:**
- Line 2 (prior-year disallowed investment interest carryover) is not persisted across years yet. Each year's Line 3 uses only current-year Line 1 sources.
- Section 1256 net gain (Box 11 Code C) is added to reconstructed NII even without a formal Line 4g election. Aggressive treatment — a user wanting full §163(d) conformance should override by reporting Box 20 Code A instead.
- Post-TCJA §212 misc-itemized suspension applies 2018–2025 — Box 20B investment expenses still reduce NII on Form 4952 Line 5 but are not deductible on Schedule A line 16.

**XLSX:** Form 4952 sheet currently renders from the client calculation output. Future workbook work should reuse `taxFacts.form4952` source lines for Part I sources, excluded 20B debug detail, Line 5 total, Line 6 NII, Line 7 carryforward, and Line 8 deduction. Schedule A Line 9 cross-references the Line 8 row via an Excel formula (rowIndex lookup keyed on the Line 8 description).

---

### Form 8582 (Passive Activity Loss Limitations) Support

**Directory: `resources/js/finance/8582/`**

| File | Purpose |
|------|---------|
| `form8582.ts` | `extractForm8582Activities`, `computeForm8582Lines`, `computeForm8582`, `PalCarryforwardEntry`, `TAX_LOSS_CARRYFORWARD_ENDPOINT` |
| `__tests__/form8582.test.ts` | Unit tests |

**Activity extraction (`extractForm8582Activities`):**
- K-1 Box 1 → one activity per K-1 when classification is passive (or unknown). Trader-in-securities K-1s (`field_partnershipPosition_traderInSecurities = true`) are reclassified nonpassive and excluded.
- K-1 Box 2 → rental real estate activity (eligible for $25k special allowance when active participation + non-LP).
- K-1 Box 3 → other rental activity (not RE; no $25k allowance).
- K-1 `passiveActivities[]` (from Box 23 supplemental statement) → one activity per entry, named `"${baseName} — ${pa.name}"`, always `isRentalRealEstate: false, activeParticipation: false`. Schema limitation: the supplemental schema does not distinguish per-sub-activity RE or active-participation status.
- Direct rental properties from Schedule E Part I → rental RE activities with active participation.

**Computation (`computeForm8582Lines`):**
- `grossLoss = |totalPassiveLoss| + |totalPriorYearUnallowed|` — basis for allowed vs. suspended.
- Rental $25k special allowance applies only to RE activities with active participation (LPs never qualify), phased out 50% per $1 of MAGI over $100k, fully phased out at $150k (MFJ / Single / HoH). MFS handling is stubbed — currently treated as MFJ.
- Real estate professional election (`§469(c)(7)`) excludes rental RE activities with material participation from Form 8582 entirely.
- `totalAllowedLoss = totalPassiveIncome + effectiveAllowance`; `totalSuspendedLoss = max(0, grossLoss − totalAllowedLoss)`.
- Worksheet 5 allocates the allowed loss proportionally by `|currentLoss + priorYearUnallowed|` across loss activities.

**PAL carryforward persistence (`fin_pal_carryforwards`):**

| Column | Purpose |
|---|---|
| `tax_year` | Opening-balance year (i.e. the year whose Form 8582 Part I Line 1c reads this row) |
| `activity_name` | Must match `Form8582ActivityLine.activityName` for `findCarryforward` to wire it into the correct row |
| `activity_ein` | Fallback match key when `activity_name` drifts between years |
| `ordinary_carryover` | Stored as **negative** magnitude (loss). `findCarryforward` returns this value directly into `priorYearUnallowed` |
| `short_term_carryover`, `long_term_carryover` | Reserved for future ST/LT capital-loss carryforward separation |

Unique index: `(user_id, tax_year, activity_name)`.

**API** (aliases share the same controller — `PalCarryforwardController`):

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/finance/pal-carryforwards?year=YYYY` ≡ `/api/finance/tax-loss-carryforwards?year=YYYY` | List entries for the year |
| `POST` | `/api/finance/pal-carryforwards` ≡ `/api/finance/tax-loss-carryforwards` | Upsert by `(user_id, tax_year, activity_name)` — returns 200 (not 201) since creates and updates share the path |
| `PUT` | `.../{id}` | Update a specific row (tax_year is immutable and silently ignored if sent) |
| `DELETE` | `.../{id}` | Remove a row |

The `tax-loss-carryforwards` alias is the one the UI code calls; `pal-carryforwards` is kept for backward compatibility and is not referenced in the codebase outside `routes/api.php`.

**Forward-save flow ("Save suspended losses to Y+1"):**

Triggered from `Form8582Preview` after the user reviews year *Y*. For each activity in `form8582.activities`:
- If `suspendedLossCarryforward > 0`: POST/upsert a carryforward row for *Y+1* with `ordinary_carryover = -suspendedLossCarryforward`.
- Else if *Y+1* already has a row keyed on this activity name: DELETE it (keeps next-year opening balances in sync with this year's recomputation; will clobber manually entered *Y+1* rows that share an activity_name).

On reload, `TaxPreviewProvider` fetches `/api/finance/tax-loss-carryforwards?year=YYYY`, and `computeForm8582` calls `findCarryforward(name, ein)` — first exact name match, then EIN fallback — to seed `priorYearUnallowed` on each activity.

**UI feedback:** the commit-forward button surfaces either a `role="status"` success message or a `role="alert"` error naming the failed activities. The Form 8582 carryforward editor stays visible even when `activities.length === 0` so that opening balances can be entered before K-1s are reviewed.

**XLSX:** Form 8582 sheet renders Part I per-activity lines, Part II special allowance, Part III allowed/suspended totals, Worksheet 5 per-activity allocation, and per-activity net gain/loss. K-1 sheet gains a "Box 11 S — Per-Activity Passive Items" section when `passiveActivities` is present (codebase-internal label — no formal IRS Box 11 Code S exists; represents Box 23 supplemental statement entries).

---

### Form 8995 (QBI Deduction) Support

**Directory: `resources/js/finance/8995/`**

| File | Purpose |
|------|---------|
| `k1-to-8995.ts` | `extractQBIFromK1`, `computeForm8995Lines`, `qbiThreshold` |
| `__tests__/k1-to-8995.test.ts` | Unit tests |

**K-1 Box 20 code mapping (TY 2023+):**
- Code Z → Section 199A information (QBI income/loss from the activity); W-2 wages, UBIA, and SSTB flag in Statement A attached to Code Z
- Note: Pre-2023 forms used Code S (QBI) and Code V (UBIA); these codes are no longer read by `extractQBIFromK1` — see issue #269 for the no-backwards-compat decision.

**Computation (`computeForm8995Lines`):**
- Accepts K-1 data array, `totalIncome` (Form 1040 Line 9 estimate), `year`, and `isMarried`
- Estimates taxable income = total income − standard deduction (year + filing status lookup)
- QBI component = 20% × max(QBI income, 0) per partnership
- Deduction = min(total QBI component, 20% × estimated taxable income)
- Flags `aboveThreshold` when estimated taxable income exceeds the Sec. 199A phase-in threshold (W-2 wage/UBIA limitation applies above threshold — use Form 8995-A)

**Historical thresholds and standard deductions** are built into `k1-to-8995.ts` for years 2018–2025 (IRS Rev. Proc. sources).

**UI:** `Form8995Preview` component mirrors `Form1116Preview`. Rendered on the **Form 8995** tab in `TaxPreviewPage`. Includes callouts for:
- NIIT (QBI deduction does NOT reduce NII)
- AMT (no add-back required post-TCJA)
- State conformity (CA, NY, NJ, MA, IL and others do not conform)

**XLSX:** Form 8995 sheet added to `buildTaxWorkbook`. Form 1040 Line 13 is cross-referenced via Excel formula. Box 20 Z routing note added to `K1_CODE_ROUTING_NOTES` (TY 2023+).

**Extraction prompt:** `TaxDocumentPromptTemplate.php` instructs the AI to extract Box 20 Code Z (QBI amount + full Section 199A Statement A notes, TY 2023+).

---

### Form 1116 (Foreign Tax Credit) Support

Foreign tax information from K-1 Box 16 and 1099-DIV/INT feeds into Form 1116 via the `@/finance/1116` module:

**Directory: `resources/js/finance/1116/`**

| File | Purpose |
|------|---------|
| `types.ts` | `ForeignTaxSummary`, `F1116Data`, `F1116WorksheetInput/Result` |
| `F1116_SPEC.ts` | Form 1116 field spec (spec-driven rendering) |
| `k3-to-1116.ts` | Extraction functions: `extractForeignTaxFromK1`, `extractForeignTaxFrom1099Div`, `extractForeignTaxFrom1099Int`, `calculateApportionedInterest` |
| `WorksheetModal.tsx` | Form 1116 Line 4b apportionment worksheet modal |
| `index.ts` | Barrel exports |

**K-1 Box 16 code mapping:**
- Code A → country name
- Code B → gross passive income
- Code C → gross general income
- Code I → foreign taxes paid
- Code J → foreign taxes withheld at source

**Sourced-by-partner default (K-3 Part II column (f)):**
U.S.-source is the default. For a U.S.-person taxpayer, partner-level "sourced by partner" income is U.S.-source under the partner's own facts and is excluded from Form 1116 foreign-source passive income. The `sourcedByPartnerAsUSSource` election toggle should only be set to `false` when the partner is *not* a U.S. person or is otherwise sourcing the income as foreign under a treaty.

**Asset Method Apportionment (IRS Pub. 514):**
```
Apportioned Foreign Interest = Total Interest Expense × (Foreign Basis / Total Basis)
```

The `WorksheetModal` assists the user in computing Line 4b by inputting total interest expense, foreign adjusted basis, and total adjusted basis. It also shows a summary of all foreign taxes paid from reviewed documents.

**Account Documents Table:**
The table includes a **Foreign Tax** column showing the total foreign taxes per account, and a **1116 Worksheet** button (visible when any foreign taxes are found) that opens the worksheet modal.

### Future Extension: Partnership Basis Tracking

The `FK1StructuredData` format is designed to support basis tracking for the partnership interest. Box K (capital account analysis), Box N (at-risk amount), and coded distributions (Box 19) provide the data needed for an outside-basis tracker.

---

## Account Documents Section

The **Account Documents** section (formerly "1099 Documents") on the Tax Preview page shows a table with one row per account. Each account row displays one button per document linked to that account via the `fin_document_accounts` join table.

A single consolidated broker PDF may produce multiple buttons for the same account (e.g., 1099-DIV, 1099-INT, 1099-B) — each is a separate join table row with its own form_type and review state. Clicking a per-link button opens the review modal with the specific account/form context.

Unified tax form imports are launched from `/finance/documents` with `DocumentImportModal`.

### Totals Computation

Interest and dividend totals are computed from both:
- Single-form documents (using parent `is_reviewed` state)
- `broker_1099` entries (using per-link `is_reviewed` state via `iterateReviewedBrokerEntries()`)

Foreign tax summaries follow the same pattern for Form 1116 worksheet data.

### Account Ordering

Accounts are sorted into two groups:
1. **Active accounts** (top) — accounts with transactions in the selected year OR with any 1099/K-1 documents (via join table)
2. **Inactive accounts** (bottom, dimmed) — no transactions and no documents, separated by a "No transactions in YYYY" divider row

This sorting uses the `/api/finance/accounts?active_year=YYYY` endpoint, which returns an `active_account_ids` array alongside the normal account lists.

### Upload Button Style

Per-account upload uses the `ghost` variant **Add** dropdown with per-form-type options. The **Consolidated 1099 (Broker)** option opens the multi-account import modal pre-seeded for that account.

---

## Tax Preview Page Layout

The Tax Preview page (`TaxPreviewPage.tsx`) is a dock interface (see Dock Form Structure above). `DockHomeView` is the landing surface, `DockHeaderBar` owns year navigation/review/export actions, and `MillerShell` renders selected forms as columns.

`Form1040Preview` is purely presentational — it receives pre-computed `Form1040LineItem[]` from `taxReturn.form1040` (computed once in `TaxPreviewContext` and shared with the XLSX workbook export). Each 1040 line has an optional `navTab` that the dock adapter translates to the relevant form column on click, and an optional `sources` array for the drill-down data source modal.

All schedule computations (Schedule 1, B, C, D, E, SE, Forms 1116/4952/6251/8582/8959/8960/8995) run once in `TaxPreviewContext` and their results are stored on `TaxReturn1040`. Preview components receive pre-computed data — they do not recompute.

### SE 401(k) Worksheet

The Tax Preview dock includes `wks-se-401k`, a read-only Solo 401(k) worksheet registered in `resources/js/components/finance/tax-preview/registry.tsx`.

The worksheet is intentionally a thin adapter:

- Reads Schedule SE net earnings and deductible SE tax from `state.taxReturn.scheduleSE`.
- Sums W-2 pre-tax 401(k) deferrals from `state.payslips[*].ps_401k_pretax`.
- Passes those values into `SoloSE401kForm`.

The underlying Pub 560 calculation lives in `resources/js/lib/planning/solo401k.ts` and is shared with the public `/financial-planning/solo-401k` calculator. See [../financial-planning.md](../financial-planning.md) for the standalone route, URL state, and shared component notes.

### 1099-B Lot Reconciliation App

The Tax Preview dock includes a `1099-B Lot Reconciliation` app for comparing broker-reported 1099-B lots with account-derived lots and persisting accepted/superseded decisions. See [tax-lot-reconciliation.md](tax-lot-reconciliation.md) for endpoint details, matching rules, persistence fields, and tests.

### Frontend Components

- **`FinanceDocumentsPage`** (`FinanceDocumentsPage.tsx`) — Unified document inbox with server-side `document_kind` filtering.
- **`DocumentImportModal`** (`DocumentImportModal.tsx`) — Unified upload modal for tax-form document intake.
- **`TaxDocumentReviewModal`** (`TaxDocumentReviewModal.tsx`) — Document review with editable extracted data (read-only when confirmed), W-2 vs. payslip comparison, per-link review for multi-account docs, and Delete button in footer.

### Shared Types

TypeScript types are spread across several files in `resources/js/types/finance/`:

**`tax-document.ts`** — re-exports all tax types; primary import target for components:
- `TaxDocument` interface — API response shape (includes `account_links: TaxDocumentAccountLink[]`)
- `TaxDocumentAccountLink` interface — join table row (id, account_id, form_type, tax_year, ai_identifier, ai_account_name, is_reviewed, notes)
- `MultiAccountParsedEntry` interface — one entry in a broker_1099's parsed_data array
- `EmploymentEntity` interface
- `W2ParsedData`, `F1099IntParsedData`, `F1099DivParsedData`, `F1099MiscParsedData`, `F1099NecParsedData`, `Form1099RParsedData`, `FK1ParsedData` — per-form parsed data interfaces
- `Broker1099BParsedData`, `BrokerTransaction1099B` — 1099-B transaction lot types
- `TaxDocumentParsedData` — union of all parsed data shapes
- `FORM_TYPE_LABELS` — display labels for form types
- `W2_FORM_TYPES`, `ACCOUNT_FORM_TYPES_1099` — form type groupings

**`tax-return-forms.ts`** — full Form 1040 type system:
- `CompleteTaxReturn` — top-level container (Form 1040 + all schedules + `brokerStatements`)
- `Form1040`, `Form1040Income`, `Form1040Credits`, `Form1040Filing`
- `Schedule1`–`Schedule3`, `ScheduleA`–`ScheduleE`
- `Form8949`, `Form1116`, `Form4952`, `Form6781`, `Form8582`, `Form8829`, `Form8959`, `Form8960`, `Form8995A`

**`tax-return-broker-statements.ts`** — consolidated broker 1099 types:
- `BrokerConsolidated1099Statement` — per-account consolidated 1099 (DIV/INT/MISC/B summary + supplemental)
- `Form1099BCategory` — Form 8949 box-level capital gain summary (boxes A–F)
- `ForeignIncomeSummaryEntry`, `BrokerSupplementalInfo`

**`tax-return-k1.ts`** — Schedule K-1 (Form 1065) TypeScript types:
- `ScheduleK1Form1065`, `K1PartnershipInfo`, `K1PartnerInfo`
- Coded box types: `K1Box11OtherIncome`, `K1Box13OtherDeductions`, `K1Box19Distributions`, `K1Box20OtherInformation`
- `K1PassiveActivityWorksheet`, `K1QBIDeductionInfo`, `K1AdditionalInfoWorksheet`
- `ScheduleK3ForeignTransactions`

**`tax-return-worksheets.ts`** — TurboTax worksheet types:
- `TaxSummary`, `TaxHistoryReport`, `FederalCarryoverWorksheet`, `CapitalLossCarryoverSmartWorksheet`
- `ScheduleBSmartWorksheet`, `ForeignTaxCreditComputationWorksheet`, `SALTDeductionSmartWorksheet`
- `EstimatedTaxPaymentOptions`, `PersonOnReturnWorksheet`, `ScheduleCTwoYearComparison`

---

See [tax-preview-dock.md](tax-preview-dock.md) for the Miller-column dock UI architecture.
