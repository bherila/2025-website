# Utility Bill Tracker

Track utility accounts (electricity, gas, water, internet, …) and their bills,
with optional AI-driven PDF import and linking to finance-account transactions
for reconciliation.

## Overview

- **Accounts** — one row per utility account (e.g. "PECO Electric", "Water Co.") with a type that controls which fields are tracked.
- **Bills** — one row per billing period, with dates, totals, taxes/fees, status, and (optionally) an attached PDF.
- **AI import** — uploads run through the shared async [GenAI import pipeline](genai-import.md). Files PUT to S3, a queue worker calls the user's configured AI provider, results stage as `pending_review`, and a per-bill review UI lets the user edit and confirm before persistence.
- **Transaction linking** — bills can be linked to a finance line item for reconciliation.

## Account types

| Type          | Tracked fields beyond the common set |
|---------------|--------------------------------------|
| `Electricity` | `power_consumed_kwh`, `total_generation_fees`, `total_delivery_fees` |
| `General`     | Common fields only — used for water, gas, internet, anything else |

`account_type` is a string column (no DB enum); validation lives in `UtilityAccountApiController`. The AI prompt branches on `account_type === 'Electricity'` to ask the model for the additional fields.

## Routes

### Web

| Method | URL                                  | Description |
|--------|--------------------------------------|-------------|
| GET    | `/utility-bill-tracker`               | Account list page |
| GET    | `/utility-bill-tracker/{id}/bills`    | Bill list for one account |

### API

All endpoints require auth (`web` + `auth` middleware) and are user-scoped — the `UtilityAccount` model has a global scope that filters by `auth()->id()`.

| Method | URL                                                                                                | Description |
|--------|----------------------------------------------------------------------------------------------------|-------------|
| GET    | `/api/utility-bill-tracker/accounts`                                                               | List accounts (with bill count + total) |
| POST   | `/api/utility-bill-tracker/accounts`                                                               | Create an account |
| GET    | `/api/utility-bill-tracker/accounts/{id}`                                                          | Account detail |
| PUT    | `/api/utility-bill-tracker/accounts/{id}/notes`                                                    | Update account notes |
| DELETE | `/api/utility-bill-tracker/accounts/{id}`                                                          | Delete account (only when it has no bills) |
| GET    | `/api/utility-bill-tracker/accounts/{accountId}/bills`                                             | List bills |
| POST   | `/api/utility-bill-tracker/accounts/{accountId}/bills`                                             | Create a bill manually |
| GET    | `/api/utility-bill-tracker/accounts/{accountId}/bills/{billId}`                                    | Bill detail |
| PUT    | `/api/utility-bill-tracker/accounts/{accountId}/bills/{billId}`                                    | Update a bill |
| POST   | `/api/utility-bill-tracker/accounts/{accountId}/bills/{billId}/toggle-status`                      | Toggle Paid/Unpaid |
| DELETE | `/api/utility-bill-tracker/accounts/{accountId}/bills/{billId}`                                    | Delete a bill (also deletes attached PDF) |
| GET    | `/api/utility-bill-tracker/accounts/{accountId}/bills/{billId}/download-pdf`                       | Signed download URL for the attached PDF |
| DELETE | `/api/utility-bill-tracker/accounts/{accountId}/bills/{billId}/pdf`                                | Delete attached PDF only |
| POST   | `/api/utility-bill-tracker/accounts/{accountId}/bills/genai-import/{jobId}/results/{resultId}/confirm` | Persist a parsed `GenAiImportResult` as a `UtilityBill` |
| POST   | `/api/utility-bill-tracker/accounts/{accountId}/bills/genai-import/{jobId}/results/{resultId}/skip`    | Mark a parsed `GenAiImportResult` as skipped without creating a bill |
| GET    | `/api/utility-bill-tracker/accounts/{accountId}/bills/{billId}/linkable`                           | Find candidate finance transactions to link |
| POST   | `/api/utility-bill-tracker/accounts/{accountId}/bills/{billId}/link`                               | Link a transaction |
| POST   | `/api/utility-bill-tracker/accounts/{accountId}/bills/{billId}/unlink`                             | Unlink the current transaction |

