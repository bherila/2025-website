# PHR Clinical Data

Clinical data is patient-scoped. Controllers inject `App\Services\PHR\Access\PhrPatientAccessService` and resolve the patient first with `accessiblePatient($patient, $userId)` for reads, or `writablePatient($patient, $userId)` for mutations (which 403s for viewers).

## API pattern

Routes live under the authenticated `/api/phr` group:

```text
GET    /api/phr/patients/{patient}/{resource}            # list + can_manage
POST   /api/phr/patients/{patient}/{resource}            # owner/manager only
GET    /api/phr/patients/{patient}/{resource}/{id}       # show single record
PATCH  /api/phr/patients/{patient}/{resource}/{id}       # owner/manager only
DELETE /api/phr/patients/{patient}/{resource}/{id}       # owner/manager only
```

Labs and vitals expose `GET` and `POST` only. All other clinical resources expose the full set including `GET /{id}`.

Every list response includes `can_manage: boolean` alongside the records array — the React side reads it directly instead of making a second patient fetch.

Read behavior:

- `owner`, `manager`, and `viewer` can list and view patient-scoped records.
- Unshared users get a 404 through patient resolution.

Write behavior:

- `owner` and `manager` can create/update/delete clinical records.
- `viewer` gets `AuthorizationException` → HTTP 403.
- Patient profile deletion is owner-only.
- Access grant/revoke is owner-only.

## Resources

| Resource | Table | Model | Controller | React page |
| --- | --- | --- | --- | --- |
| Labs | `phr_lab_results` | `PhrLabResult` | `LabResultController` | `resources/js/phr/labs/LabsPage.tsx` |
| Vitals | `phr_patient_vitals` | `PhrPatientVital` | `VitalController` | `resources/js/phr/vitals/VitalsPage.tsx` |
| Office visits | `phr_office_visits` | `PhrOfficeVisit` | `OfficeVisitController` | `resources/js/phr/office-visits/OfficeVisitsPage.tsx` |
| Medications | `phr_medications` | `PhrMedication` | `MedicationController` | `resources/js/phr/medications/MedicationsPage.tsx` |
| Conditions | `phr_conditions` | `PhrCondition` | `ConditionController` | `resources/js/phr/conditions/ConditionsPage.tsx` |
| Procedures | `phr_procedures` | `PhrProcedure` | `ProcedureController` | `resources/js/phr/procedures/ProceduresPage.tsx` |
| Immunizations | `phr_immunizations` | `PhrImmunization` | `ImmunizationController` | `resources/js/phr/immunizations/ImmunizationsPage.tsx` |
| Allergies | `phr_allergies` | `PhrAllergy` | `AllergyController` | `resources/js/phr/allergies/AllergiesPage.tsx` |

## Field notes

All eight clinical tables carry a `raw_text` column that preserves the source text the row was extracted from (CCDA section, FHIR resource, GenAI excerpt, manual paste). Surface it in detail views; never depend on it for query.

Office visits store visit dates/times, provider/facility context, chief complaint, assessment, plan, subjective/objective text, ICD-10/CPT JSON arrays, and raw imported text.

Medications store name, RxNorm code, dose/unit, route, frequency, start/end dates, status, prescriber, reason for use, and raw imported text. The UI badges active, on-hold, discontinued, and completed states.

Conditions store name, ICD-10/SNOMED codes, onset/abatement dates, clinical status, verification status, severity, notes, and raw imported text.

Procedures store name, CPT/SNOMED codes, performed datetime/date, performer/facility context, status, reason, outcome, notes, and raw imported text.

Immunizations store vaccine name, CVX code, manufacturer, lot number, administered date, dose number, series dose count, site, route, administering person/facility, notes, and raw imported text.

Allergies store substance, RxNorm/SNOMED codes, category, criticality, clinical status, verification status, reaction, severity, notes, and raw imported text.

## Server-side validation

Form Request classes in `App\Http\Requests\PHR\Store*Request` enforce enum values with `Rule::in([...])` rather than free-form strings. Invalid enums return 422 with `assertJsonValidationErrors([...])`-style payloads. Add new accepted values in two places: the Form Request `const` list AND the matching zod enum in `resources/js/phr/types.ts`.

## Frontend conventions

PHR frontend schemas live in `resources/js/phr/types.ts`. Keep runtime response schemas, form schemas, and shared enum schemas there, and derive TypeScript types with `z.infer<typeof Schema>`.

The five full-CRUD pages (conditions, procedures, immunizations, allergies, medications) use the shared `useClinicalCrud` hook in `resources/js/phr/clinical/crud.ts`. The hook owns load/edit/delete state and reads `can_manage` from the list response. Each page wires it up with:

- `parseList` that returns `{ records, canManage }` from the resource's response schema.
- `parseItem` for the single-record response schema.
- `payloadFromForm` that adapts the form state to the API payload (typically `compactPayload({...})`).
- An optional `sortRecords` for stable ordering.
- `formFromRecord` for populating the edit form from a record.

Labs, vitals, and office visits are read-mostly and use their own minimal load function (still reading `can_manage` from the list response).

Shared rendering helpers (`labelize`, `codeChip`, `classBadge`) live in `resources/js/phr/clinical/ui.tsx`. Per-page `STATUS_CLASS`/`CRITICALITY_CLASS` maps stay local because the color choices are domain-specific.

Use `compactPayload()` for optional text-heavy forms and `numericPayload()` when converting numeric form fields before sending them through `fetchWrapper`.
