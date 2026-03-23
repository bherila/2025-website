# Finance & AI Import — Future Architecture Specification

## Overview

This document specifies a planned upgrade to all AI-powered import flows across the site. Today there are **three controllers** that call the Gemini API synchronously inside an HTTP request:

| Controller | Tool | PDF type parsed |
|---|---|---|
| `FinanceGeminiImportController` | Finance (statements, transactions, lots) | Brokerage/bank PDFs |
| `FinancePayslipImportController` | Finance (payslips) | Pay stub PDFs |
| `UtilityBillImportController` | Utility Bill Tracker | Utility bill PDFs |

All three share the same fundamental problems:

1. **HTTP timeout risk** — Gemini API calls take 30–90 seconds for large PDFs; a server timeout causes the user to see an error and retry from scratch.
2. **No resumability** — If the browser tab is closed mid-import, all progress is lost.
3. **No daily quota enforcement** — There is no site-wide check preventing runaway Gemini API spend.
4. **Code duplication** — Authentication, file handling, Gemini HTTP invocation, error handling, and retry logic are copy-pasted across all three controllers.

The upgraded system introduces a **shared background job queue** for all AI-based file parsing. Each tool continues to present its own dedicated user-interface experience. The queue is the integration point; the UI surfaces are independent.

---

## Import Modes (unchanged for text formats)

### Mode 1 — Immediate parse (CSV / QIF / OFX / HAR / JSON)

Text-based formats are parsed synchronously in the browser using the existing client-side parsers (`parseIbCsv`, `parseQfx`, etc.). This mode is unchanged.

```
User drops file → Browser parses → Preview shown → User confirms → POST /api/finance/{id}/line_items
```

### Mode 2 — Background AI parse (PDF and other binary formats)

Any file that cannot be parsed in the browser is uploaded to S3 immediately and a `fin_import_job` record is created. The Laravel queue worker picks up the job, calls the Gemini API, and stores the parsed result. The originating page polls for job completion and shows the parsed preview when ready.

```
User drops file
  → POST /api/import/upload  (tool-specific metadata via query param or form field)
      → SHA-256 de-dupe check
      → Store file in S3
      → Create fin_import_job (status: pending)
      → Check daily quota; if exceeded → status: queued_tomorrow
      → Dispatch ParseImportFileJob (or schedule for next day)
      → Return { job_id, status }
  → UI polls GET /api/import/jobs/{job_id}
  → Queue worker runs → calls Gemini API
  → Worker stores parsed JSON (status: parsed)
  → UI shows tool-specific preview
  → User confirms → tool-specific confirm endpoint
      → Persist data to DB
      → Mark fin_import_job status: imported
```

---

## Milestone Plan

---

### Milestone 1 — Shared Infrastructure

**Why first:** Everything else depends on the database table, the job class, and the queue configuration. This milestone has no user-facing changes and can be merged independently.

**Requirements:**

#### 1a. Database migration — `fin_import_jobs` table

Run with `php artisan make:migration create_fin_import_jobs_table`.

```sql
CREATE TABLE fin_import_jobs (
  id                BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id           BIGINT UNSIGNED NOT NULL,
  /*
   * NULL for payslips (user-level, not account-level).
   * NULL for utility bills: the utility account_id is passed via context_json instead,
   * because utility accounts live in a separate table (utility_accounts) and do not
   * reference fin_accounts.
   */
  acct_id           BIGINT UNSIGNED NULL,
  /* Identifies which worker/prompt to use: 'finance_transactions', 'finance_payslip', 'utility_bill' */
  job_type          VARCHAR(64) NOT NULL,
  file_hash         VARCHAR(64) NOT NULL,       -- SHA-256 of the uploaded file
  original_filename VARCHAR(255) NOT NULL,
  s3_path           VARCHAR(255) NOT NULL,
  mime_type         VARCHAR(127) NULL,
  file_size_bytes   BIGINT UNSIGNED NOT NULL,
  /* Serialised JSON carrying job-type-specific inputs (e.g. accounts context for finance, account_type for utility) */
  context_json      TEXT NULL,

  status            ENUM('pending','processing','parsed','imported','failed','queued_tomorrow')
                      NOT NULL DEFAULT 'pending',
  error_message     TEXT NULL,
  parsed_json       LONGTEXT NULL,              -- Raw Gemini response; validated before use
  retry_count       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  parsed_at         TIMESTAMP NULL,
  imported_at       TIMESTAMP NULL,
  scheduled_for     DATE NULL,                 -- Set when status = queued_tomorrow

  created_at        TIMESTAMP NULL,
  updated_at        TIMESTAMP NULL,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (acct_id) REFERENCES fin_accounts(acct_id) ON DELETE SET NULL,
  INDEX idx_import_jobs_user_status (user_id, status),
  INDEX idx_import_jobs_file_hash (file_hash),
  INDEX idx_import_jobs_scheduled (scheduled_for, status)
);
```

