# PHR Schema

PHR database tables use the lowercase `phr_` prefix. Keep future PHR tables on that prefix to make the domain portable and easy to identify in schema dumps.

## Baseline and normalization

The legacy schema dumps already contained `phr_lab_results` and `phr_patient_vitals`, but no committed migration created those tables. `2026_05_17_042848_create_missing_phr_tables_if_needed.php` is the baseline guard: it creates those two legacy-shaped tables only when they are missing.

The normalized patient/access schema is applied by `2026_05_17_042849_normalize_phr_patient_schema.php`:

- `phr_patients` stores patient profiles. `owner_user_id` references `users.id`.
- `phr_patient_user_access` grants per-patient access to other users. `access_level` is currently `owner`, `manager`, or `viewer`.
- `phr_lab_results` stores lab analyte rows and belongs to both `patient_id` and owning `user_id`.
- `phr_patient_vitals` stores vital observations and belongs to both `patient_id` and owning `user_id`.

During the normalization migration, pre-existing lab and vital rows are assigned to `users.id = 1` and attached to a `Legacy PHR Patient` profile because the legacy `user_id` values were string identifiers that do not map cleanly to the Laravel `users.id` primary key.

## Clinical tables

The current clinical tables are:

- `phr_office_visits`
- `phr_medications`
- `phr_conditions`
- `phr_procedures`
- `phr_immunizations`
- `phr_allergies`

Each table belongs to `phr_patients.id` through `patient_id` and to `users.id` through `user_id`. The patient foreign keys cascade on delete, so deleting a patient removes its clinical records.

Use the corresponding `App\Models\Phr*` model rather than raw table access:

- `PhrOfficeVisit`
- `PhrMedication`
- `PhrCondition`
- `PhrProcedure`
- `PhrImmunization`
- `PhrAllergy`

## DICOM tables

The DICOM metadata schema is applied by `2026_05_17_060948_create_phr_dicom_tables.php`:

- `phr_dicom_uploads` stores one directory/file upload event, including the storage prefix, counts, retained relative paths, and skipped auxiliary files.
- `phr_dicom_files` stores raw retained DICOM objects and `DICOMDIR` files. `original_relative_path` is the source path used when exporting a study ZIP.
- `phr_dicom_studies`, `phr_dicom_series`, and `phr_dicom_instances` store parsed imaging metadata from uploaded DICOM files.

## Data model notes

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

Future APIs should create the `PhrPatient` first, then create clinical records against that `patient_id`. Sharing APIs should add or update `phr_patient_user_access` rows instead of copying clinical records between users.
