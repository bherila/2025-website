# PHR Documents Browser

The documents browser is the canonical home for PHR source files (lab PDFs, office-visit notes, discharge summaries, imaging reports, prescriptions, insurance docs, consents). DICOM imaging stays in its own pipeline ([dicom.md](dicom.md)).

## Endpoints

```text
GET    /api/phr/patients/{patient}/documents                            # list + filters + can_manage
POST   /api/phr/patients/{patient}/documents                            # upload (multipart, field: file)
GET    /api/phr/patients/{patient}/documents/{document}                 # metadata + linked rows
GET    /api/phr/patients/{patient}/documents/{document}/file            # inline file proxy
PATCH  /api/phr/patients/{patient}/documents/{document}                 # edit metadata
DELETE /api/phr/patients/{patient}/documents/{document}                 # soft delete
POST   /api/phr/patients/{patient}/documents/{document}/process         # dispatch GenAI job
```

List filters: `?type=lab_report`, `?source=manual_upload`, `?tag=labs`, `?date_from=YYYY-MM-DD`, `?date_to=YYYY-MM-DD`. The list response always includes `can_manage: boolean`.

## Schema and storage

`phr_documents` carries the browser's normalized columns: `observed_at`, `byte_size`, `file_hash`, `tags` (JSON array), and `deleted_at` for soft deletes. The legacy `file_size_bytes` and `sha256` columns are dual-written for the current release; the cleanup migration to drop them is tracked separately.

Allowed `document_type` values:

```text
lab_report, office_visit_note, discharge_summary, imaging_report,
prescription, insurance, consent, other
```

Allowed `source` values:

```text
manual_upload, genai_import, fhir_import, ccda_import, mychart_zip
```

`phr_documents` indexes: `(patient_id, document_type)`, `(patient_id, source)`, `(patient_id, observed_at)`.

Files are stored on the `phr_documents` filesystem disk (driver is `local` by default; `phr_documents.disk_root` config maps to the on-disk path). Keys follow:

```text
phr/documents/patients/{patient_id}/{uuid}/{safe_original_filename}
```

The original filename is preserved verbatim in `original_filename`; the storage path uses a safe-slug version for cross-platform safety.

## File proxy security

`/api/phr/patients/{patient}/documents/{document}/file` returns the file with `Content-Disposition: inline`, but the response also carries `Content-Security-Policy: sandbox; default-src 'none'; ...` and `X-Content-Type-Options: nosniff`. The React viewer renders unknown types in a `sandbox=""` iframe. Together these neutralize a malicious `html`/`htm` upload that would otherwise execute script in a shared viewer's session.

If you add a new mime to `StorePhrDocumentRequest`, leave both defenses in place.

## Linked rows

The detail response includes a `linked_rows` array listing PHR records that were created from this document via the GenAI pipeline (rows with `source_document_id = document.id`). Today the browser surfaces labs, vitals, and office visits. Conditions, procedures, immunizations, allergies, and medications also carry `source_document_id` but are not yet listed — extending `PhrDocumentController::linkedRows()` to cover them is a quick follow-up.

## GenAI processing

`POST /documents/{document}/process` re-uploads the stored file to S3 under `genai-import/{user_id}/{uuid}/`, creates a `GenAiImportJob` with `job_type=phr_document` (context includes `patient_id` and `document_id`), and dispatches `ParseImportJob`. The browser then polls the job via the standard GenAI endpoints. When the result lands, `PhrGenAiImportController::accept` calls `PhrStructuredDataImporter::updateDocumentFromGenAiResult` to push the parsed `title`, `document_type`, `observed_at`, `extracted_text`, `summary`, and `tags` back onto the same `phr_documents` row.

## Soft delete

`DELETE` sets `deleted_at` rather than removing the row or storage object. List queries hide soft-deleted rows by default (`SoftDeletes` trait on `PhrDocument`). The storage file is intentionally retained so a future hard-delete or restore stays possible; deciding when to actually reclaim disk is a follow-up.

`config/phr.php` exposes `documents_retention_days` (default 30) for the eventual hard-delete sweeper.

## Frontend

`resources/js/phr/documents/DocumentsPage.tsx` owns the browser UI: filter controls, grid/list toggle, upload form with metadata, inline viewer with sandboxed iframe, metadata edit, "Process with GenAI" action, and the linked-rows panel. The page reads `can_manage` directly from the list response — there is no second `/api/phr/patients/{id}` fetch.

Types live in `resources/js/phr/types.ts` under `PhrDocumentSchema`, `PhrDocumentsResponseSchema`, and `PhrDocumentMetadataFormSchema`.
