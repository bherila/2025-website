# GenAI Async Import — Architecture Specification

## Overview

This document specifies a planned upgrade to all AI-powered import flows across the site. Today three controllers call the Gemini API synchronously inside an HTTP request:

| Controller | Tool | Document type |
|---|---|---|
| `FinanceGeminiImportController` | Finance (statements, transactions, lots) | Brokerage/bank PDFs |
| `FinancePayslipImportController` | Finance (payslips) | Pay stub PDFs |
| `UtilityBillImportController` | Utility Bill Tracker | Utility bill PDFs |

All three share the same fundamental problems:

1. **HTTP timeout risk** — Gemini API calls take 30–90 seconds for large PDFs; a server timeout means a lost upload and a retry from scratch.
2. **No resumability** — closing the browser tab loses all progress.
3. **No daily quota enforcement** — no site-wide guard against runaway Gemini API spend.
4. **Code duplication** — authentication, file handling, Gemini HTTP invocation, error handling, and retry logic are copy-pasted across controllers.

The upgraded system introduces a **shared background job queue** for all AI-based file parsing. Each tool continues to present its own dedicated UI. The queue is the integration point; the UI surfaces are independent.

---

## Directory Conventions

Shared, tool-agnostic code lives under a dedicated namespace so it is not buried inside any one feature module:

- **Backend (PHP):** `app/GenAiProcessor/` — models, jobs, services, controllers, and artisan commands
- **Frontend (TypeScript/React):** `resources/js/genai-processor/` — shared hooks and upload utilities

Finance-specific code remains under its existing locations (`app/Http/Controllers/FinanceTool/`, `resources/js/components/finance/`). Payslip-specific code remains in its module. Utility-bill-specific code remains in its module.

---

## Import Modes

### Mode 1 — Immediate parse (CSV / QIF / OFX / HAR / JSON)

Text-based formats are parsed synchronously in the browser via the existing client-side parsers (`parseIbCsv`, `parseQfx`, etc.). This mode is unchanged.

```
User drops file → Browser parses → Preview shown → User confirms → POST /api/finance/{id}/line_items
```

### Mode 2 — Async AI parse (PDF and other binary formats)

```
User selects file
  → Frontend requests signed S3 upload URL (POST /api/genai/import/request-upload)
  → Frontend uploads file directly to S3 using the signed URL (file bytes bypass app server)
  → Frontend registers the job (POST /api/genai/import/jobs)
      → Server creates genai_import_jobs record (status: pending)
      → Server checks daily quota; if exceeded → status: queued_tomorrow, email user
      → Otherwise → dispatch ParseImportJob to the database queue
      → Return { job_id, status }
  → Frontend polls GET /api/genai/import/jobs/{job_id}
  → Worker wakes up (via cron), runs quota check, streams file from S3,
    uploads to Gemini File API, calls generateContent, stores results
  → genai_import_jobs status → parsed; genai_import_results rows created
  → Frontend shows tool-specific "Review Results" UI
  → User reviews and confirms each result → tool-specific persist endpoint
      → Writes data to DB, marks result as imported
```

---

## Data Model

All shared tables use the `genai_` prefix. The `fin_` prefix is reserved for the finance tool.

### `GenAiImportJob` model → `genai_import_jobs` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | auto-increment PK | |
| `user_id` | FK → users | owner; cascade-delete |
| `acct_id` | nullable FK → fin_accounts | set for finance imports; NULL for payslip/utility |
| `job_type` | string(64) | `finance_transactions`, `finance_payslip`, `utility_bill` |
| `file_hash` | string(64) | SHA-256 of the uploaded file (for de-dupe) |
| `original_filename` | string | |
| `s3_path` | string | path within the bucket (e.g. `genai-import/{user_id}/...`) |
| `mime_type` | nullable string | |
| `file_size_bytes` | unsigned bigint | |
| `context_json` | nullable text | JSON blob of tool-specific parameters (accounts list for finance, account_type for utility, employment_entity_id for payslip) |
| `status` | enum | `pending`, `processing`, `parsed`, `imported`, `failed`, `queued_tomorrow` |
| `error_message` | nullable text | populated on failure |
| `retry_count` | unsigned tinyint | incremented on each failure; max 3 |
| `scheduled_for` | nullable date | set when `queued_tomorrow` |
| `parsed_at` | nullable timestamp | |
| `created_at` / `updated_at` | timestamps | |