Also add to `database/schema/sqlite-schema.sql`. Because SQLite does not support `ALTER TABLE ADD CONSTRAINT` and has known issues with `FOREIGN KEY` declarations in the presence of existing unique constraints, follow the existing repository pattern: use `DB::statement()` inside a `DB::getDriverName() === 'sqlite'` branch in the migration file to create the table with a compatible DDL (omit `FOREIGN KEY` clauses entirely for SQLite; the test suite relies on the SQLite schema). Consider extracting this branching logic into a reusable migration helper trait if multiple migrations need it.

**Status transitions:**

| From | To | When |
|------|----|------|
| `pending` | `processing` | Worker picks up the job |
| `processing` | `parsed` | Gemini API returns successfully |
| `processing` | `failed` | Gemini API error or timeout |
| `parsed` | `imported` | User confirms import |
| `failed` | `pending` | User retries (up to max retries) |
| `pending` | `queued_tomorrow` | Daily quota exceeded at dispatch time |
| `queued_tomorrow` | `pending` | Nightly scheduler re-queues for next day |

#### 1b. Daily quota tracking — `fin_gemini_daily_usage` table

Run with `php artisan make:migration create_fin_gemini_daily_usage_table`.

```sql
CREATE TABLE fin_gemini_daily_usage (
  usage_date   DATE NOT NULL PRIMARY KEY,
  request_count INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at   TIMESTAMP NULL
);
```

The `GEMINI_DAILY_REQUEST_LIMIT` environment variable (default: `500`) defines the global maximum Gemini API calls per calendar day (UTC). This is checked atomically before dispatching any job. Jobs submitted when the quota is exhausted receive `status = queued_tomorrow`.

#### 1c. `ParseImportFileJob` — Shared queue worker

Location: `app/Jobs/ParseImportFileJob.php`

```php
class ParseImportFileJob implements ShouldQueue
{
    public int $timeout = 300;  // 5 minutes
    // Automatic queue retries are disabled ($tries = 1). On failure, the error is
    // recorded in fin_import_jobs.error_message and the user can manually retry via
    // POST /api/import/jobs/{id}/retry (up to retry_count max).
    public int $tries   = 1;

    public function __construct(public readonly int $importJobId) {}

    public function handle(GeminiJobDispatcherService $dispatcher): void
    {
        $job = FinImportJob::findOrFail($this->importJobId);

        if ($job->status !== 'pending') {
            return; // stale dispatch, skip silently
        }

        // Atomic quota check-and-increment
        if (! $dispatcher->claimQuota()) {
            $job->update(['status' => 'queued_tomorrow', 'scheduled_for' => now()->addDay()->toDateString()]);
            return;
        }

        $job->update(['status' => 'processing']);

        try {
            $fileContent = Storage::get($job->s3_path);
            $context     = json_decode($job->context_json ?? '{}', true);

            $parsed = $dispatcher->runPrompt($job->job_type, $fileContent, $context, $job->user_id);

            $job->update([
                'status'      => 'parsed',
                'parsed_json' => json_encode($parsed),
                'parsed_at'   => now(),
            ]);
        } catch (GeminiRateLimitException) {
            $job->update(['status' => 'queued_tomorrow', 'scheduled_for' => now()->addDay()->toDateString()]);
        } catch (Throwable $e) {
            $job->update([
                'status'        => 'failed',
                'error_message' => $e->getMessage(),
                'retry_count'   => DB::raw('retry_count + 1'),
            ]);
        }
    }
}
```

