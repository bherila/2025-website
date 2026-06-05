# PHR Web Pages and Navigation

PHR pages use route-based `/phr/*` URLs with a dedicated PHR layout rather than the global app navbar. `/phr` redirects to `/phr/patients`.

## Web routes

The web surface is mounted from `App\Http\Controllers\PHR\PageController`:

- `/phr/patients` - card grid of patient profiles visible to the current user.
- `/phr/patients/manage` - create, edit, and delete owned/managed patient profiles.
- `/phr/imports` - imports section shell.
- `/phr/config` - config section shell.
- `/phr/patient/{patient}/{tab}` - patient-scoped tabs.

Patient-scoped tabs currently accepted by the route constraint are:

- `summary`
- `labs`
- `vitals`
- `imaging`
- `office-visits`
- `medications`
- `conditions`
- `procedures`
- `immunizations`
- `allergies`
- `documents`
- `access`

Use `resources/js/lib/phrRouteBuilder.ts` for frontend URL construction. Do not hand-build these URLs in page components.

## Layout and React mounting

PHR views extend `resources/views/layouts/phr.blade.php`. That layout includes the app CSS and shared initial app data, but intentionally omits the global main navbar.

Every PHR page mounts the same Vite entrypoint:

```text
resources/js/phr/pages.tsx
```

Blade pages provide two roots:

- `#PhrNavbar` mounts `resources/js/components/phr/PhrNavbar.tsx`.
- `#phr-page-content` mounts the lazy-loaded page component for the active section or tab.

The active section, active tab, and patient id are passed through `data-*` attributes on the mount elements. `pages.tsx` owns the mapping from route metadata to React page component.

## Patient Miller Dock

Patient-scoped navigation uses `resources/js/phr/miller/PhrMillerShell.tsx`, which adapts PHR module registry entries to the shared Miller primitives in `resources/js/components/ui/miller`. PHR owns the module list, patient route sync, and no-patient empty state; the shared layer owns column rendering, home launch tiles, command palette rendering/shortcut behavior, and pinned/recent preference mutation.

## Current pages

`/phr/patients` shows all accessible patients as cards. Each card links to the patient's Summary tab and includes quick links for Labs, Vitals, and Imaging.

`/phr/patients/manage` is the profile CRUD page. It can create new profiles owned by the current user, edit profile fields for owned or managed profiles, and delete owned profiles.

`summary` is a dashboard tile grid. It loads patient details, labs, vitals, and DICOM studies in parallel, shows counts, links into the corresponding tabs, and displays an abnormal-labs banner when flagged lab results exist.

`labs` is a full-page table with date sorting, text filtering by analyte or panel, an abnormal-only filter, reference-range display, and a manager-gated add form.

`vitals` is a full-page table with date sorting, vital-name filtering, tracked vital summaries, and a manager-gated add form. Blood pressure displays as `systolic/diastolic` when both numeric components are present.

`imaging` lists DICOM studies and accepts a `patientId` prop from the route. It fetches `can_manage` from the patient API to show or hide the upload form. Viewer and ZIP buttons use the route patient id.

`access` shows the owner row and patient access grants. Owners can grant access by email and remove non-owner grants; managers and viewers see a read-only list.

`office-visits`, `medications`, `conditions`, `procedures`, `immunizations`, and `allergies` are standalone clinical-data pages with manager-gated add/edit/delete controls. The five full-CRUD pages (medications, conditions, procedures, immunizations, allergies) share the `useClinicalCrud` hook described in [Clinical data](clinical-data.md).

`documents` is the documents browser: filter by type/source/tag/date, grid or list view, manual upload with metadata, inline file viewer (sandboxed iframe), edit metadata, soft delete, and a per-document "Process with GenAI" action that stages the stored file to S3 and dispatches a `phr_document` GenAI job. See [Documents browser](documents.md).

`imports` is a placeholder page; the import-from-export workflow runs via `php artisan phr:import:*` console commands.

`config` is a page shell.

## Frontend conventions

- API calls must use `fetchWrapper`.
- Runtime response validation and form validation live in `resources/js/phr/types.ts` as Zod schemas.
- Shared payload helpers live in `resources/js/phr/shared.ts`.
- Page components should receive `patientId` from routing props instead of reintroducing patient-selection sidebars.