Eloquent relationships: `belongsTo(User)`, `belongsTo(FinAccount, 'acct_id')->nullable()`, `hasMany(GenAiImportResult)`.

**Status transitions:**

| From | To | When |
|------|----|------|
| `pending` | `processing` | Worker picks up the job |
| `processing` | `parsed` | Gemini returns; `genai_import_results` rows created |
| `processing` | `failed` | Gemini error or timeout |
| `failed` | `pending` | User retries (max 3 per `retry_count`) |
| `pending` | `queued_tomorrow` | Daily quota exhausted at dispatch time |
| `queued_tomorrow` | `pending` | Scheduler promotes on a new day when quota resets |
| `parsed` | `imported` | All results confirmed or skipped |

### `GenAiImportResult` model → `genai_import_results` table

A single job can produce **multiple results** — for example, a concatenated PDF containing three payslips produces three result rows.

| Column | Type | Notes |
|--------|------|-------|
| `id` | auto-increment PK | |
| `job_id` | FK → genai_import_jobs | cascade-delete |
| `result_index` | unsigned int | ordering within the job |
| `result_json` | longtext | raw parsed output from Gemini; validated before commit |
| `status` | enum | `pending_review`, `imported`, `skipped` |
| `imported_at` | nullable timestamp | |

Eloquent relationships: `belongsTo(GenAiImportJob)`.

### `GenAiDailyQuota` model → `genai_daily_quota` table

| Column | Type | Notes |
|--------|------|-------|
| `usage_date` | date (PK) | UTC calendar date |
| `request_count` | unsigned int | Gemini API calls made today (site-wide) |
| `updated_at` | timestamp | |

---

## Milestone Plan

---

### Milestone 1 — Shared Infrastructure

**Why first:** All other milestones depend on the shared data model, job class, service, and API endpoints. No user-facing changes; can be merged independently.

#### 1a. Database migrations

Create three migrations using `php artisan make:migration`:
- `create_genai_import_jobs_table` — model above. Index on `(user_id, status)`, `(file_hash)`, `(scheduled_for, status)`.
- `create_genai_import_results_table` — model above. Index on `(job_id, result_index)`.
- `create_genai_daily_quota_table` — model above.

Follow the existing repository pattern for SQLite compatibility (omit foreign-key constraints for SQLite; branch on `DB::getDriverName()` in the migration). Update `database/schema/sqlite-schema.sql` accordingly.

#### 1b. `ParseImportJob` — queue worker

Location: `app/GenAiProcessor/Jobs/ParseImportJob.php`

The job holds a `job_id`. When it runs:

1. Load the `GenAiImportJob`. If status is not `pending`, exit silently (stale dispatch).
2. Call `GenAiJobDispatcherService::claimQuota($userId)`. If quota is exhausted, set `queued_tomorrow` + email user, exit.
3. Set status to `processing`.
4. Generate a short-lived signed read URL for the S3 object.
5. Stream the file from S3 and upload it to the Gemini File API (resumable upload). Receive a `file_uri`.
6. Call `generateContent` using `file_data: { mime_type, file_uri }` with model `gemini-3-flash-preview`. Prompt built by `GenAiJobDispatcherService::buildPrompt()`.
7. Parse the response. Create one `GenAiImportResult` row per logical record detected (a concatenated PDF may yield multiple).
8. On success: set job `status = parsed`, set `parsed_at`.
9. On Gemini error or timeout: set `status = failed`, store `error_message`, increment `retry_count`. Email user.
10. Delete the file from Gemini File API (files auto-expire in 48 h, but explicit deletion is good practice).

Laravel queue settings: `$timeout = 300`, `$tries = 1` (automatic queue retries disabled; retries are user-initiated via API).

#### 1c. `GenAiJobDispatcherService`

Location: `app/GenAiProcessor/Services/GenAiJobDispatcherService.php`