#### 1d. `GeminiJobDispatcherService`

Location: `app/Services/GeminiJobDispatcherService.php`

Responsibilities:
- `claimQuota(): bool` — Atomically increments `fin_gemini_daily_usage.request_count` for today (UTC) and returns `false` if the new value exceeds `GEMINI_DAILY_REQUEST_LIMIT`. Implemented using `INSERT ... ON DUPLICATE KEY UPDATE` (see the "Atomic quota increment" section below for the canonical SQL). Returns `true` only if the post-increment count is ≤ the limit. No surrounding transaction is needed for MySQL because the single statement is already atomic.
- `runPrompt(string $jobType, string $fileContent, array $context, int $userId): array` — Routes to the correct prompt builder and Gemini invocation based on `$jobType`. Extracts shared logic (HTTP call, JSON decode, retry with exponential backoff) from the three existing controllers.

Supported `$jobType` values:
- `finance_transactions` — uses `FinanceGeminiImportController::getTransactionPrompt()` + `normalizeMultiAccountResponse()`
- `finance_payslip` — uses `FinancePayslipImportController::getPrompt()`
- `utility_bill` — uses `UtilityBillImportController::getPrompt()` with `account_type` from context

#### 1e. Queue configuration

In `config/queue.php`, add an `imports` connection/queue. The existing database or redis driver can be used; the `imports` queue is processed by a dedicated worker so it does not starve other jobs.

#### 1f. Shared API routes

Add to `routes/api.php` under `['web', 'auth']` middleware:

```
POST   /api/import/upload                  → ImportJobController@upload
GET    /api/import/jobs/{job_id}           → ImportJobController@show
GET    /api/import/jobs                    → ImportJobController@index
POST   /api/import/jobs/{job_id}/retry     → ImportJobController@retry
POST   /api/import/jobs/{job_id}/cancel    → ImportJobController@cancel
```

`ImportJobController` enforces ownership (user may only access their own jobs, 403 otherwise).

**Upload endpoint details:**

```
POST /api/import/upload
```

Form fields:
- `file` (required) — the PDF or other binary file
- `job_type` (required) — one of `finance_transactions`, `finance_payslip`, `utility_bill`
- `acct_id` (optional) — finance account ID; NULL for payslips and utility bills where irrelevant
- `context` (optional JSON string) — arbitrary key/value context passed through to the prompt builder (e.g., `accounts` array for finance, `account_type` for utility)

Behavior:
1. Compute SHA-256 of the uploaded file.
2. Check for an existing `fin_import_job` for `(file_hash, user_id, job_type)`. If `status` is `parsed` or `imported`, return immediately (cache hit).
3. Store file in S3 at `fin_import/{user_id}/{date} {random5} {original_filename}` (mirrors `HasFileStorage::generateStoredFilename()`).
4. Check daily quota. If exceeded, create job with `status = queued_tomorrow`.
5. Otherwise, create job with `status = pending` and dispatch `ParseImportFileJob`.
6. Return `{ job_id, status }`.

**Retry endpoint:**

- Maximum retries: 3 (controlled by `retry_count`). After 3 failed attempts the endpoint returns 422.
- Resets `status = pending` and re-dispatches.

---

### Milestone 2 — Scheduled Processing & Cron Setup

**Why second:** The daily quota system is only useful once the scheduler can drain the `queued_tomorrow` backlog and reset the day's counter.

**Requirements:**

#### 2a. Artisan commands