The upload + parse half of the GenAI flow uses the shared endpoints documented in [genai-import.md](genai-import.md):
`POST /api/genai/import/request-upload`, `POST /api/genai/import/jobs`, `GET /api/genai/import/jobs/{id}`.

## AI-driven PDF import

The full upload → parse → review → confirm pipeline:

1. User opens the **Import Bills from PDF** modal and selects one or more PDFs.
2. For each file, the modal calls `useGenAiFileUpload({ jobType: 'utility_bill', context: { account_type, utility_account_id, file_count } })` — this requests a pre-signed S3 URL, PUTs the file, and registers a job. The browser is **never blocked** waiting for the AI — the modal can be closed safely.
3. `useGenAiJobPolling` polls each job. Status moves `pending → processing → parsed`; the cron worker (`genai:run-queue`) runs once per minute, so first results typically appear within 1–2 minutes.
4. When `parsed`, the modal renders an editable form per `GenAiImportResult`. The user can correct any field the model got wrong (dates, totals, electricity-specific fields).
5. Clicking **Import bill** POSTs to the confirm endpoint, which validates the (possibly user-edited) payload, copies the staged PDF from `genai-import/{user_id}/…` into `utility-bills/{accountId}/…`, creates the `UtilityBill` row, and marks the result `imported`. When no `pending_review` results remain, the parent `GenAiImportJob` is marked `imported` too.
6. **Skip** marks the result `skipped` without creating a bill.

### Provider-agnostic