- `claimQuota(int $userId): bool` — atomically increments `genai_daily_quota.request_count` for today (UTC). Returns `false` if the site-wide limit (`GEMINI_DAILY_REQUEST_LIMIT`, default `15`) is reached. If `GEMINI_USER_DAILY_REQUEST_LIMIT` ≥ 0 (default `-1` = disabled), also checks a per-user count stored in the same table or a companion model. Site-wide check takes precedence.
- `buildPrompt(string $jobType, array $context): string` — returns the Gemini prompt for the given job type. Extracts prompt-building logic from the existing three controllers.

Supported `job_type` values and their prompt sources:
- `finance_transactions` — `FinanceGeminiImportController::getTransactionPrompt()` + `normalizeMultiAccountResponse()`
- `finance_payslip` — `FinancePayslipImportController::getPrompt()`
- `utility_bill` — `UtilityBillImportController::getPrompt()` with `account_type` from context

All job types use model `gemini-3-flash-preview`.

#### 1d. API routes

Add to `routes/api.php` under `['web', 'auth']` middleware, controller `app/GenAiProcessor/Http/Controllers/GenAiImportController.php`:

```
POST   /api/genai/import/request-upload      requestUpload
POST   /api/genai/import/jobs                createJob
GET    /api/genai/import/jobs                index
GET    /api/genai/import/jobs/{job_id}       show
POST   /api/genai/import/jobs/{job_id}/retry retry
DELETE /api/genai/import/jobs/{job_id}       destroy
```

All endpoints enforce ownership (403 if the authenticated user does not own the job).

**`requestUpload`:** Generates and returns a short-lived S3 pre-signed PUT URL plus the intended S3 key. File bytes never pass through the application server.

**`createJob`:** Accepts `{ s3_key, original_filename, file_size_bytes, mime_type, job_type, context?, acct_id? }`. Computes SHA-256 by streaming the file from S3. Checks for an existing `(file_hash, user_id, job_type)` job with status `parsed` or `imported` and returns it immediately (de-dupe). Otherwise creates the job, checks quota, and dispatches.

**`retry`:** Resets status to `pending` and re-dispatches. Returns 422 if `retry_count >= 3`.

**`destroy`:** Deletes the `GenAiImportJob` and all `GenAiImportResult` rows, then deletes the file from S3. This is the user-facing "delete job history" action.

#### 1e. Queue configuration

Use the `database` queue driver (`QUEUE_CONNECTION=database`). Name the queue `genai-imports` to keep it separate from the default queue. Configure in `config/queue.php`.

---

### Milestone 2 — Scheduled Processing & Cron Setup

**Why second:** The quota system is only useful once the scheduler drives queue processing. The hosting environment does not support persistent worker processes, so the scheduler replaces `queue:work` as a daemon.

#### 2a. Artisan commands

Location: `app/GenAiProcessor/Console/Commands/`

- `genai:run-queue` — runs `queue:work --queue=genai-imports --once` to process a batch of ready jobs. Called every minute by the scheduler.
- `genai:process-scheduled` — promotes `queued_tomorrow` jobs whose `scheduled_for` ≤ today to `pending` and dispatches them (re-checking quota per job; stops if quota exhausted).
- `genai:requeue-stale` — resets `processing` jobs older than 10 minutes to `pending` (crash recovery).

#### 2b. Scheduler registration (`routes/console.php`)

```php
Schedule::command('genai:run-queue')->everyMinute()->withoutOverlapping(10);
Schedule::command('genai:process-scheduled')->everyMinute()->withoutOverlapping(5);
Schedule::command('genai:requeue-stale')->everyFiveMinutes()->withoutOverlapping(5);
```

`withoutOverlapping()` uses an atomic cache lock to prevent concurrent runs. This is the only concurrency-safety mechanism needed since there is no persistent worker process.

#### 2c. Cron entry

```
* * * * * cd /path/to/app && php artisan schedule:run >> /dev/null 2>&1
```

#### 2d. Email notifications

- **Deferred:** When a job is set to `queued_tomorrow`, send `GenAiJobDeferredMail` to the user explaining the deferral.
- **Complete:** When a deferred job eventually finishes (success or failure), send `GenAiJobCompleteMail`.

Mail classes live in `app/GenAiProcessor/Mail/`. In development/test, `MAIL_MAILER=log` routes all mail to the log for verification.