```
php artisan import:process-scheduled       # Promote queued_tomorrow → pending for today's date
php artisan import:requeue-stale           # Reset processing > 10 min → pending (worker crash recovery)
php artisan import:reset-daily-quota       # Optionally reset quota counter (for testing; prod uses date change)
```

#### 2b. Laravel scheduler registration

In `routes/console.php` (Laravel 12 uses this file for schedule definitions):

```php
// Run every minute: promote jobs whose scheduled_for date has arrived
Schedule::command('import:process-scheduled')->everyMinute();

// Run every 5 minutes: recover stale processing jobs from crashed workers
Schedule::command('import:requeue-stale')->everyFiveMinutes();
```

#### 2c. Cron entry on the server

Add a single cron entry that delegates everything to Laravel's scheduler:

```cron
* * * * * cd /var/www/html && php artisan schedule:run >> /dev/null 2>&1
```

This is the standard Laravel cron pattern. The `schedule:run` command checks the schedule on every minute tick and dispatches only the commands that are due.

**Tip:** On production, use a process manager (Supervisor, systemd) to keep at least one queue worker running on the `imports` queue:

```ini
[program:laravel-imports-worker]
command=php /var/www/html/artisan queue:work --queue=imports --sleep=3 --tries=1 --timeout=300
autostart=true
autorestart=true
```

#### 2d. `import:process-scheduled` implementation

```php
// Fetch all jobs where scheduled_for <= today AND status = queued_tomorrow
FinImportJob::where('status', 'queued_tomorrow')
    ->whereDate('scheduled_for', '<=', now()->toDateString())
    ->orderBy('created_at')
    ->chunk(50, function ($jobs) {
        foreach ($jobs as $job) {
            // Re-check daily quota before re-dispatching each job
            if (app(GeminiJobDispatcherService::class)->claimQuota()) {
                $job->update(['status' => 'pending', 'scheduled_for' => null]);
                ParseImportFileJob::dispatch($job->id)->onQueue('imports');
            } else {
                // Quota full for today; push to next day
                $job->update(['scheduled_for' => now()->addDay()->toDateString()]);
                break; // No point continuing; quota is exhausted for the day
            }
        }
    });
```

---

### Milestone 3 — Finance Transactions & Statements Import UI

**Why:** This is the highest-traffic import path. It affects `ImportTransactions.tsx`, `useProcessPdfWithGemini.ts`, and the existing `POST /api/finance/transactions/import-gemini` route.

**Why separate from Milestone 1:** The shared infrastructure can be tested independently before hooking up the first UI.

**Requirements:**

#### 3a. Backend

- Deprecate the direct Gemini call in `FinanceGeminiImportController::parseDocument()`. Keep the method for backward compatibility but add a feature flag: if `GEMINI_USE_QUEUE=true` (default `false` during transition, then `true` once stable), redirect to the new upload endpoint instead.
- `StatementController::importMultiAccountPdf()` — after persisting data, update the matching `fin_import_job` to `status = imported`.

#### 3b. Frontend hook migration — `useProcessPdfWithGemini.ts`

Replace the direct `POST /api/finance/transactions/import-gemini` call with:

```typescript
// 1. Upload file and receive job_id
const { job_id } = await fetchWrapper.post('/api/import/upload', formData)
// formData includes: file, job_type='finance_transactions', acct_id, context=JSON(accountsCtx)

// 2. Poll until parsed
// → delegates to useJobPolling(job_id)
```

#### 3c. `useJobPolling` hook

Location: `resources/js/hooks/useJobPolling.ts`

```typescript
export type ImportJobStatus = 'pending' | 'processing' | 'parsed' | 'imported' | 'failed' | 'queued_tomorrow'

export interface UseJobPollingResult {
  status: ImportJobStatus | null
  parsedData: unknown | null
  error: string | null
  estimatedWait?: string  // e.g. "processing tomorrow" when queued_tomorrow
}

export function useJobPolling(jobId: number | null): UseJobPollingResult
```

