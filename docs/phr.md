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

The normalized schema is applied by `2026_05_17_042849_normalize_phr_patient_schema.php`:

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

Raw objects are stored on the dedicated `phr_dicom` filesystem disk (see `config/filesystems.php`). For now this disk is a `local` driver rooted at `storage/app/private/phr-dicom`, overridable to a path outside the deploy tree via the `PHR_DICOM_DISK_ROOT` env var — the CI rsync uses `--delete` against `storage/`, so prod should always point this somewhere stable. To migrate to S3/R2 later, change the disk's `driver` to `s3` and provide `AWS_*` env vars; all application code references the disk by name so no code change is required. Object keys follow:

```text
phr/dicom/patients/{patient_id}/uploads/{upload_uuid}/{original_relative_path}
```

The database stores the original relative path separately from the storage key (the `phr_dicom_files.r2_key` column — the column name predates the disk rename and is kept to avoid a churny migration). The split is intentional: ZIP export reconstructs the source directory layout even if the storage prefix or driver changes later.

### Upload lifecycle and garbage collection

Uploads run through `DicomUploadProcessor::process()` in three states:

1. `STATUS_PENDING` — row inserted, file loop in progress.
2. `STATUS_PROCESSED` — file loop completed successfully; the row is the API response.
3. `STATUS_FAILED` — an exception was thrown mid-loop. `DicomUploadProcessor::failUpload()` deletes the storage prefix and cascades `phr_dicom_files`/`phr_dicom_instances` rows, then writes the error message onto the upload row for audit.

`phr:dicom:gc` is scheduled hourly (see `routes/console.php`). It uses the same `failUpload()` helper to reclaim any upload stuck in `STATUS_PENDING` past `--pending-hours` (default 6), and walks the disk listing to delete storage objects that no longer correspond to a `phr_dicom_files` row. Pass `--dry-run` to preview without deleting.

### Parser limits

`DicomMetadataParser` is intentionally bounded so a malformed or huge file can't tie up the request:

- It reads only the first 4 MiB of each file (`MAX_PARSE_BYTES`). Pixel data lives after metadata in Part 10 layout, so this is fine in practice — but a file whose metadata is unusually large will lose tail tags.
- It stops after parsing 2,500 elements per file (the `parsed < 2500` ceiling). Same caveat.

If you encounter a study that didn't surface expected metadata, the limits above are the first thing to check before suspecting the parser logic itself.

The current parser extracts core Part 10 metadata immediately during upload and avoids queue work for the normal small-study case. Parsed fields include study/series/SOP UIDs, modality, dates/times, accession, descriptions, image dimensions, frame count, transfer syntax, and common web-viewer metadata. If later studies are too large for request-time processing, add a queued fallback while preserving the synchronous path for ordinary uploads.

## Viewer Integration

The PHR UI's "Viewer" button on each study opens the OHIF Viewer in a new tab pointed at the patient's authenticated `viewer-json` manifest:

```text
/ohif/viewer?datasources=dicomjson&url=<encoded-manifest-url>
```

where the manifest URL is:

```text
/api/phr/patients/{patient}/dicom/studies/{study}/viewer-json
```

OHIF loads the manifest with the browser's session cookie, then fetches each instance from the URLs the manifest contains (`/api/phr/patients/{patient}/dicom/instances/{instance}/file`). Both endpoints are protected by the existing `web` + `auth` middleware, so the storage layer stays private and there's no CORS plumbing. ZIP downloads of the originals are still served by `/api/phr/patients/{patient}/dicom/studies/{study}/download`.

### OHIF deployment

OHIF is **not** committed to this repo. It lives at `~/bwh-php/public/ohif/` on the server and is deployed by a separate, manually-triggered workflow at `.github/workflows/ohif-dist.yml`:

1. Run **Actions → OHIF Dist → Run workflow** in GitHub and supply a tag (default `v3.12.0`).
2. The workflow checks out OHIF at that tag, patches `platform/app/public/config/default.js` via `.github/ohif/patch-config.mjs` to set `routerBasename: '/ohif/'` and `defaultDataSourceName: 'dicomjson'`, runs `PUBLIC_URL=/ohif/ yarn build`, and rsyncs the resulting `platform/app/dist/` to `~/bwh-php/public/ohif/` with `--delete`.
3. The main app deploy in `.github/workflows/ci.yml` rsyncs `public/` with `--exclude='ohif'`, so app deploys never clobber the viewer.

The workflow also re-runs on pushes to `.github/ohif/**` so iterations on the patcher script redeploy automatically. For everything else (OHIF version bumps), trigger it by hand.
