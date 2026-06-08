# Tax Return PDF Export

Tax Return PDF export generates IRS Form 1040 PDFs from backend Tax Preview facts plus the backend-owned tax-return profile. It uses pinned local IRS templates, validates SHA-256 hashes before rendering, does not fetch templates during export, and does not persist generated PDFs by default.

## Current Status

The implemented renderer is `TcpdfFpdiFormEngine`:

- `editable` mode imports the committed Form 1040 background with FPDI and recreates the visible field layer with TCPDF form widgets. Mapped fields are prefilled; unmapped fields remain blank and editable.
- `print` mode imports the same background and draws static text or checkbox marks only. It does not emit an AcroForm.
- Field coordinates, widget types, on-values, `/DA`, `/Ff`, and `/MaxLen` come from the committed field dump. The PDF layer does not duplicate tax math.
- Output field names are namespaced and hashed from form id, instance key, and field identity to avoid collisions if complete-return packets later include multiple form instances.

The original FPDM spike remains documented only as historical context: raw official IRS Form 1040 failed FPDM parsing because of Fast Web View/object-stream parser limits. That does not block this architecture because runtime export uses a committed normalized background artifact and redraws the field layer in pure PHP.

## Pinned Templates

- Manifest: `resources/irs/manifests/2025.json`
- Official template: `resources/irs/forms/2025/f1040.pdf`
- Official SHA-256: `3d31c226df0d189ced80e039d01cf0f8820c1019681a0f0ca6264de277b7e982`
- Normalized background: `resources/irs/forms/2025/f1040-bg.pdf`
- Background SHA-256: `5c9df498d4b8443dbfb67b17df8d6a7abeb5288706fe98bbce6a28e426b5b3b3`
- Field dump:
  - `resources/irs/fields/2025/form-1040.fields.json`
  - `resources/irs/fields/2025/form-1040.fields.txt`
- Field map: `resources/irs/maps/2025/form-1040.json`

The background artifact was produced at development time with:

```bash
qpdf --object-streams=disable --force-version=1.4 resources/irs/forms/2025/f1040.pdf resources/irs/forms/2025/f1040-bg.pdf
```

`IrsPdfTemplateRepository` validates both the official template hash and the normalized background hash. qpdf, Ghostscript, Java, PDFtk, and network fetches are not used during user export requests.

## Commands

Dump fields from a pinned form:

```bash
php artisan finance:irs-forms:dump-fields --year=2025 --form=form-1040
```

Generate QA PDFs:

```bash
php artisan finance:tax-return-pdf --user=1 --year=2025 --form=form-1040 --mode=editable --out=storage/app/testing/2025-form-1040-editable.pdf
php artisan finance:tax-return-pdf --user=1 --year=2025 --form=form-1040 --mode=print --out=storage/app/testing/2025-form-1040-print.pdf
```

The QA command writes only the explicit `--out` file. Normal web exports return bytes directly and do not save PDFs.

## Endpoint

`POST /finance/tax-preview/export-pdf`

Example individual form request:

```json
{
  "year": 2025,
  "scope": "form",
  "formId": "form-1040",
  "mode": "editable",
  "filename": "2025-form-1040.pdf"
}
```

Example complete-return request:

```json
{
  "year": 2025,
  "scope": "return",
  "mode": "print",
  "filename": "2025-federal-return.pdf"
}
```

Successful exports return `application/pdf` with attachment disposition. Each attempt creates a `fin_tax_return_pdf_exports` audit row with user id, year, scope, form ids, mode, status, timestamp, filename, and a non-sensitive error summary.

## Profile Data

Per-user, per-year profile data is stored in `fin_tax_return_profiles`. Sensitive fields such as SSNs, IP PINs, and direct-deposit account data use encrypted casts. Export errors and audit rows must not include decrypted values.

Individual Form 1040 export can proceed with profile fields blank; editable mode leaves those fields available for manual completion. Complete-return export requires profile readiness and blocks if required forms are not pinned/mapped.

## Limits

- Only 2025 Form 1040 is pinned and mapped in this MVP.
- Complete return currently renders the Form 1040 packet only when no unsupported schedules appear required by Tax Preview facts.
- Unsupported required schedules block complete-return export instead of producing a partial return packet.
- Editable output recreates fields with hashed names rather than preserving the original IRS AcroForm field names in the generated PDF. The source field map still uses real IRS field names from the pinned template.
- No Java, PDFtk, commercial SetaPDF package, or GPL/AGPL runtime package is required.
- Development-time normalization is allowed only when the normalized official template is committed and covered by manifest hashes.
- No runtime/export-time template rewriting or IRS template fetching.
