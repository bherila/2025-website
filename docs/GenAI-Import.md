# GenAI Import System

The GenAI Import system provides a unified, asynchronous pipeline for extracting structured data from PDF documents using Google's Gemini AI. It supports three import types:

- **Finance Transactions** — Bank/brokerage statement parsing (transactions, statement details, lots)
- **Finance Payslips** — Pay stub extraction (earnings, deductions, taxes)
- **Utility Bills** — Utility bill parsing (dates, amounts, usage metrics)

---

## Architecture Overview

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

### Key Design Decisions

- **Direct-to-S3 Uploads**: Files are uploaded directly to S3 via pre-signed URLs, bypassing the PHP server to avoid memory bloat and HTTP timeouts.
- **Database Queue Driver**: The `database` queue driver with cron-based processing (`* * * * *` via `genai:run-queue`) is used since the environment doesn't support Redis or long-running daemon workers.
- **De-duplication**: Files are hashed via S3 ETag (MD5 for single-part uploads) to detect re-uploads of the same file, avoiding duplicate API calls.
- **Quota Protection**: A global daily quota (`genai_daily_quota` table) prevents runaway LLM costs.

---

## API Endpoints

All endpoints require authentication (`['web', 'auth']` middleware).

| Method   | Endpoint                                | Description |
|----------|-----------------------------------------|-------------|
| `POST`   | `/api/genai/import/request-upload`       | Generate a pre-signed S3 upload URL |
| `POST`   | `/api/genai/import/jobs`                 | Create a new import job after file upload |
| `GET`    | `/api/genai/import/jobs`                 | List current user's import jobs (paginated) |
| `GET`    | `/api/genai/import/jobs/{job_id}`        | Show a specific job with results |
| `POST`   | `/api/genai/import/jobs/{job_id}/retry`  | Retry a failed job |
| `DELETE`  | `/api/genai/import/jobs/{job_id}`        | Delete a job, its results, and the S3 file |

### `POST /api/genai/import/request-upload`

Request a pre-signed URL for uploading a file directly to S3.

**Request:**
```json
{
  "filename": "statement.pdf",
  "content_type": "application/pdf",
  "file_size": 1048576
}
```

**Response:**
```json
{
  "signed_url": "https://s3.amazonaws.com/...",
  "s3_key": "genai-import/123/2026.03.23 ab1cd statement.pdf",
  "expires_in": 900
}
```

### `POST /api/genai/import/jobs`

Create an import job after the file has been uploaded to S3.

**Request:**
```json
{
  "s3_key": "genai-import/123/2026.03.23 ab1cd statement.pdf",
  "original_filename": "statement.pdf",
  "file_size_bytes": 1048576,
  "mime_type": "application/pdf",
  "job_type": "finance_transactions",
  "context": {
    "accounts": [
      { "name": "Savings", "last4": "1234" }
    ]
  },
  "acct_id": 42
}
```

**Response:**
```json
{
  "job_id": 1,
  "status": "pending"
}
```

---

## Job Types & Context Schema

| Job Type               | Valid Context Keys                              |
|------------------------|-------------------------------------------------|
| `finance_transactions` | `accounts` (array of `{name, last4}`)           |
| `finance_payslip`      | `employment_entity_id`, `file_count`            |
| `utility_bill`         | `account_type`, `utility_account_id`, `file_count` |

Context JSON is strictly validated per `job_type` to prevent injection attacks. Unexpected keys are rejected with a 422 error.

---

## Job Status Lifecycle

```
pending → processing → parsed → imported
                    ↘ failed (retryable up to 3 times)
                    ↘ queued_tomorrow (quota exceeded)
```

| Status             | Description |
|--------------------|-------------|
| `pending`          | Job is queued and waiting to be processed |
| `processing`       | Job is actively being processed by the AI |
| `parsed`           | AI parsing complete; results ready for user review |
| `imported`         | User has confirmed and imported results |
| `failed`           | Processing failed; check `error_message` |
| `queued_tomorrow`  | Daily quota exceeded; will be processed when quota resets |

---

## Global Daily API Quota

```dotenv
GEMINI_DAILY_REQUEST_LIMIT=15          # Site-wide max Gemini calls per UTC day
GEMINI_USER_DAILY_REQUEST_LIMIT=-1     # Per-user limit; -1 = disabled
```

The `GenAiJobDispatcherService::claimQuota()` method atomically increments the daily counter. When the limit is reached, new jobs receive `status = queued_tomorrow` and are automatically promoted when the quota resets at midnight UTC.

