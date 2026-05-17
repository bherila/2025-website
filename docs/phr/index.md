# Personal Health Records

The PHR domain stores user-owned patient profiles and patient-scoped clinical records. A single account can own multiple patients, and an owner can grant another user access to an individual patient profile.

## Quick links

- **[Web pages and navigation](web.md)** - `/phr/*` page routes, the dedicated PHR layout, React page mounting, and current page behavior.
- **[Schema](schema.md)** - patient/access tables, legacy lab/vital normalization, clinical-record tables, and DICOM metadata tables.
- **[Clinical data](clinical-data.md)** - labs, vitals, office visits, medications, conditions, procedures, immunizations, allergies, and access-level behavior.
- **[DICOM imaging](dicom.md)** - upload endpoint, storage disk, retained object paths, upload lifecycle, garbage collection, and parser limits.
- **[OHIF viewer](viewer.md)** - viewer manifest flow and the separate OHIF deployment workflow.

## Code locations

PHR code is kept in dedicated namespaces and folders so the app can be split out later if needed:

- Web/API controllers live under `App\Http\Controllers\PHR`.
- Form requests live under `App\Http\Requests\PHR`.
- DICOM controllers and services stay under `PHR\DICOM` subdirectories.
- Models are named `App\Models\Phr*` and live in `app/Models`.
- Blade views live under `resources/views/phr`; the page layout is `resources/views/layouts/phr.blade.php`.
- React page code lives under `resources/js/phr`; shared PHR navigation lives in `resources/js/components/phr/PhrNavbar.tsx`.
- Canonical PHR URL helpers live in `resources/js/lib/phrRouteBuilder.ts`.
- Tests live under `tests/Feature/PHR`, `resources/js/phr/__tests__`, and `resources/js/components/phr/__tests__`.

## Access model

Patient visibility should flow through `PhrPatient::accessibleBy($userId)` or the `ResolvesPHRPatientAccess` controller concern. Do not check only `owner_user_id` for patient-scoped API or page access, because shared users need read access.

Access levels are:

- `owner` - owns the patient profile, can update/delete the profile, grant/revoke access, and create patient-scoped records.
- `manager` - can update the patient profile and create/update/delete patient-scoped clinical records, but cannot grant access or delete the profile.
- `viewer` - can view the profile, clinical records, imaging metadata/files, and downloads, but cannot mutate patient data.

Unshared users should receive a 404 for patient-scoped page and API lookups so private patient existence is not exposed.
