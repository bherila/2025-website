# FinDocument Architecture

> Cross-domain source artifact for the Finance tool.

## Entity Relationships

```
┌──────────────────┐
│   FinDocument    │  (fin_documents)
│──────────────────│
│ id               │
│ user_id          │
│ document_kind    │  ← tax_form | statement | csv_import | json_import | toon_import | manual
│ tax_year         │
│ s3_path          │
│ genai_status     │
│ parsed_data      │
└───────┬──────────┘
        │
        │ 1:N
        ▼
┌──────────────────────┐
│ FinDocumentAccount   │  (fin_document_accounts)
│──────────────────────│
│ document_id (FK)     │───► FinDocument.id
│ account_id (FK)      │───► FinAccounts.acct_id (nullable — missing-account state)
│ statement_id (FK)    │───► FinStatement.statement_id
│ form_type            │
│ tax_year             │
│ payload_kind         │
└──────────────────────┘

        FinDocument (1:1)
        ▼
┌──────────────────────┐
│ FileForTaxDocument   │  (fin_tax_documents)
│──────────────────────│
│ document_id (FK)     │───► FinDocument.id
│ form_type            │
│ tax_year             │
│ parsed_data          │  ← Tax-specific parsed content
│ genai_status         │
└──────────────────────┘

        FinDocument (1:N)
        ▼
┌──────────────────────┐
│ FinStatement         │  (fin_statements)
│──────────────────────│
│ document_id (FK)     │───► FinDocument.id
│ acct_id (FK)         │───► FinAccounts.acct_id
│ closing_balance      │
│ statement_closing_date│
└──────────────────────┘

        FinDocument (1:N)
        ▼
┌──────────────────────┐
│ FinAccountLot        │  (fin_account_lots)
│──────────────────────│
│ document_id (FK)     │───► FinDocument.id
│ statement_id (FK)    │───► FinStatement.statement_id
│ acct_id (FK)         │───► FinAccounts.acct_id
│ symbol, quantity     │
│ cost_basis, proceeds │
└──────────────────────┘

        FinStatement / FinAccountLot
        ▼
┌──────────────────────────┐
│ FinAccountLineItems      │  (fin_account_line_items)
│──────────────────────────│
│ t_account (FK)           │───► FinAccounts.acct_id
│ statement_id (FK)        │───► FinStatement.statement_id
└──────────────────────────┘
```

## Design Rules

1. **`FinDocument` is cross-domain.** It represents any imported/uploaded file or data payload. Tax-specific logic (parsed 1099 data, W-2 fields, form_type semantics) lives in `FileForTaxDocument`.

2. **Tax projection is a facet, not a replacement.** When a document has `document_kind = 'tax_form'`, the tax metadata lives on the associated `FileForTaxDocument`. The `FinDocument` record holds only file-level and processing-level concerns.

3. **Account links are many-to-many through `FinDocumentAccount`.** A single document can link to multiple accounts (multi-account 1099, statement covering joint accounts). The `account_id` column is nullable to represent the "missing account" state pending user resolution.

4. **No soft deletes on `FinDocument`.** Deletion is hard-delete with impact preview confirmation. The server computes an impact hash; the client must send the hash back on `DELETE` to prevent stale-state deletions.

5. **Capabilities are computed, not stored.** The `DocumentCapabilityService` derives per-document capabilities from document kind, processing state, file presence, and linked records. The API returns capabilities in every resource response.

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/finance/documents` | Paginated index with filters |
| GET | `/api/finance/documents/summary` | Aggregate counts by kind/year/status |
| GET | `/api/finance/documents/{id}` | Detail resource with facets |
| GET | `/api/finance/documents/{id}/download` | Signed view + download URLs |
| GET | `/api/finance/documents/{id}/impact-preview` | Pre-delete impact analysis |
| DELETE | `/api/finance/documents/{id}` | Hard delete (requires impact_hash) |
| POST | `/api/finance/documents/request-upload` | Get signed upload URL |
| POST | `/api/finance/documents` | Create/ingest document |

## Filters (index endpoint)

- `q` — filename/notes search
- `document_kind` — comma-separated kind values
- `tax_year` — integer
- `account_id` — filter by linked account
- `form_type` — filter by form type on account links
- `genai_status` — processing status
- `is_reviewed` — boolean
- `missing_account` — boolean (has unresolved links)
- `has_tax_document` — boolean
- `has_statement` — boolean
- `has_lots` — boolean
- `source_job_id` — GenAI job ID
- `per_page` — 1–100 (default 50)

## Capability Model

Capabilities returned per document:

| Capability | When present |
|------------|--------------|
| `view_original` | Document has an S3 file |
| `download_original` | Document has an S3 file |
| `delete` | Always |
| `reprocess` | GenAI status is not `completed` |
| `review_parsed_data` | `parsed_data_needs_review` is true |
| `resolve_accounts` | Has account links with null `account_id` |
| `open_statement` | Statement kind |
| `open_tax_document` | Tax form kind |
| `open_lot_workspace` | Has associated lots |
| `open_tax_reconciliation` | Tax form kind |
| `rollback_import` | CSV/JSON/TOON import kinds |
| `reimport_statement` | CSV/JSON/TOON import kinds |
