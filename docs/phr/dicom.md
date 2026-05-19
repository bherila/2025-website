# PHR DICOM Imaging

PHR imaging is patient-scoped and uses the same `owner` / `manager` / `viewer` access model:

- Owners and managers can upload DICOM files for a patient.
- Viewers can list studies, read viewer-ready metadata, proxy raw DICOM files, and download original study files if they have access to that patient.
- Unshared users should receive a 404 for patient-scoped imaging endpoints.

## Endpoints

Uploads are session-style: the client opens a session, POSTs each file individually, then finalizes (or cancels). This sidesteps PHP `max_file_uploads` and `post_max_size` limits, lets the browser show real per-file progress via `XMLHttpRequest.upload.onprogress`, and means a slow file no longer times out the entire batch.

```text
POST /api/phr/patients/{patient}/dicom/uploads                       # open session
POST /api/phr/patients/{patient}/dicom/uploads/{upload}/files        # one file (multipart, fields: file, relative_path)
POST /api/phr/patients/{patient}/dicom/uploads/{upload}/finalize     # mark STATUS_PROCESSED
POST /api/phr/patients/{patient}/dicom/uploads/{upload}/cancel       # abandon + reclaim storage
```

Per-file size cap is 200 MB (`StoreDicomUploadFileRequest`); the cap is bounded by `php.ini` `upload_max_filesize` / `post_max_size` and nginx `client_max_body_size` in the deployment environment.

The browser UI uses directory selection (`webkitdirectory`) so a user can choose a DICOM CD/export folder containing `DICOMDIR` plus nested image files. After folder selection a shadcn dialog confirms count and total bytes, then a 4-worker XHR pool streams files to the per-file endpoint. Client and server filters skip auxiliary files such as viewer executables, autorun files, icons, setup assets, HTML, PDFs, and common image previews.

Server parsing remains authoritative: a file is only stored when it parses as DICOM or `DICOMDIR`; image instances with a SOP Instance UID already stored for the patient are skipped rather than re-pointing the existing instance row.

Other DICOM endpoints:

```text
GET /api/phr/patients/{patient}/dicom/studies
GET /api/phr/patients/{patient}/dicom/studies/{study}/viewer-json
GET /api/phr/patients/{patient}/dicom/studies/{study}/download
GET /api/phr/patients/{patient}/dicom/instances/{instance}/file
```

## Storage

Raw objects are stored on the dedicated `phr_dicom` filesystem disk (see `config/filesystems.php`). The production path is Cloudflare R2 through the S3-compatible driver, configured with the `PHR_DICOM_R2_*` env vars. Local development can use the `local` driver by setting `PHR_DICOM_DISK_DRIVER=local`, `PHR_DICOM_DISK_SERVE=true`, and optionally `PHR_DICOM_DISK_ROOT`.

OHIF viewer manifests default to authenticated same-origin instance URLs because OHIF fetches DICOM files with XHR and direct R2 reads require a bucket CORS policy that allows the app origin. If `PHR_DICOM_VIEWER_DIRECT_SIGNED_URLS=true`, the manifest uses short-lived `temporaryUrl()` links from this disk so image payloads are fetched directly from storage instead of being streamed through PHP. The default direct-read TTL is 30 minutes and is configurable via `PHR_DICOM_VIEWER_URL_TTL_MINUTES`.

Object keys follow:

```text
phr/dicom/patients/{patient_id}/uploads/{upload_uuid}/{original_relative_path}
```

The database stores the original relative path separately from the storage key. The `phr_dicom_files.r2_key` column name predates the disk rename and is kept to avoid a churny migration. The split is intentional: ZIP export reconstructs the source directory layout even if the storage prefix or driver changes later.

## Upload lifecycle and garbage collection

Uploads go through three states on `phr_dicom_uploads.status`:

1. `STATUS_PENDING` - session is open and accepting per-file POSTs (`openUpload()`).
2. `STATUS_PROCESSED` - the client called `finalize` (`finalizeUpload()`); the row is the canonical upload record.
3. `STATUS_FAILED` - the client called `cancel`, or a fatal error fired `failUpload()`.

Per-file requests serialize on a row lock on the upload session so concurrent workers can update the manifest without lost updates. Path deduplication consults `manifest_json.stored_paths` rather than an in-memory counter, so it survives across separate HTTP requests.

`DicomUploadProcessor::failUpload()` deletes the storage prefix, deletes rows created by the failed upload, removes any empty study/series shells that upload created, then writes the error message onto the upload row for audit.

`phr:dicom:gc` is scheduled hourly in `routes/console.php`. It uses the same `failUpload()` helper to reclaim any upload stuck in `STATUS_PENDING` past `--pending-hours` (default 6) — which is what catches sessions where the browser closed mid-upload without calling cancel — and walks the disk listing to delete storage objects that no longer correspond to a `phr_dicom_files` row. Database key checks run in batches so the command does not load every stored DICOM key into memory at once. Pass `--dry-run` to preview without deleting.

## Parser limits

`DicomMetadataParser` is intentionally bounded so a malformed or huge file cannot tie up the request:

- It reads only the first 4 MiB of each file (`MAX_PARSE_BYTES`). Pixel data lives after metadata in Part 10 layout, so this is fine in practice, but a file whose metadata is unusually large will lose tail tags.
- It stops after parsing 2,500 elements per file.

If a study does not surface expected metadata, check those limits before changing parser logic.

The current parser extracts core Part 10 metadata immediately during upload and avoids queue work for the normal small-study case. Parsed fields include study/series/SOP UIDs, modality, dates/times, accession, descriptions, image dimensions, frame count, transfer syntax, and common web-viewer metadata. If later studies are too large for request-time processing, add a queued fallback while preserving the synchronous path for ordinary uploads.