---

## Retry Logic

- **Max retries:** 3 per job
- **Transient errors** (429, 503): Job is marked as `failed` with incremented `retry_count`. User can retry via `POST /api/genai/import/jobs/{id}/retry`.
- **Fatal errors** (400 Bad Request — corrupt/encrypted PDF): Job is immediately marked as `failed` with `retry_count` set to max, preventing further retries.
- **Stale jobs**: The `genai:requeue-stale` command (runs every 5 minutes) resets any job stuck in `processing` for more than 10 minutes.

---

## Gemini File API Cleanup

After each `generateContent` call (success or failure), the `ParseImportJob` explicitly sends a `DELETE` request to the Gemini File API to free up Google Cloud quota. This happens in a `finally` block to ensure cleanup even on exceptions.

---

## File Naming Convention

```
genai-import/{user_id}/{YYYY.MM.DD} {random5} {sanitized_filename}
```

`{random5}` = `substr(bin2hex(random_bytes(4)), 0, 5)` — consistent with `HasFileStorage::generateStoredFilename()`.

---

## Artisan Commands

| Command                     | Schedule            | Description |
|-----------------------------|---------------------|-------------|
| `genai:run-queue`           | Every minute        | Process one job from the `genai-imports` queue |
| `genai:process-scheduled`   | Every minute        | Promote deferred jobs whose scheduled date has arrived |
| `genai:requeue-stale`       | Every 5 minutes     | Reset jobs stuck in `processing` state |
| `orphans:scan`              | Manual              | Scan S3 for files not referenced by any job |
| `orphans:delete`            | Manual              | Delete orphaned S3 files (`--dry-run` supported) |

All scheduled commands use `withoutOverlapping()` to prevent concurrent execution.

---

## S3 Orphan Management

Files may become orphaned in S3 if a user starts an upload but never completes the workflow. Two artisan commands handle this:

```bash
# List orphaned files (safe, read-only)
php artisan orphans:scan

# Delete orphaned files (with dry-run option)
php artisan orphans:delete --dry-run
php artisan orphans:delete
```

---

## Frontend Integration

### Shared Hooks

- **`useGenAiFileUpload`** — Handles the 3-step upload flow (request signed URL → PUT to S3 → create job). Validates that each API response contains the expected fields (`signed_url`, `s3_key`, `job_id`) before proceeding, throwing descriptive errors on malformed responses.
- **`useGenAiJobPolling`** — Polls a job's status using a ref-based approach (avoids duplicate fetches on status transitions). Stops automatically when a terminal status is reached. Uses exponential backoff on server errors.

### TypeScript Types

All types are defined in `resources/js/genai-processor/types.ts`:
- `GenAiJobType`, `GenAiJobStatus`, `GenAiResultStatus`
- `GenAiImportJobData`, `GenAiImportResultData`

For `finance_transactions`, the stored `result_json` is a single normalized object with an `accounts` array, even when the PDF contains only one account.

### UX Pattern

Because the cron-based queue has up to 60 seconds latency, the UI should:
- Show a message like "Your file is in the queue and will be processed shortly. You can leave this page."
- Use the polling hook to update status automatically
- Display results for review when status transitions to `parsed`
- Show a deferred notice when status is `queued_tomorrow`
- Show an error state with a Clear button when status is `failed`