- Polls `GET /api/import/jobs/{job_id}` every **3 seconds** while `status` is `pending` or `processing`.
- Stops polling when `status` is `parsed`, `imported`, or `failed`.
- When `status` is `queued_tomorrow`, stops polling (no point polling; the job will not advance until the scheduler runs) and sets `estimatedWait` in the `UseJobPollingResult` to a human-readable message (e.g., `"processing tomorrow"`) that the calling component can display.
- Applies exponential backoff (3 s → 6 s → 12 s → max 30 s) on consecutive 5xx responses.

#### 3d. `ImportTransactions.tsx` UI states

| State | UI shown |
|-------|----------|
| `idle` | Drop zone / file picker |
| `uploading` | Spinner: "Uploading file…" |
| `queued` (`pending`/`processing`) | Animated progress bar: "Processing with AI… (job #42)" |
| `queued_tomorrow` | Info banner: "Daily AI processing limit reached. Your file is queued and will be processed tomorrow." |
| `parsed` | Existing preview cards (account blocks, transactions, lots) |
| `error` (`failed`) | Error banner with Retry button (up to 3 times) |

The Retry button calls `POST /api/import/jobs/{job_id}/retry`.

---

### Milestone 4 — Payslip Import UI

**Why:** Payslip import (`FinancePayslipImportController`) is a simpler flow (no preview step — data is written directly). The async pattern adds resilience but the confirmation UX differs from finance transactions.

**Files affected:** `resources/js/components/payslip/` (the payslip upload component), `FinancePayslipImportController`.

**Requirements:**

#### 4a. Backend

- `FinancePayslipImportController::import()` currently writes directly to the DB after Gemini returns. In the async model:
  - Upload creates a `fin_import_job` with `job_type = finance_payslip`.
  - The worker parses and stores the result (`status = parsed`).
  - A new **confirm endpoint** `POST /api/import/jobs/{job_id}/confirm-payslip` writes the parsed payslips to `fin_payslips` and marks the job `imported`.
  - This gives the user a chance to review the parsed data before it is committed — consistent with the finance transactions flow.

#### 4b. Frontend

- Replace the direct upload call with `POST /api/import/upload` (job_type=`finance_payslip`).
- Add `useJobPolling` to the payslip import component.
- Add a review screen: display parsed payslip fields in a table; user clicks "Import" to call the confirm endpoint.
- UI states mirror Milestone 3 (idle → uploading → queued/queued_tomorrow → preview → imported).

#### 4c. Employment entity context

Pass `employment_entity_id` (if set by the user) in `context_json` so the worker can include it in the parsed record.

---

### Milestone 5 — Utility Bill Import UI

**Why:** `UtilityBillImportController` currently writes directly to the DB (same pattern as payslips). Migrating it follows the same pattern as Milestone 4 but affects a different module (`UtilityBillTracker`).

**Files affected:** `resources/js/components/utility-bill/` (utility bill upload component), `UtilityBillImportController`.

**Requirements:**

#### 5a. Backend

- `UtilityBillImportController::import()` is replaced by the shared upload endpoint.
- Pass `account_type` (e.g., `Electricity`) and `account_id` in `context_json` so `GeminiJobDispatcherService::runPrompt()` can build the correct electricity-specific prompt.
- A new confirm endpoint `POST /api/import/jobs/{job_id}/confirm-utility-bill` creates `UtilityBill` records and marks the job `imported`.

#### 5b. Frontend

- Replace the direct `fetch` call in the utility bill import component with the shared `POST /api/import/upload` flow.
- Add `useJobPolling` and a review table for extracted bill fields.
- UI states: idle → uploading → queued/queued_tomorrow → preview → imported.

---

### Milestone 6 — Cleanup & Documentation

**Why last:** Only remove the old synchronous paths after all UIs have been migrated and the feature flag has been flipped to `GEMINI_USE_QUEUE=true` in production.

**Requirements:**

