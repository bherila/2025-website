# GenAI Import System

The GenAI Import system is the shared, asynchronous pipeline every AI-driven
import in this app uses. Browser uploads land in S3, a queue worker dispatches
to the user's configured AI provider, the parsed output is staged for review,
and a per-feature persist endpoint turns reviewed results into domain rows.

The pipeline is **provider-agnostic**: it uses whatever AI provider the user
has activated in **Settings → AI Configurations** (Anthropic, AWS Bedrock, or
Google Gemini). The `GEMINI_*` environment-variable names are legacy and apply
to every provider, not just Gemini — see [Daily quota](#daily-quota--system-and-per-user).

## Job types

| `job_type`             | Prompt template                                  | Output shape                                    | Persist mechanism |
|------------------------|--------------------------------------------------|-------------------------------------------------|-------------------|
| `finance_transactions` | `FinanceTransactionsPromptTemplate`              | `addFinanceAccount` tool call per account       | `POST /api/finance/documents` with `document_kind=statement`; pass `gen_ai_job_id` and `gen_ai_result_id` so `FinanceDocumentController` marks the result imported on success |
| `finance_payslip`      | `PayslipPromptTemplate`                          | TOON array of payslip objects                   | `POST /api/payslips/genai-import/{jobId}/results/{resultId}/confirm` |
| `utility_bill`         | `UtilityBillPromptTemplate`                      | TOON array of bill objects                      | `POST /api/utility-bill-tracker/accounts/{accountId}/bills/genai-import/{jobId}/results/{resultId}/confirm` |
| `document_extract`     | `TaxDocumentPromptTemplate` or `MultiAccountTaxImportPromptTemplate` | Tool call per form OR per-account JSON array | Linked `FileForTaxDocument.parsed_data` is updated and `DocumentIngestionService::syncFromTaxDocument` is invoked inline |
| `class_action_email`   | `ClassActionEmailPromptTemplate` (text-only)     | Single JSON object with structured claim fields | Frontend reads parsed result and posts a class action claim via the regular CRUD endpoint, then calls a confirm route |
| `phr_*` (lab result, vital, office visit, medication, immunization, problem list, procedure, allergy, document) | `PhrPromptTemplate` | JSON array of records | `POST /api/phr/genai/{job}/{result}/accept` (`PhrGenAiImportController::accept`) marks the result imported |

All job types are listed in `GenAiImportJob::VALID_JOB_TYPES`. Adding a new
type requires changes in three places — see [Adding a new job type](#adding-a-new-job-type).

---

## Architecture overview

```
┌─────────────────────────────────────────────────────────┐
│                    Browser                              │
│  Per-feature import modals                              │
│          ↓ useGenAiFileUpload (shared)                  │
└──────────┬──────────────────────────────────┬───────────┘
           │ 1. POST request-upload           │ 3. POST /jobs
           ▼                                  ▼
  ┌──────────────────┐             ┌──────────────────────────┐
  │ GenAiImportCtrl  │             │   GenAiImportController  │
  │ returns signed   │             │   creates job, validates │
  │ S3 PUT URL       │             │   context, dispatches    │
  └──────────────────┘             └────────────┬─────────────┘
           │                                    │
           │ 2. PUT file directly to S3         │ dispatches
           ▼                                    ▼
      ┌─────────┐                  ┌────────────────────────┐
      │   S3    │                  │  genai-imports queue   │
      └────┬────┘                  │  (database driver)     │
           │                       └───────────┬────────────┘
           │                                   │ cron every minute
           │                                   ▼
           │                       ┌───────────────────────┐
           │                       │    ParseImportJob     │
           │                       │  • claimQuota()       │
           │ signed read URL       │  • stream from S3 ────│──→ User's configured AI provider
           └──────────────────────→│  • buildPrompt        │
                                   │  • generateContent    │
                                   │  • create results     │
                                   └───────────┬───────────┘
                                               │
                                               ▼
                                  genai_import_results (1..N rows, status='pending_review')
                                               │
                                               │ frontend polls
                                               ▼
                                  Per-feature review UI
                                               │ user confirms each result
                                               ▼
                                  Per-feature persist endpoint
                                  (marks GenAiImportResult.imported
                                   AND marks job imported when no
                                   pending results remain)
```

### Key design decisions

- **Direct-to-S3 uploads** — files PUT directly to S3 via pre-signed URLs (15-minute TTL), bypassing the PHP server to avoid memory bloat and HTTP timeouts.
- **Database queue driver** — chosen because the hosting environment doesn't support Redis or long-running daemon workers. `genai:run-queue` is invoked once per minute by cron.
- **De-duplication** — files are hashed via the S3 ETag (MD5 for single-part uploads). Re-uploading the same file short-circuits to the existing job without consuming AI quota.
- **Global daily quota** — `genai_daily_quota` table caps total AI calls per UTC day to bound LLM spend. A per-user limit can layer on top.
- **Provider-agnostic** — the worker resolves `user->resolvedAiClient()` and calls a shared `GenAiClient` interface. The same prompt feeds Anthropic, Bedrock, or Gemini.
- **Per-feature persist** — the canonical pipeline creates `GenAiImportResult` rows but does not know how to insert them into domain tables. Each feature ships its own confirm endpoint and marks results `imported`.

---

## API endpoints (shared pipeline)

All endpoints require authentication (`['web', 'auth']` middleware).

| Method   | Endpoint                                | Description |
|----------|-----------------------------------------|-------------|
| `POST`   | `/api/genai/import/request-upload`      | Generate a pre-signed S3 upload URL |
| `POST`   | `/api/genai/import/jobs`                | Create a new import job after the file is in S3 |
| `POST`   | `/api/genai/import/paste`               | Create a pasted-text job (currently only `class_action_email`) |
| `GET`    | `/api/genai/import/jobs`                | List current user's jobs (paginated, excludes `imported`) |
| `GET`    | `/api/genai/import/jobs/{job_id}`       | Show a job with its results |
| `POST`   | `/api/genai/import/jobs/{job_id}/retry` | Retry a failed job (subject to `MAX_RETRIES = 3`) |
| `DELETE` | `/api/genai/import/jobs/{job_id}`       | Delete a job, its results, and the staged S3 file |

### `POST /api/genai/import/request-upload`

```json
// request
{
  "filename": "statement.pdf",
  "content_type": "application/pdf",
  "file_size": 1048576
}
// response
{
  "signed_url": "https://s3.amazonaws.com/...",
  "s3_key": "genai-import/{user_id}/{uuid}/statement.pdf",
  "expires_in": 900
}
```

### `POST /api/genai/import/jobs`

```json
// request
{
  "s3_key": "genai-import/123/abcd-1234/statement.pdf",
  "original_filename": "statement.pdf",
  "file_size_bytes": 1048576,
  "mime_type": "application/pdf",
  "job_type": "utility_bill",
  "context": {
    "account_type": "Electricity",
    "utility_account_id": 17,
    "file_count": 1
  },
  "acct_id": null
}
// response (or `{"job_id":..., "status":..., "deduplicated":true}` if the same file was already parsed)
{ "job_id": 1, "status": "pending" }
```

The `s3_key` must live under the authenticated user's `genai-import/{user_id}/`
prefix; cross-user references are rejected. `context` is strictly validated
per `job_type` (see below) — unknown keys return 422.

---

## Job-type integration contract

When wiring a new feature into this pipeline you produce, in order:

1. A **prompt template** under `app/GenAiProcessor/Services/Prompts/` (extends `PromptTemplate`).
2. A `case` in `GenAiJobDispatcherService::buildPrompt()`.
3. A `case` in `GenAiJobDispatcherService::validateContext()` listing the allowed context keys (and validating field types).
4. A `case` in `ParseImportJob::createResults()` that turns AI output into one or more `GenAiImportResult` rows.
5. (If applicable) a `case` in `GenAiJobDispatcherService::buildToolConfig()` to wire a tool/function-call schema.
6. (If applicable) a `case` in `GenAiJobDispatcherService::extractGenerateContentData()` to extract tool-call args.
7. The per-feature **persist endpoint** that reads `GenAiImportResult.result_json`, creates domain rows, and calls `$result->markImported()` (then `$job->markImported()` when no `pending_review` rows remain).
8. A **frontend modal** that uses `useGenAiFileUpload` + `useGenAiJobPolling` and renders a per-result review UI.
9. Add the type to `GenAiImportJob::VALID_JOB_TYPES` and to `GenAiJobType` in `resources/js/genai-processor/types.ts`.

### Context schemas (per job type)

| `job_type`             | Allowed context keys                                                                       |
|------------------------|--------------------------------------------------------------------------------------------|
| `finance_transactions` | `accounts` (array of `{name, last4}`)                                                      |
| `finance_payslip`      | `employment_entity_id`, `file_count`                                                       |
| `utility_bill`         | `account_type`, `utility_account_id`, `file_count`                                         |
| `document_extract`     | `document_id`, `document_kind`, `tax_year`, `form_type`, `accounts`, `input_kind`, `source_form_type` |
| `class_action_email`   | `pasted_text`, `reference_page_text` (no file upload — uses `/paste` endpoint)             |
| `phr_*`                | `patient_id`, `file_count`, `document_id`, `document_type`, `filename_hint`                |

---

## Job status lifecycle

```
pending → processing → parsed → imported
                    ↘ failed (retryable up to MAX_RETRIES = 3)
                    ↘ queued_tomorrow (quota exceeded)
```

| Status            | Description |
|-------------------|-------------|
| `pending`         | Queued and waiting to be picked up by `genai:run-queue` |
| `processing`      | Worker has the job and is calling the AI provider |
| `parsed`          | Results stored as `genai_import_results` rows (status `pending_review`); ready for the per-feature confirm UI |
| `imported`        | Every result has been imported or skipped — see [Imported semantics](#imported-semantics) |
| `failed`          | Processing failed; `error_message` set. User can retry until `retry_count >= MAX_RETRIES`. Admins can requeue beyond that. |
| `queued_tomorrow` | Daily quota exhausted; `scheduled_for` set. `genai:process-scheduled` promotes the job back to `pending` once the quota window resets. |

### Imported semantics

`status = 'imported'` is set by the per-feature persist endpoint: the endpoint
calls `$result->markImported()` after successful persistence, then
`$job->markImported()` once no `pending_review` rows remain. Every job type
follows this contract (`class_action_email`, `utility_bill`, `finance_payslip`,
`finance_transactions`, `phr_*`).

`finance_transactions` is the one type whose persist endpoint
(`POST /api/finance/documents`) is shared with non-GenAI flows (manual CSV /
JSON / TOON entry). The endpoint marks the result imported only when the
caller threads `gen_ai_job_id` and `gen_ai_result_id` through; non-GenAI
callers omit those fields and the marking step no-ops.

---

## Daily quota — system and per-user

Configured by environment variables in `.env`. **The variable names start with `GEMINI_` for historical reasons but count requests across every provider, not just Gemini:**

```dotenv
GEMINI_DAILY_REQUEST_LIMIT=500          # Site-wide cap on AI calls per UTC day
GEMINI_USER_DAILY_REQUEST_LIMIT=-1      # Default per-user cap; -1 = use the system limit only
```

### System-wide quota

`GenAiJobDispatcherService::claimQuota()` atomically increments
`genai_daily_quota.request_count` inside a `lockForUpdate` transaction. When
the site cap is hit, new jobs receive `status = queued_tomorrow` (with
`scheduled_for = tomorrow UTC`). The scheduled job promoter
(`genai:process-scheduled`) resets them to `pending` after midnight UTC.

### Per-user quota

Each user can configure a personal daily limit in **User Settings → GenAI
Daily Quota** at `/dashboard`. Implementation:

- UI: `resources/js/user/genai-quota.tsx`
- Endpoint: `POST /api/user/update-genai-quota`
- Storage: `users.genai_daily_quota_limit` (int; `NULL` = use system limit only, `>= 0` = user cap)
- Enforcement: `GenAiJobDispatcherService::claimQuota()` counts the user's jobs in `['processing', 'parsed', 'imported']` created today UTC. `-1` disables the per-user check.

Only the user themselves can set their per-user quota; admins cannot override.

---

## Admin tooling

Administrators can monitor every GenAI job across all users at
`/admin/genai-jobs`.

- Backend: `app/GenAiProcessor/Http/Controllers/AdminGenAiJobsController.php`
- Frontend: `resources/js/components/admin/AdminGenAiJobsPage.tsx`
- Auth: `admin` gate (requires the `admin` role). The "Admin: GenAI Jobs" link in the user menu is admin-only.

### List view

Paginated (25 per page), most recent first. Columns: id, user, job_type,
status, file size, input/output tokens, created_at, error_message snippet.

### Detail modal

Per-row "Details" button opens a modal with:

- User information and account context
- File metadata (size, S3 path, file hash)
- The full `context_json` that was passed to the prompt template
- The raw `result_json` for each `GenAiImportResult`, expandable
- AI provider / model used (`ai_provider`, `ai_model`)
- Token usage (`input_tokens`, `output_tokens`)
- Full error message on failure

### Admin actions

| Method   | Endpoint                                       | Description |
|----------|------------------------------------------------|-------------|
| `GET`    | `/api/admin/genai-jobs`                        | Paginated list |
| `GET`    | `/api/admin/genai-jobs/{id}`                   | Job + results detail |
| `POST`   | `/api/admin/genai-jobs/{id}/requeue`           | Requeue a failed job, bypassing `MAX_RETRIES` |

**Intentionally not in the admin panel:** editing `result_json` (parsed data
is meant to be reviewed and edited by the user through the per-feature confirm
UI, not silently rewritten by an admin) and bypassing the per-feature confirm
step.

---

## Retry logic

- **Max retries:** `GenAiImportJob::MAX_RETRIES = 3` per job.
- **Transient errors** (rate limit, transient provider errors) — job is marked `failed` and `retry_count` is incremented. The user can retry via `POST /api/genai/import/jobs/{id}/retry`.
- **Fatal errors** (`GenAiFatalException` — corrupt/encrypted PDF, invalid credentials, schema violation) — job is marked `failed` with `retry_count` set to `MAX_RETRIES` immediately, preventing further user retries. Admins can still requeue.
- **Stale jobs** — `genai:requeue-stale` (every 5 minutes) resets any job stuck in `processing` for more than 10 minutes back to `pending`.
- **Invalid credentials** — if the provider rejects the API key, the `UserAiConfiguration` is marked `invalid_api_key` so the next job fails fast with a "please update your API key" message.

---

## Frontend integration

### Shared hooks

- **`useGenAiFileUpload`** (`resources/js/genai-processor/useGenAiFileUpload.ts`) — handles the 3-step upload flow (request signed URL → PUT to S3 → register job). Validates the API responses and throws descriptive errors.
- **`useGenAiJobPolling`** (`resources/js/genai-processor/useGenAiJobPolling.ts`) — polls `GET /api/genai/import/jobs/{id}` every 3 s. Stops automatically on terminal status (`parsed`, `imported`, `failed`, `queued_tomorrow`). Uses exponential backoff on server errors.

### TypeScript types

All defined in `resources/js/genai-processor/types.ts`:
`GenAiJobType`, `GenAiJobStatus`, `GenAiResultStatus`,
`GenAiImportJobData`, `GenAiImportResultData`.

### Expected review-UI shape

Per-feature modals should:

- Show a clear "your file is in the queue" message while `status ∈ {pending, processing}` (the cron-driven queue has up to 60 s latency).
- Render an editable form per `GenAiImportResult` once `status = parsed` (users frequently want to correct field-level errors before persisting).
- Provide **Confirm** and **Skip** actions per result. Confirm calls the feature's persist endpoint; Skip calls a per-feature skip endpoint (or simply omits the result and leaves it in `pending_review`).
- Show a deferral notice when `status = queued_tomorrow` (use `estimatedWait` from the polling hook).
- Show an error and a Retry button when `status = failed`.

### Adding a new job type — checklist

1. New prompt template class under `app/GenAiProcessor/Services/Prompts/`.
2. Register it in `GenAiJobDispatcherService::buildPrompt()`.
3. Add allowed context keys to `GenAiJobDispatcherService::validateContext()`.
4. Add a `case` in `ParseImportJob::createResults()` that emits one `GenAiImportResult` per record.
5. (Optional) `buildToolConfig()` + `extractGenerateContentData()` for tool-call output.
6. Add to `GenAiImportJob::VALID_JOB_TYPES` (PHP) and `GenAiJobType` (TypeScript).
7. Per-feature persist + skip endpoints.
8. Frontend modal using `useGenAiFileUpload` + `useGenAiJobPolling` + a review UI.
9. Feature test for the persist endpoint (happy path, ownership, already-imported).
10. Update this doc — add a row to [Job types](#job-types) and to [Context schemas](#context-schemas-per-job-type).

For an example, see the utility bill implementation:
- Prompt: `app/GenAiProcessor/Services/Prompts/UtilityBillPromptTemplate.php`
- Persist: `app/Http/Controllers/UtilityBillTracker/UtilityBillImportController.php`
- Modal: `resources/js/components/utility-bill-tracker/ImportBillModal.tsx`
- Review card: `resources/js/components/utility-bill-tracker/UtilityBillJobCard.tsx`
- Tests: `tests/Feature/UtilityBillImportTest.php`

The payslip flow now follows the same contract:
- Persist: `app/Http/Controllers/FinanceTool/FinancePayslipImportController.php`
- Modal: `resources/js/components/payslip/PayslipImportModal.tsx`
- Review card: `resources/js/components/payslip/PayslipImportJobCard.tsx`
- Tests: `tests/Feature/FinancePayslipImportTest.php`

---

## File naming convention

```
genai-import/{user_id}/{uuid}/{sanitized_filename}
```

The UUID prefix means re-uploading a file with the same name doesn't collide
in S3 (each upload gets its own key). The sanitized filename preserves a
human-readable download name in S3.

After a result is confirmed into a domain row, the feature is free to copy
the file out of `genai-import/` and into its canonical storage area (e.g.
`utility-bills/{accountId}/{stored_filename}`). The staged file is cleaned up
when the `GenAiImportJob` row is deleted (model `deleting` hook) or by
`orphans:delete`.

---

## Artisan commands

| Command                     | Schedule        | Description |
|-----------------------------|-----------------|-------------|
| `genai:run-queue`           | Every minute    | Pull and process one job from the `genai-imports` queue |
| `genai:process-scheduled`   | Every minute    | Promote deferred jobs whose `scheduled_for` date has arrived back to `pending` |
| `genai:requeue-stale`       | Every 5 minutes | Reset jobs stuck in `processing` for >10 min |
| `orphans:scan`              | Manual          | List S3 files under `genai-import/` not referenced by any job |
| `orphans:delete`            | Manual          | Delete orphaned S3 files (`--dry-run` supported) |

All scheduled commands use `withoutOverlapping()` to prevent concurrent
execution. Schedule lives in `routes/console.php`.

---

## S3 orphan management

Files may become orphaned in S3 if a user starts an upload but never completes
the workflow (e.g. closed the tab before the job was created). Two artisan
commands handle this:

```bash
# List orphaned files (safe, read-only)
php artisan orphans:scan

# Delete orphaned files (use --dry-run first)
php artisan orphans:delete --dry-run
php artisan orphans:delete
```

---

## Database schema

### `genai_import_jobs`

| Column              | Type          | Description |
|---------------------|---------------|-------------|
| `id`                | bigint PK     | Auto-increment |
| `user_id`           | bigint FK     | `users.id` |
| `ai_configuration_id` | bigint FK   | Snapshot of which `user_ai_configurations` row was used (nullable) |
| `ai_provider`       | varchar       | `anthropic` / `bedrock` / `gemini` |
| `ai_model`          | varchar       | e.g. `claude-opus-4-7` |
| `acct_id`           | bigint FK     | Optional reference to `fin_accounts.acct_id` |
| `job_type`          | varchar(64)   | One of `GenAiImportJob::VALID_JOB_TYPES` |
| `file_hash`         | varchar(64)   | S3 ETag (single-part) or SHA-256 for pasted text |
| `original_filename` | varchar(255)  | User-facing filename |
| `s3_path`           | varchar(255)  | Staged S3 key under `genai-import/{user_id}/…` |
| `mime_type`         | varchar(255)  | File MIME type |
| `file_size_bytes`   | bigint        | File size |
| `context_json`      | text          | Job-type-specific context (strictly validated) |
| `status`            | varchar(32)   | See [Lifecycle](#job-status-lifecycle) |
| `error_message`     | text          | Error details on failure |
| `raw_response`      | text          | Full provider response for debugging (admin only) |
| `retry_count`       | tinyint       | Number of retries attempted |
| `scheduled_for`     | date          | When to retry (for `queued_tomorrow`) |
| `parsed_at`         | timestamp     | When parsing completed |
| `input_tokens`      | int           | Provider-reported input token usage |
| `output_tokens`     | int           | Provider-reported output token usage |
| `created_at`        | timestamp     |   |
| `updated_at`        | timestamp     |   |

### `genai_import_results`

| Column         | Type        | Description |
|----------------|-------------|-------------|
| `id`           | bigint PK   | Auto-increment |
| `job_id`       | bigint FK   | `genai_import_jobs.id` (cascade delete) |
| `result_index` | int         | Ordering index within the job |
| `result_json`  | longtext    | Parsed JSON for one record |
| `status`       | varchar(32) | `pending_review`, `imported`, or `skipped` |
| `imported_at`  | timestamp   | Set when status flips to `imported` |
| `created_at`   | timestamp   |   |
| `updated_at`   | timestamp   |   |

### `genai_daily_quota`

| Column          | Type      | Description |
|-----------------|-----------|-------------|
| `usage_date`    | date PK   | UTC date |
| `request_count` | int       | Number of AI calls (any provider) made today |
| `updated_at`    | timestamp |   |

---

## Security

- S3 staging files live under `genai-import/{user_id}/`; pre-signed URLs are scoped to a specific key with a 15-minute TTL.
- `s3_key` on `POST /jobs` is validated to start with the authenticated user's prefix.
- `context_json` is strictly validated per `job_type`; unexpected keys return 422.
- `acct_id` ownership is verified before job creation.
- `result_json` is stored as raw text; each per-feature persist endpoint validates and maps only expected fields before writing to domain tables.
- The AI provider API key is read from the user's active `UserAiConfiguration` at job runtime, never stored in the queue payload.
- Rate limit: 20 `request-upload` calls per minute per user (configurable).

---

## Testing

- Hook tests: `resources/js/genai-processor/__tests__/useGenAiFileUpload.test.ts`, `useGenAiJobPolling.test.ts`.
- Feature tests for the shared pipeline: `tests/Feature/GenAiImportControllerTest.php`, `AdminGenAiJobsControllerTest.php`, `GenAiImportModelsTest.php`, `GenAiJobDispatcherServiceTest.php`.
- For a per-feature confirm/skip example, see `tests/Feature/UtilityBillImportTest.php`. Tests construct `GenAiImportJob` / `GenAiImportResult` rows directly via `::create()` — there are no factories for these models.

---

## Code structure

```
app/GenAiProcessor/
├── Console/Commands/
│   ├── RunGenAiQueue.php              # genai:run-queue
│   ├── ProcessScheduledGenAiJobs.php  # genai:process-scheduled
│   ├── RequeueStaleGenAiJobs.php      # genai:requeue-stale
│   ├── ScanOrphanedFiles.php          # orphans:scan
│   └── DeleteOrphanedFiles.php        # orphans:delete
├── Http/Controllers/
│   ├── GenAiImportController.php      # Shared user-facing endpoints
│   └── AdminGenAiJobsController.php   # Admin endpoints
├── Jobs/
│   └── ParseImportJob.php             # Queue worker
├── Mail/
│   ├── GenAiJobCompleteMail.php       # Completion notification
│   └── GenAiJobDeferredMail.php       # Deferral notification
├── Models/
│   ├── GenAiImportJob.php
│   ├── GenAiImportResult.php
│   └── GenAiDailyQuota.php
└── Services/
    ├── GenAiJobDispatcherService.php  # Quota mgmt, prompt building, context validation, response extraction
    └── Prompts/
        ├── PromptTemplate.php
        ├── FinanceTransactionsPromptTemplate.php
        ├── PayslipPromptTemplate.php
        ├── UtilityBillPromptTemplate.php
        ├── TaxDocumentPromptTemplate.php
        ├── MultiAccountTaxImportPromptTemplate.php
        ├── ClassActionEmailPromptTemplate.php
        └── Phr/PhrPromptTemplate.php

resources/js/genai-processor/
├── types.ts                           # Shared TS types
├── useGenAiFileUpload.ts              # 3-step upload hook
├── useGenAiJobPolling.ts              # Polling hook with backoff
└── __tests__/
    ├── useGenAiFileUpload.test.ts
    └── useGenAiJobPolling.test.ts

resources/js/components/admin/
└── AdminGenAiJobsPage.tsx             # Admin jobs management UI
```