---

### Milestone 3 — Direct S3 Upload & Gemini File API Integration

**Why a dedicated milestone:** The file upload path fundamentally changes for all three tools (browser → S3 directly; Gemini receives a File API URI instead of inline base64). Implementing this once as shared infrastructure avoids duplication.

#### 3a. S3 signed upload flow

The frontend requests a signed PUT URL, uploads directly, then notifies the backend:

```
Frontend                                Backend                   S3
  |-- POST /api/genai/import/request-upload -->                   |
  |<-- { signed_url, s3_key, expires_in } ------                  |
  |-- PUT {signed_url} (file bytes) ----------------------->      |
  |<-- 200 OK -------------------------------------------------   |
  |-- POST /api/genai/import/jobs { s3_key, ... } -->             |
  |<-- { job_id, status } ------                                  |
```

The S3 key format mirrors the existing convention (`HasFileStorage::generateStoredFilename()`):

```
genai-import/{user_id}/{YYYY.MM.DD} {random5} {sanitized_filename}
```

`{random5}` = `substr(bin2hex(random_bytes(4)), 0, 5)`.

#### 3b. Gemini File API integration

Gemini's `inline_data` (base64 in the request body) has a 20 MB limit and adds overhead for large PDFs. The worker uses the Gemini Files API instead:

1. Worker generates a short-lived signed **read** URL for the S3 object.
2. Worker streams the file from S3 and uploads it to the Gemini File API (resumable upload). The response contains a `file_uri` (e.g. `files/abc123`).
3. The `generateContent` call uses `file_data: { mime_type, file_uri }` — no base64, no size limit from inline data.
4. After `generateContent` returns, the worker explicitly deletes the file from Gemini File API.