- Remove `GEMINI_USE_QUEUE` feature flag and the synchronous code paths.
- Remove or archive `FinanceGeminiImportController::parseDocument()` (superseded by job dispatch).
- Remove the raw Gemini call from `FinancePayslipImportController` and `UtilityBillImportController`.
- Update `docs/finance/FinanceTool.md`, `STATEMENTS_AND_IMPORT.md`, and this file to reflect the final architecture.
- Ensure PHP test coverage for:
  - `ImportJobController` upload, show, index, retry, cancel
  - `ParseImportFileJob` (mock `GeminiJobDispatcherService`)
  - `import:process-scheduled` command
  - Daily quota enforcement (happy path + quota-exceeded path)
- Ensure TypeScript/Jest coverage for `useJobPolling`.

---

## Shared Job Queue Architecture

```
┌──────────────────────────────────────────────────────┐
│                  User (browser)                       │
│  Finance Import │ Payslip Import │ Utility Bill Import │
└────────┬────────┴───────┬────────┴──────────┬─────────┘
         │                │                   │
         └────────────────┼───────────────────┘
                          │  POST /api/import/upload
                          ▼
              ┌─────────────────────┐
              │  ImportJobController │
              │  • SHA-256 de-dupe  │
              │  • S3 upload        │
              │  • Quota check      │
              │  • fin_import_jobs  │
              └──────────┬──────────┘
                         │  Dispatch
                         ▼
              ┌─────────────────────┐
              │   imports queue      │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  ParseImportFileJob  │
              │  • Quota check (2nd) │
              │  • S3 download       │
              │  • Route by job_type │
              └──────────┬──────────┘
                         │
                         ▼
          ┌──────────────────────────────┐
          │  GeminiJobDispatcherService   │
          │  • finance_transactions       │
          │  • finance_payslip            │
          │  • utility_bill               │
          └──────────────┬───────────────┘
                         │  Gemini API call
                         ▼
              ┌─────────────────────┐
              │  fin_import_jobs     │
              │  status = parsed     │
              │  parsed_json = ...   │
              └──────────┬──────────┘
                         │  UI polls
                         ▼
              Tool-specific preview UI
                         │  User confirms
                         ▼
              Tool-specific confirm endpoint
              (writes to DB, marks imported)
```

---

## Global Daily API Quota

### Configuration

```dotenv
GEMINI_DAILY_REQUEST_LIMIT=500   # Maximum Gemini API calls per UTC calendar day
```

Adjust based on your Google Cloud project quota and budget alerts.

### Enforcement flow

1. `ImportJobController::upload()` calls `GeminiJobDispatcherService::claimQuota()` before dispatching.
2. `ParseImportFileJob::handle()` calls `claimQuota()` again inside the worker (race-safe, handles the case where the quota was consumed between upload and worker pickup).
3. If `claimQuota()` returns `false` at either check point, the job status becomes `queued_tomorrow` with `scheduled_for = UTC today + 1 day`.
4. The `import:process-scheduled` command (runs every minute via Laravel scheduler) promotes `queued_tomorrow` jobs to `pending` as quota becomes available each new day.

### Atomic quota increment (SQL)

The canonical implementation uses `INSERT ... ON DUPLICATE KEY UPDATE` which is a single atomic statement in MySQL. No surrounding transaction is needed for MySQL. For test environments running SQLite, use `updateOrInsert` + a subsequent `SELECT` inside a `DB::transaction()` block.

```sql
-- MySQL (production): single atomic statement
INSERT INTO fin_gemini_daily_usage (usage_date, request_count, updated_at)
VALUES (CURDATE(), 1, NOW())
ON DUPLICATE KEY UPDATE
  request_count = IF(request_count < @limit, request_count + 1, request_count),
  updated_at    = NOW();

-- After the INSERT, SELECT request_count for today to determine if the increment succeeded:
-- if the returned count <= limit, the quota was claimed; otherwise it was not.
SELECT request_count FROM fin_gemini_daily_usage WHERE usage_date = CURDATE();
```

Return `true` only if the post-increment count is ≤ the configured limit.

---

## Security Considerations

