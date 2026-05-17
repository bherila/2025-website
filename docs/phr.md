# Personal Health Records

The PHR domain stores user-owned patient profiles and clinical observations. A single account can own multiple PHR patients, and the owner can grant another user access to an individual patient profile.

PHR code is kept in dedicated namespaces and folders so the app can be split out later if needed:

- Web/API controllers live under `App\Http\Controllers\PHR`.
- Form requests live under `App\Http\Requests\PHR`.
- Blade views live under `resources/views/phr`.
- React entrypoints and components live under `resources/js/phr`.
- Routes live under `/phr` for pages and `/api/phr` for JSON APIs.
- DICOM controllers and services stay under `PHR\DICOM` subdirectories; the TypeScript entrypoint remains lowercase `resources/js/phr`.

## Schema

The legacy schema dumps already contained `phr_lab_results` and `phr_patient_vitals`, but no committed migration created those tables. `2026_05_17_042848_create_missing_phr_tables_if_needed.php` is the baseline guard: it creates those two legacy-shaped tables only when they are missing.

PHR database tables use the lowercase `phr_` prefix. Keep future PHR tables on that prefix to make the domain portable and easy to identify in schema dumps.

The normalized schema is applied by `2026_05_17_042848_normalize_phr_patient_schema.php`:

- `phr_patients` stores patient profiles. `owner_user_id` references `users.id`.
- `phr_patient_user_access` grants per-patient access to other users. `access_level` is currently `owner`, `manager`, or `viewer`.
- `phr_lab_results` stores lab analyte rows and belongs to both `patient_id` and owning `user_id`.
- `phr_patient_vitals` stores vital observations and belongs to both `patient_id` and owning `user_id`.
- `phr_dicom_uploads` stores one directory/file upload event, including the R2 prefix, counts, retained relative paths, and skipped auxiliary files.
- `phr_dicom_files` stores raw retained DICOM objects and `DICOMDIR` files. `original_relative_path` is the source path used when exporting a study ZIP.
- `phr_dicom_studies`, `phr_dicom_series`, and `phr_dicom_instances` store parsed imaging metadata from uploaded DICOM files.

During the normalization migration, pre-existing lab and vital rows are assigned to `users.id = 1` and attached to a `Legacy PHR Patient` profile because the legacy `user_id` values were string identifiers that do not map cleanly to the Laravel `users.id` primary key.

## Data Model Notes

Record tables keep `user_id` as the owning account for simple owner-scoped queries, but API authorization should be based on `PhrPatient::accessibleBy($userId)` so shared access works consistently.

Vitals support both raw display values and structured numeric values:

- `vital_value` preserves the source value as entered or imported.
- `value_numeric` stores the primary numeric component as `decimal(18,10)`.
- `value_numeric_secondary` stores a second numeric component for paired values such as blood pressure.
- `unit` and `secondary_unit` store measurement units.
- `observed_at` stores a precise local observation time when available; `vital_date` remains available for date-only data.

Lab results follow the same raw-plus-structured pattern:

- `value` preserves the raw result text.
- `value_numeric`, `range_min`, and `range_max` use `decimal(18,10)`.
- `reference_range_text` preserves non-numeric reference ranges.
- `abnormal_flag` stores source flags such as high, low, abnormal, or critical.

Future APIs should create the `PhrPatient` first, then create labs and vitals against that `patient_id`. Sharing APIs should add or update `phr_patient_user_access` rows instead of copying clinical records between users.

## DICOM Imaging

PHR imaging is patient-scoped and uses the same `owner` / `manager` / `viewer` access model:

- Owners and managers can upload DICOM files for a patient.
- Viewers can list studies, read viewer-ready metadata, proxy raw DICOM files, and download original study files if they have access to that patient.
- Unshared users should receive a 404 for patient-scoped imaging endpoints.

Upload endpoints accept multi-file form uploads under `/api/phr/patients/{patient}/dicom/uploads`. The browser UI uses directory selection (`webkitdirectory`) so a user can choose a DICOM CD/export folder containing `DICOMDIR` plus nested image files. Client and server filters skip auxiliary files such as viewer executables, autorun files, icons, setup assets, HTML, PDFs, and common image previews. Server parsing remains authoritative: a file is only stored when it parses as DICOM or `DICOMDIR`.

Raw objects are stored on the configured `s3` disk. For Cloudflare R2, keep using the Laravel S3 disk with the R2 endpoint in `AWS_S3_ENDPOINT`, bucket in `AWS_BUCKET`, and path-style behavior as needed. Object keys follow:

```text
phr/dicom/patients/{patient_id}/uploads/{upload_uuid}/{original_relative_path}
```

The database stores the original relative path separately from the R2 key. This is intentional: ZIP export can reconstruct the source directory layout even if the R2 storage prefix changes later.

The current parser extracts core Part 10 metadata immediately during upload and avoids queue work for the normal small-study case. Parsed fields include study/series/SOP UIDs, modality, dates/times, accession, descriptions, image dimensions, frame count, transfer syntax, and common web-viewer metadata. If later studies are too large for request-time processing, add a queued fallback while preserving the synchronous path for ordinary uploads.

## Viewer Integration

Viewer integration is intentionally left as a separate decision. The current scaffolding exposes an authenticated metadata endpoint at:

```text
/api/phr/patients/{patient}/dicom/studies/{study}/viewer-json
```

The payload groups study, series, and instance metadata and includes authenticated same-origin raw DICOM URLs under `/api/phr/patients/{patient}/dicom/instances/{instance}/file`. That keeps R2 private and avoids CORS while leaving room to adapt the same parsed data for OHIF, a pnpm-installed React viewer, or another DICOM viewer.

Study ZIP downloads are served by `/api/phr/patients/{patient}/dicom/studies/{study}/download`. The ZIP includes the original DICOM instance files for that study and any retained `DICOMDIR` file from the same upload.
