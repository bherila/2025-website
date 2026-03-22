# Finance Import — Future Architecture Specification

## Overview

This document specifies a planned upgrade to the Finance import system. The current system parses CSV/QIF/OFX files synchronously in the browser and calls the Gemini API synchronously over HTTP for PDF imports. This works for small files and fast API responses, but has two known limitations:

1. **HTTP timeout risk** — Gemini API calls can take 30–90 seconds for large PDFs; if they exceed the server's HTTP timeout the user sees an error and must retry.
2. **No background processing** — there is no way to queue a file for later processing or track processing status across sessions.

The upgraded system introduces a **background job queue** for all AI-based file parsing, while keeping the fast synchronous path for text-based formats (CSV, QIF, OFX, HAR).

---

## Two Import Modes

### Mode 1 — Immediate parse (CSV / QIF / OFX / HAR / JSON)

Text-based formats are parsed synchronously in the browser using the existing client-side parsers (`parseIbCsv`, `parseQfx`, etc.). No server roundtrip is needed before the user reviews the parsed data. This mode is unchanged from the current implementation.

**Flow:**

```
User drops file → Browser parses → Preview shown → User confirms → POST /api/finance/{id}/line_items
```

### Mode 2 — Background AI parse (PDF and other binary formats)

Any file that cannot be parsed in the browser (e.g., PDF, image) is uploaded to S3 immediately and a `fin_import_job` record is created. The Laravel queue worker picks up the job, calls the Gemini API, and stores the parsed result. The import page polls for job completion and shows the parsed preview when ready.

**Flow:**

```
User drops file
  → POST /api/finance/import/upload
      → Store file in S3
      → Create fin_import_job (status: pending)
      → Dispatch ParseImportFileJob to queue
      → Return { job_id }
  → UI polls GET /api/finance/import/jobs/{job_id}
  → Queue worker calls Gemini API
  → Worker stores parsed JSON on fin_import_job (status: parsed)
  → UI shows parsed preview
  → User confirms → POST /api/finance/multi-import-pdf
      → Create statements / transactions / lots
      → Link file_hash to created statements
      → Mark fin_import_job status: imported
```

---

## Data Model

### `fin_import_jobs` Table

```sql
CREATE TABLE fin_import_jobs (
  id               BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id          BIGINT UNSIGNED NOT NULL,          -- owner
  acct_id          BIGINT UNSIGNED,                   -- NULL for all-accounts imports
  file_hash        VARCHAR(64) NOT NULL,              -- SHA-256 of the uploaded file
  original_filename VARCHAR(255) NOT NULL,
  s3_path          VARCHAR(255) NOT NULL,
  mime_type        VARCHAR(255),
  file_size_bytes  BIGINT UNSIGNED NOT NULL,

  status           ENUM('pending','processing','parsed','imported','failed') NOT NULL DEFAULT 'pending',
  error_message    TEXT,                              -- populated on failure
  parsed_json      LONGTEXT,                          -- Gemini response JSON (stored raw)
  parsed_at        TIMESTAMP,
  imported_at      TIMESTAMP,

  created_at       TIMESTAMP,
  updated_at       TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (acct_id) REFERENCES fin_accounts(acct_id) ON DELETE SET NULL,
  INDEX (user_id, status),
  INDEX (file_hash)
);
```

**Status transitions:**

| From | To | When |
|------|----|------|
| `pending` | `processing` | Worker picks up the job |
| `processing` | `parsed` | Gemini API returns successfully |
| `processing` | `failed` | Gemini API error or timeout |
| `parsed` | `imported` | User confirms import |
| `failed` | `pending` | User retries |

---

## API Endpoints

### Upload and enqueue

```
POST /api/finance/import/upload
```

**Request:** `multipart/form-data` with `file` and optional `acct_id`.

**Behavior:**
1. Compute SHA-256 of the uploaded file.
2. Check if a `fin_import_job` already exists for this `file_hash` + `user_id`. If the job is `parsed` or `imported`, return it immediately (cache hit — no re-upload needed).
3. Store the file in S3 at path `fin_import/{user_id}/{date} {random5} {original_filename}` (same naming scheme as `generateStoredFilename`).
4. Insert a `fin_import_job` record with `status = pending`.
5. Dispatch `ParseImportFileJob` to the `imports` queue.
6. Return `{ job_id, status: 'pending' }`.

**Auth:** `['web', 'auth']` middleware; file must belong to authenticated user.

### Poll job status

```
GET /api/finance/import/jobs/{job_id}
```

**Response:**
```json
{
  "job_id": 42,
  "status": "parsed",
  "parsed_data": { /* GeminiImportResponse shape */ },
  "error_message": null,
  "created_at": "2025-01-01T12:00:00Z",
  "parsed_at": "2025-01-01T12:00:45Z"
}
```

Only the authenticated user's jobs are accessible (403 otherwise).

### List jobs

```
GET /api/finance/import/jobs?status=pending,parsed
```

Returns paginated list of the user's import jobs. Useful for showing a history or resuming an interrupted session.

### Retry failed job

```
POST /api/finance/import/jobs/{job_id}/retry
```

Resets status to `pending` and re-dispatches `ParseImportFileJob`.