See [Gemini File API documentation](https://ai.google.dev/gemini-api/docs/files) for the resumable upload protocol and `file_data` usage.

#### 3c. Shared TypeScript upload utility

Location: `resources/js/genai-processor/useGenAiFileUpload.ts`

Encapsulates the two-step upload (request signed URL → PUT to S3 → register job):

```typescript
export type GenAiJobType = 'finance_transactions' | 'finance_payslip' | 'utility_bill'

export interface GenAiUploadOptions {
  jobType: GenAiJobType
  acctId?: number
  context?: Record<string, unknown>
}

export function useGenAiFileUpload(options: GenAiUploadOptions): {
  upload: (file: File) => Promise<{ jobId: number; status: GenAiJobStatus }>
  uploading: boolean
  error: string | null
}
```

All three tool-specific upload UIs import this hook and handle the post-upload polling themselves.

#### 3d. Shared polling hook

Location: `resources/js/genai-processor/useGenAiJobPolling.ts`

```typescript
export type GenAiJobStatus =
  'pending' | 'processing' | 'parsed' | 'imported' | 'failed' | 'queued_tomorrow'

export function useGenAiJobPolling(jobId: number | null): {
  status: GenAiJobStatus | null
  results: GenAiImportResultData[]   // one entry per parsed record
  error: string | null
  estimatedWait?: string             // set when queued_tomorrow
}
```

- Polls `GET /api/genai/import/jobs/{job_id}` every 3 seconds while `pending` or `processing`.
- Stops on `parsed`, `imported`, `failed`, or `queued_tomorrow`.
- Exponential backoff on consecutive 5xx (3 s → 6 s → 12 s → max 30 s).

Shared types live in `resources/js/genai-processor/types.ts`.

---

### Milestone 4 — Finance Transactions & Statements UI

**Why:** Highest-traffic import path. Migrates `useProcessPdfWithGemini.ts` and `ImportTransactions.tsx` to the new async flow.

#### 4a. Backend

- Deprecate the direct Gemini call in `FinanceGeminiImportController::parseDocument()`. Guard with feature flag `GEMINI_USE_QUEUE` (default `false`; flip to `true` once stable). When true, the method returns a 410 directing callers to the new endpoints.
- `StatementController::importMultiAccountPdf()` — after persisting data, mark the corresponding `GenAiImportResult` rows `imported`.

#### 4b. Frontend

Replace `useProcessPdfWithGemini.ts` with `useGenAiFileUpload(job_type='finance_transactions')` + `useGenAiJobPolling`. `ImportTransactions.tsx` gains these states:

| State | UI |
|-------|----|
| `idle` | Drop zone / file picker |
| `uploading` | "Uploading file…" progress indicator |
| `queued` (pending/processing) | "Processing with AI… (job #42)" animated indicator |
| `queued_tomorrow` | "Daily AI limit reached. Your file will be processed tomorrow." |
| `parsed` | Existing account-block preview cards (unchanged) |
| `error` (failed) | Error message + Retry button (max 3 retries) |

---

### Milestone 5 — Payslip Import UI

**Why:** `FinancePayslipImportController` currently writes directly to the DB without a review step. This milestone migrates it to the async flow and introduces a review step for consistency with the finance transactions flow.

#### 5a. Backend

Replace the synchronous Gemini call with `GenAiJobDispatcherService::buildPrompt()`. The parsed result contains one `GenAiImportResult` per payslip found (a single PDF may contain multiple payslips).

Add `POST /api/finance/payslips/from-result/{result_id}`: creates a `FinPayslip` record from a `GenAiImportResult` and marks it `imported`. `employment_entity_id` (passed via `context_json`) is applied at this step.

#### 5b. Frontend

- Replace the direct upload call with `useGenAiFileUpload(job_type='finance_payslip')`.
- After `status === 'parsed'`, show a list of detected payslips. Each has a "Review & Import" button.
- UI states: idle → uploading → queued / queued_tomorrow → results list → imported.

---

### Milestone 6 — Utility Bill Import UI

**Why:** Same pattern as Milestone 5 for `UtilityBillImportController`.

#### 6a. Backend

Replace the synchronous Gemini call. Pass `account_type` and `utility_account_id` in `context_json`. Add `POST /api/utility-bills/from-result/{result_id}` to create a `UtilityBill` and mark the result `imported`.

#### 6b. Frontend

- Replace the direct upload call with `useGenAiFileUpload(job_type='utility_bill')`.
- After parsing, show detected bills with "Review & Import" buttons.
- UI states mirror Milestone 5.

---

### Milestone 7 — Review and Insert Results

**Why a dedicated milestone:** The review UX is the critical user-facing experience for each tool. It can be designed and built incrementally once the async pipeline is in place.

**Core concept:** Once a job reaches `parsed` status, the user sees one review card per `GenAiImportResult`. Each card shows extracted data, a "View Source PDF" link (short-lived signed S3 read URL), and Accept / Skip actions. Accepting commits the result to the DB and marks it `imported`. Skipping marks it `skipped`. The parent job becomes `imported` once all results are `imported` or `skipped`.

#### 7a. Finance (Statements & Transactions)

The existing account-block preview flow already provides a review step. Updates needed:
- Read from `GenAiImportResult.result_json` instead of in-memory state.
- Include "View Source PDF" link on each block.
- After all blocks confirmed, mark job and results `imported`.

#### 7b. Payslip Review

When the user clicks "Review & Import" for a payslip result:
- Navigate to (or open a modal using) the **New/Add Payslip** page with all fields pre-populated from `result_json`.
- Include a **"View Source PDF"** link that opens the original PDF in a new tab via a signed S3 URL.
- All fields are editable before saving. Saving calls `POST /api/finance/payslips/from-result/{result_id}`, marks the result `imported`, and returns to the job results list.

#### 7c. Utility Bill Review

When the user clicks "Review & Import" for a utility bill result:
- Navigate to (or open a modal using) the **New/Add Utility Bill** form with fields pre-populated from `result_json`.
- Include a **"View Source PDF"** link.
- Saving calls `POST /api/utility-bills/from-result/{result_id}` and marks the result `imported`.

#### 7d. Job History Page

A new page lists the user's `GenAiImportJob` records in reverse chronological order. Accessible from each tool's navigation. Each row shows: filename, job type, status, creation date, result count. Actions:
- Click a job to resume reviewing incomplete results.
- Delete a job (with confirmation). Deletion removes the DB record, all result rows, and the S3 file.

Job history is retained indefinitely (no automatic purge). Users manage their own history via the delete action.

---

### Milestone 8 — Cleanup & Documentation

**Why last:** Remove old synchronous paths only after all UIs are migrated and the feature flag is flipped in production.

- Remove `GEMINI_USE_QUEUE` feature flag and synchronous code paths in all three controllers.
- Update `docs/finance/FinanceTool.md` and `STATEMENTS_AND_IMPORT.md`.
- PHP feature test coverage: `GenAiImportController` (all endpoints), `ParseImportJob` (mocked dispatcher), `genai:process-scheduled` command, quota enforcement (happy path + quota-exceeded).
- TypeScript/Jest coverage: `useGenAiFileUpload`, `useGenAiJobPolling`.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Browser                               │
│  Finance Import │ Payslip Import │ Utility Bill Import   │
│          ↓ useGenAiFileUpload (shared)                  │
└──────────┬──────────────────────────────────┬───────────┘
           │ 1. POST request-upload            │ 3. POST /jobs
           ▼                                   ▼
  ┌──────────────────┐             ┌──────────────────────────┐
  │ GenAiImportCtrl  │             │   GenAiImportController   │
  │ returns signed   │             │   creates job record,     │
  │ S3 PUT URL       │             │   dispatches to queue     │
  └──────────────────┘             └────────────┬─────────────┘
           │                                    │
           │ 2. PUT file directly to S3         │ dispatches
           ▼                                    ▼
      ┌─────────┐                  ┌────────────────────────┐
      │   S3    │                  │  genai-imports queue    │
      └────┬────┘                  │  (database driver)      │
           │                       └───────────┬────────────┘
           │                                   │ cron every minute
           │                                   ▼
           │                       ┌───────────────────────┐
           │                       │    ParseImportJob      │
           │                       │  • claimQuota()        │
           │ signed read URL       │  • stream from S3 ─────│──→ Gemini File API
           └──────────────────────→│  • upload to Gemini    │       ↓ file_uri
                                   │  • generateContent     │
                                   │  • delete from Gemini  │
                                   │  • create results      │
                                   └───────────┬────────────┘
                                               │
                                               ▼
                                  genai_import_results (1..N rows)
                                               │
                                               │ UI polls
                                               ▼
                                  Tool-specific Review UI
                                               │ user confirms each result
                                               ▼
                                  Tool-specific persist endpoint
                                  (marks result imported)
```

---

## Global Daily API Quota

```dotenv
GEMINI_DAILY_REQUEST_LIMIT=15          # Site-wide max Gemini calls per UTC calendar day
GEMINI_USER_DAILY_REQUEST_LIMIT=-1     # Per-user limit; -1 = disabled (default)
```

`GenAiJobDispatcherService::claimQuota()` atomically increments `genai_daily_quota.request_count` for today. Jobs that cannot be dispatched receive `status = queued_tomorrow` and the user is emailed. The `genai:process-scheduled` command (runs every minute) promotes eligible deferred jobs when quota resets at midnight UTC.

---

## Security Considerations

- S3 objects are stored under `genai-import/{user_id}/`; pre-signed URLs are scoped to the specific key and have short TTLs (15 minutes for upload, configurable for read).
- After a file is uploaded to S3, the server validates MIME type and size before creating the job.
- `result_json` is stored as raw text. Each tool's persist endpoint validates and maps only the expected fields — raw JSON is never passed through blindly.
- `job_type` is validated against a fixed allowlist before dispatch (422 for unknown types).
- `context_json` is only consumed inside trusted server-side job processing; it is never returned to the browser as-is.
- The Gemini API key is read from `user->getGeminiApiKey()` at job runtime, never stored in the queue payload.
- Rate limit: 20 `request-upload` calls per minute per user to prevent queue flooding.

---

## File Naming Convention

```
genai-import/{user_id}/{YYYY.MM.DD} {random5} {sanitized_filename}
```

`{random5}` = `substr(bin2hex(random_bytes(4)), 0, 5)` — matching `HasFileStorage::generateStoredFilename()`.

---

## Caching

The existing per-request Laravel cache (keyed by `file_hash + context_hash`, TTL 1 hour) continues to work as a fast-path de-dupe before a job is dispatched. The `genai_import_jobs` / `genai_import_results` records provide a persistent layer that survives cache eviction and is resumable across browser sessions.
