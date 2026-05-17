# PHR Clinical Data

Clinical data is patient-scoped. Controllers should resolve the patient first with `accessiblePatient($patient, $userId)` from `ResolvesPHRPatientAccess`, then enforce manager access before mutations.

## API pattern

Routes live under the authenticated `/api/phr` group:

```text
GET    /api/phr/patients/{patient}/{resource}
POST   /api/phr/patients/{patient}/{resource}
PATCH  /api/phr/patients/{patient}/{resource}/{id}
DELETE /api/phr/patients/{patient}/{resource}/{id}
```

Labs and vitals currently expose `GET` and `POST`. The newer clinical resources expose `GET`, `POST`, `PATCH`, and `DELETE`.

Read behavior:

- `owner`, `manager`, and `viewer` can list and view patient-scoped records.
- Unshared users get a 404 through patient resolution.

Write behavior:

- `owner` and `manager` can create/update/delete clinical records.
- `viewer` cannot create/update/delete records.
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

Office visits store visit dates/times, provider/facility context, chief complaint, assessment, plan, subjective/objective text, ICD-10/CPT JSON arrays, and raw imported text.

Medications store name, RxNorm code, dose/unit, route, frequency, start/end dates, status, prescriber, reason for use, and raw imported text. The UI badges active, on-hold, discontinued, and completed states.

Conditions store name, ICD-10/SNOMED codes, onset/abatement dates, clinical status, verification status, severity, notes, and raw imported text.

Procedures store name, CPT/SNOMED codes, performed datetime/date, performer/facility context, status, reason, outcome, notes, and raw imported text.

Immunizations store vaccine name, CVX code, manufacturer, lot number, administered date, dose number, series dose count, site, route, administering person/facility, notes, and raw imported text.

Allergies store substance, RxNorm/SNOMED codes, category, criticality, clinical status, verification status, reaction, severity, notes, and raw imported text.

## Frontend validation

PHR frontend schemas live in `resources/js/phr/types.ts`. Keep runtime response schemas and form schemas there, and derive TypeScript types with `z.infer<typeof Schema>`.

Use `compactPayload()` for optional text-heavy forms and `numericPayload()` when converting numeric form fields before sending them through `fetchWrapper`.