For finance-specific import UI details (components, checkboxes, button text), see [FinanceTool.md § Transaction Import](finance/FinanceTool.md#transaction-import).

---

## Database Tables

### `genai_import_jobs`

| Column             | Type          | Description |
|--------------------|---------------|-------------|
| `id`               | bigint PK     | Auto-increment ID |
| `user_id`          | bigint FK     | References `users.id` |
| `acct_id`          | bigint FK     | Optional reference to `fin_accounts.acct_id` |
| `job_type`         | varchar(64)   | One of: `finance_transactions`, `finance_payslip`, `utility_bill` |
| `file_hash`        | varchar(64)   | SHA-256 hash for de-duplication |
| `original_filename`| varchar(255)  | User-facing filename |
| `s3_path`          | varchar(255)  | S3 storage key |
| `mime_type`        | varchar(255)  | File MIME type |
| `file_size_bytes`  | bigint        | File size |
| `context_json`     | text          | Job-type-specific context (validated per type) |
| `status`           | varchar(32)   | Job status |
| `error_message`    | text          | Error details on failure |
| `retry_count`      | tinyint       | Number of retries attempted |
| `scheduled_for`    | date          | When to retry (for `queued_tomorrow`) |
| `parsed_at`        | timestamp     | When parsing completed |
| `created_at`       | timestamp     | |
| `updated_at`       | timestamp     | |

### `genai_import_results`

| Column          | Type        | Description |
|-----------------|-------------|-------------|
| `id`            | bigint PK   | Auto-increment ID |
| `job_id`        | bigint FK   | References `genai_import_jobs.id` (cascade delete) |
| `result_index`  | int         | Result ordering index |
| `result_json`   | longtext    | Parsed JSON data from Gemini |
| `status`        | varchar(32) | `pending_review`, `imported`, or `skipped` |
| `imported_at`   | timestamp   | When result was imported |
| `created_at`    | timestamp   | |
| `updated_at`    | timestamp   | |

### `genai_daily_quota`

| Column          | Type      | Description |
|-----------------|-----------|-------------|
| `usage_date`    | date PK   | UTC date |
| `request_count` | int       | Number of API calls made today |
| `updated_at`    | timestamp | |

---

## Quota Management

### System-Wide Quota
The `GEMINI_DAILY_REQUEST_LIMIT` environment variable (default: **500**) caps the total number of Gemini API calls per UTC day across all users. When exhausted, new jobs are deferred to the next day.

### Per-User Quota
Each user can configure a personal daily limit in **User Settings → GenAI Daily Quota** (`/dashboard`). The setting is stored in `users.genai_daily_quota_limit`:
- `NULL` (default) — user is subject only to the system-wide limit
- A positive integer — user cannot exceed that many AI import jobs per UTC day

This setting is configurable only by the user themselves and cannot be set via environment variables.

---

## Admin Panel

Administrators can monitor all GenAI jobs across all users at `/admin/genai-jobs`. The panel:
- Lists all jobs, most recent first, with pagination
- Shows user, file name, type, status, retry count, and creation date
- Provides a **Details** button per row that opens a modal with full job information:
  - User information
  - File metadata (size, S3 path, hash)
  - Context JSON (the prompt input)
  - Raw Gemini response (result JSON, expandable per result)
  - Error message if failed

The admin panel requires the `admin` gate (user must have the `admin` role). The "Admin: GenAI Jobs" link appears in the top-right user menu for admin users only.

---

## Security Considerations

- S3 objects are stored under `genai-import/{user_id}/`; pre-signed URLs are scoped to the specific key with 15-minute TTL.
- `context_json` is strictly validated per `job_type` — unexpected keys are rejected.
- `acct_id` ownership is verified before job creation to prevent cross-user access.
- `result_json` is stored as raw text; each tool's persist endpoint validates and maps only expected fields.
- The Gemini API key is read from `user->getGeminiApiKey()` at job runtime, never stored in the queue payload.
- Rate limit: 20 `request-upload` calls per minute per user (configurable).

---

## Code Structure

```
app/GenAiProcessor/
├── Console/Commands/
│   ├── RunGenAiQueue.php              # genai:run-queue
│   ├── ProcessScheduledGenAiJobs.php  # genai:process-scheduled
│   ├── RequeueStaleGenAiJobs.php      # genai:requeue-stale
│   ├── ScanOrphanedFiles.php          # orphans:scan
│   └── DeleteOrphanedFiles.php        # orphans:delete
├── Http/Controllers/
│   ├── GenAiImportController.php      # User-facing API endpoints
│   └── AdminGenAiJobsController.php   # Admin API endpoints
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
    └── GenAiJobDispatcherService.php  # Quota management, prompt building

resources/js/genai-processor/
├── types.ts                           # TypeScript interfaces
├── useGenAiFileUpload.ts              # Shared upload hook
├── useGenAiJobPolling.ts              # Shared polling hook
└── __tests__/
    ├── useGenAiFileUpload.test.ts
    └── useGenAiJobPolling.test.ts

resources/js/components/admin/
└── AdminGenAiJobsPage.tsx             # Admin jobs management UI
```

---

## Legacy Synchronous Import

The original synchronous import controllers (`FinanceGeminiImportController`, `FinancePayslipImportController`, `UtilityBillImportController`) remain active by default. When the `GEMINI_USE_QUEUE` environment variable is set to `true`, the `FinanceGeminiImportController::parseDocument` endpoint returns a `410 Gone` response directing clients to the new async flow.

To migrate to the async flow:
1. Set `GEMINI_USE_QUEUE=true` in `.env`
2. Update frontend components to use `useGenAiFileUpload` and `useGenAiJobPolling` hooks
3. Once all UI is migrated, remove the legacy endpoints