- All S3 paths are under `fin_import/{user_id}/`; ownership is enforced server-side.
- `parsed_json` is stored as raw text and validated against the tool-specific schema before being committed to the DB via the confirm endpoint. Use the existing `buildMultiImportPayload` validation pipeline for finance transactions.
- `ParseImportFileJob` never receives raw file content as a constructor argument — it downloads from S3 at runtime, keeping the queue payload small.
- Rate limiting: the upload endpoint is rate-limited per user (10 uploads per minute) to prevent queue flooding.
- The `job_type` field is validated against an allowlist before dispatch; unknown types are rejected with 422.
- `context_json` is deserialized only inside the trusted server process; it is never echoed back to the browser without sanitization.

---

## File Naming

All files stored via this flow use:

```
fin_import/{user_id}/{date} {random5} {originalFilename}
```

- `{date}`: `YYYY.MM.DD` format (UTC)
- `{random5}`: 5-character cryptographically random lowercase hex string generated by `substr(bin2hex(random_bytes(4)), 0, 5)` (4 bytes → 8 hex chars → first 5 taken), preventing S3 key collisions. This matches the actual implementation in `HasFileStorage::generateStoredFilename()`.
- `{originalFilename}`: the client-supplied filename (sanitized)

This mirrors `HasFileStorage::generateStoredFilename()`.

---

## Caching

The existing per-request cache (keyed by `file_hash + accounts_context_hash`, TTL 1 hour) continues to work as a first layer before queuing. The `fin_import_job` record is a persistent second layer that survives cache eviction and is resumable across browser sessions.

---

## Open Questions

The following questions should be resolved before or during implementation. They are listed here so they can be addressed together.

1. **Queue driver selection** — Should the `imports` queue use the `database` driver (simple, no new infrastructure) or `redis` (better throughput, supports delayed jobs natively)? The database driver is sufficient for the expected load but redis would be preferred if the app already has redis available.

2. **Per-user daily quota** — Should there also be a per-user daily Gemini request limit (e.g., 50 per user) in addition to the site-wide limit? This would prevent one user from consuming the entire day's quota.

3. **Payslip review screen design** — The current payslip import writes directly to the DB with no review step. Should the async flow introduce a review step (recommended for consistency) or should it write directly upon completion (faster UX, less code)? If a review step is added, which payslip fields need to be editable before commit?

4. **Utility bill review screen design** — Same question as above for utility bills. The fields are simpler (dates, amounts), but user correction of OCR errors may be valuable.

5. **Gemini model versioning** — The three controllers currently use different Gemini model versions (`gemini-2.5-flash`, `gemini-2.0-flash-exp`, `gemini-3-flash-preview`). Should `GeminiJobDispatcherService` standardize on a single model, or should each `job_type` specify its preferred model in a configuration file?

6. **Job history retention** — How long should `fin_import_jobs` rows be kept after `status = imported`? Options: forever (for audit trail), 90 days (rolling purge via scheduled command), or configurable via `IMPORT_JOB_RETENTION_DAYS`.

7. **Multi-file batching** — The payslip and utility bill controllers accept multiple files in a single request. In the async model, should each file become its own `fin_import_job` (simpler, independent retry per file) or should a batch be one job (fewer rows, but a failure affects all files in the batch)?

8. **Supervisor / worker process management** — The codebase does not currently have Supervisor config files checked in. Should `supervisor.d/` configuration be added to the repository as documentation, or is this considered infrastructure-as-code outside the repo?

9. **`queued_tomorrow` UX** — When a user's job is deferred, should they receive an email/notification when it completes the next day? This would require a notification system that does not currently exist.

10. **Feature flag rollout order** — Should the feature flag `GEMINI_USE_QUEUE` be flipped per-tool (finance first, then payslip, then utility) or globally? Per-tool gives more controlled rollout but requires more flag management.

11. **Quota monitoring & alerting** — Should there be an admin dashboard page or a Laravel Telescope panel showing `fin_gemini_daily_usage` over time? Who receives an alert when usage approaches the daily limit?