Parsing uses whichever provider the user has selected under **Settings → AI Configurations** — Anthropic, Bedrock, or Gemini. There is no hard dependency on Gemini despite some legacy env-var names — see [genai-import.md](genai-import.md#daily-quota--system-and-per-user).

### Extracted fields

The `UtilityBillPromptTemplate` asks for, per file:

- `bill_start_date`, `bill_end_date`, `due_date` (YYYY-MM-DD)
- `total_cost`, `taxes`, `fees`, `discounts`, `credits`, `payments_received`, `previous_unpaid_balance` (numeric)
- `notes` (string, optional)

When `account_type === 'Electricity'`:

- `power_consumed_kwh`
- `total_generation_fees`
- `total_delivery_fees`

### PDF storage

The staged PDF lives in `genai-import/{user_id}/{uuid}/{filename}` while the
job is in flight. On confirm, the file is **copied** (not moved) into the
canonical bill storage path:

```
utility-bills/{accountId}/{stored_filename}
```

`stored_filename` is generated via `UtilityBill::generateStoredFilename()`
(unique). Copying (rather than moving) keeps the two paths independent — the
genai-import staging path stays around for the lifetime of the
`GenAiImportJob` and is cleaned up when the job is deleted (model `deleting`
hook) or by `orphans:delete`.

## Manual bill entry

Bills can also be created manually via the **Add Bill** modal. The form
mirrors the same field set used by the AI review UI, so the validation rules
and field semantics are identical (see `UtilityBillApiController::store`).

## Transaction linking

Each bill can be linked to a finance-account transaction for reconciliation.

1. Click the link icon on a bill.
2. The system queries for transactions within ±90 days of `due_date` with an amount within ~10% of `total_cost`.
3. Picking a candidate sets `utility_bill.t_id`.
4. Linked bills surface the transaction amount in the "Linked" column and can be unlinked or re-linked.

Implementation: `UtilityBillLinkingController`.

## Database schema

### `utility_account`

| Column         | Type        | Description |
|----------------|-------------|-------------|
| `id`           | bigint PK   | |
| `user_id`      | bigint FK   | `users.id` |
| `account_name` | varchar     | "PECO Electric", … |
| `account_type` | varchar     | `Electricity` or `General` |
| `notes`        | text        | Optional |
| `created_at`   | timestamp   | |
| `updated_at`   | timestamp   | |

A global scope on `UtilityAccount` filters every query by `auth()->id()`.

### `utility_bill`

| Column                    | Type           | Description |
|---------------------------|----------------|-------------|
| `id`                      | bigint PK      | |
| `utility_account_id`      | bigint FK      | `utility_account.id` |
| `bill_start_date`         | date           | |
| `bill_end_date`           | date           | |
| `due_date`                | date           | |
| `total_cost`              | decimal(14,5)  | |
| `taxes`                   | decimal(14,5)  | nullable |
| `fees`                    | decimal(14,5)  | nullable |
| `discounts`               | decimal(14,5)  | nullable |
| `credits`                 | decimal(14,5)  | nullable |
| `payments_received`       | decimal(14,5)  | nullable |
| `previous_unpaid_balance` | decimal(14,5)  | nullable |
| `power_consumed_kwh`      | decimal(14,5)  | Electricity only |
| `total_generation_fees`   | decimal(14,5)  | Electricity only |
| `total_delivery_fees`     | decimal(14,5)  | Electricity only |
| `status`                  | varchar        | `Paid` or `Unpaid` |
| `notes`                   | text           | |
| `t_id`                    | bigint FK      | Linked `fin_account_line_items.t_id` (nullable) |
| `pdf_original_filename`   | varchar        | |
| `pdf_stored_filename`     | varchar        | |
| `pdf_s3_path`             | varchar(500)   | |
| `pdf_file_size_bytes`     | bigint         | |
| `created_at`              | timestamp      | |
| `updated_at`              | timestamp      | |

Deleting a `UtilityBill` triggers the model's `deleting` hook to remove the
attached PDF from S3.

## File structure

```
app/
  Http/Controllers/UtilityBillTracker/
    UtilityAccountController.php          # Web views
    UtilityAccountApiController.php       # Account CRUD + totals
    UtilityBillApiController.php          # Bill CRUD, status toggle, PDF download/delete
    UtilityBillImportController.php       # GenAI confirm + skip endpoints
    UtilityBillLinkingController.php      # Finance transaction linking
  Models/UtilityBillTracker/
    UtilityAccount.php                    # User-scoped (global scope)
    UtilityBill.php                       # Deletes attached PDF on delete

app/GenAiProcessor/Services/Prompts/
  UtilityBillPromptTemplate.php           # The TOON-array prompt for utility_bill jobs

resources/js/
  components/utility-bill-tracker/
    UtilityAccountListPage.tsx
    UtilityBillListPage.tsx
    CreateAccountModal.tsx
    EditBillModal.tsx                     # Manual create/edit
    ImportBillModal.tsx                   # Orchestrates per-file uploads + lists in-flight jobs
    UtilityBillJobCard.tsx                # One job's polling + per-result review form
    LinkBillModal.tsx
    DeleteConfirmModal.tsx
  types/utility-bill-tracker/index.ts
  utility-bill-tracker.tsx                # Vite entry

resources/views/utility-bill-tracker/
  accounts.blade.php
  bills.blade.php

tests/Feature/UtilityBillImportTest.php   # Confirm + skip endpoint tests
```

## Security

- All API endpoints require auth.
- `UtilityAccount` uses a global scope on `user_id = auth()->id()` so users can never see another user's accounts.
- The genai confirm endpoint also verifies that `genai_import_jobs.user_id` matches the auth user and that the job's `context_json.utility_account_id` matches the URL `{accountId}`.
- PDFs live in S3 with user/account-scoped paths and are served via short-lived signed URLs.
- Deleting a bill deletes its PDF; deleting an account is blocked while bills exist.

## See also

- [genai-import.md](genai-import.md) — the shared async pipeline that powers the AI import.
- [finance/import.md](finance/import.md) — the finance-side counterpart to the import pattern.
- [finance/rsu-genai-import.md](finance/rsu-genai-import.md) — proposed RSU PDF import (docs-only spec).