### Confirm and import

Once `status = parsed`, the user reviews the `parsed_data` and calls the existing:

```
POST /api/finance/multi-import-pdf
```

…with the `file_hash` field populated. The controller marks the `fin_import_job` as `imported` after successfully saving the data.

---

## Laravel Queue Worker

### `ParseImportFileJob`

Location: `app/Jobs/ParseImportFileJob.php`

**Constructor arguments:** `int $jobId`

**handle() steps:**

1. Load the `fin_import_job` by `$jobId`. If not found or not `pending`, abort.
2. Set `status = processing` and save.
3. Download the file from S3 (stream to temp file).
4. Build the Gemini prompt using `FinanceGeminiImportController::getTransactionPrompt()` with the user's account context.
5. Call `FinanceGeminiImportController::callGeminiApi()` with retries (exponential backoff, max 3 attempts).
6. On success: store the parsed JSON in `parsed_json`, set `status = parsed`, set `parsed_at = now()`.
7. On failure: set `status = failed`, set `error_message` to the exception message.
8. The response JSON is already cached by file hash in `Cache` (existing behavior), so if the same file is re-queued the cache hit returns instantly without calling Gemini again.

**Queue:** `imports` (configure in `config/queue.php` and `Kernel.php` schedule).

**Timeout:** `public $timeout = 300;` (5 minutes — matches current HTTP timeout).

**Retry strategy:** `public $tries = 1;` (retries are handled explicitly via the retry endpoint).

### Scheduled dispatch

Add to `app/Console/Kernel.php`:

```php
// Re-queue stale processing jobs that may have been lost (e.g. worker crash)
$schedule->command('finance:requeue-stale-import-jobs')->everyFiveMinutes();
```

`finance:requeue-stale-import-jobs` resets any `processing` job older than 10 minutes back to `pending` and re-dispatches it.

---

## Frontend Changes

### Import page states

The import page (`ImportTransactions.tsx`) gains a new visual state for Mode 2:

| State | UI |
|-------|----|
| `idle` | Drop zone / file picker |
| `uploading` | Spinner: "Uploading file…" |
| `queued` | Progress indicator: "Processing with AI… (job #42)" with polling |
| `parsed` | Existing preview cards (same as today) |
| `error` | Error banner with Retry button |

### Polling

Use a `useJobPolling` hook that calls `GET /api/finance/import/jobs/{job_id}` every 3 seconds while `status` is `pending` or `processing`. Stop polling when `status` becomes `parsed`, `imported`, or `failed`. Exponential backoff if the server returns a 5xx.

```typescript
function useJobPolling(jobId: number | null): { status: ImportJobStatus; parsedData: GeminiImportResponse | null; error: string | null }
```

### `useProcessPdfWithGemini` migration

Replace the current synchronous Gemini call in `useProcessPdfWithGemini.ts` with:

1. `POST /api/finance/import/upload` → receive `{ job_id }`.
2. Start polling with `useJobPolling(job_id)`.
3. When `status === 'parsed'`, set `pdfData` from `parsedData`.

The existing preview/confirmation/import flow is unchanged after that point.

---

## File Naming

All files stored via this flow (and the current flow) use:

```
fin_import/{user_id}/{date} {random5} {originalFilename}
```

- `{date}`: `YYYY.MM.DD` format (UTC)
- `{random5}`: 5-character random lowercase alphanumeric string (`[a-z0-9]{5}`) to prevent collisions when the same user uploads the same file twice on the same day
- `{originalFilename}`: the client-supplied filename (sanitized)

This mirrors `HasFileStorage::generateStoredFilename()`.

---

## Caching

The existing Gemini response cache (keyed by `file_hash + accounts_context_hash`, TTL 1 hour) continues to work as the first layer. The `fin_import_job` record acts as a persistent second layer so that responses survive cache eviction and are resumable across browser sessions.

---

## Security Considerations

- All S3 paths are under `fin_import/{user_id}/`; server-side access control ensures users can only access their own files.
- `parsed_json` is stored as raw text and must be validated/sanitized before being passed to the import endpoint (use the existing `buildMultiImportPayload` validation pipeline).
- The `ParseImportFileJob` never receives raw file content as a constructor argument — it downloads from S3 at runtime, keeping the queue payload small.
- Rate limiting: the upload endpoint should be rate-limited per user (e.g., 10 uploads per minute) to prevent Gemini API abuse.

---

## Migration Steps

1. Create `fin_import_jobs` table migration.
2. Implement `ParseImportFileJob`.
3. Add `POST /api/finance/import/upload`, `GET /api/finance/import/jobs/{id}`, and retry endpoints.
4. Update `FileController::uploadFinAccountFile` to optionally create a `fin_import_job` when the uploaded file is a non-text MIME type.
5. Add `useJobPolling` hook and update `useProcessPdfWithGemini` to use the queue-based flow.
6. Update `ImportTransactions.tsx` to render the new `queued` state.
7. Keep the synchronous Gemini path as a fallback (feature flag: `GEMINI_USE_QUEUE=false`) so existing deployments without a queue worker continue to work.
8. Update `docs/finance/FinanceTool.md` and `STATEMENTS_AND_IMPORT.md` after implementation.
