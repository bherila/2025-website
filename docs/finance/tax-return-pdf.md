# Tax Return PDF Export

Tax Return PDF export generates selectable IRS PDF packets from backend Tax Preview facts. It uses pinned local IRS templates, validates SHA-256 hashes before rendering, does not fetch templates during export, and does not persist generated PDFs by default.

## Current Status

The implemented renderer is `TcpdfFpdiFormEngine`:

- `editable` mode imports committed IRS form backgrounds with FPDI and recreates the visible field layer with TCPDF form widgets. Mapped tax fields are prefilled; unmapped and identity fields remain editable.
- `print` mode imports the same backgrounds and draws static text or checkbox marks only. It does not emit an AcroForm.
- Field coordinates, widget types, on-values, `/DA`, `/Ff`, and `/MaxLen` come from the committed field dumps. The PDF layer does not duplicate tax math.
- Output field names are namespaced and hashed from form id, instance key, and field identity to avoid collisions in multi-form packets and repeated Form 8949 instances.

The original FPDM spike remains documented only as historical context: raw official IRS Form 1040 failed FPDM parsing because of Fast Web View/object-stream parser limits. That does not block this architecture because runtime export uses committed normalized background artifacts and redraws the field layer in pure PHP.

## Pinned Templates

- Manifest: `resources/irs/manifests/2025.json`
- Pinned and mapped 2025 forms:
  - `form-1040`
  - `schedule-1`
  - `schedule-3`
  - `schedule-d`
  - `form-8949`
- Official templates: `resources/irs/forms/2025/*.pdf`
- Normalized backgrounds: `resources/irs/forms/2025/*-bg.pdf`
- Field dumps: `resources/irs/fields/2025/*.fields.json` and `*.fields.txt`
- Field maps: `resources/irs/maps/2025/*.json`

Background artifacts were produced at development time with qpdf, for example:

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

## Export Options Endpoint

`GET /finance/tax-preview/pdf-export-options?year=2025`

This preflight endpoint returns backend-sourced metadata for the export dialog:

- `supportedForms`: pinned/mapped forms that can be selected.
- `recommendedFormIds`: Form 1040 plus supported forms required by current Tax Preview facts.
- `allSupportedFormIds`: every pinned/mapped form in deterministic IRS packet order.
- `unsupportedRequiredForms`: forms that appear required from facts but do not have pinned/mapped PDFs yet.
- `warnings`: non-blocking warnings to show before download.

## Export Endpoint

`POST /finance/tax-preview/export-pdf`

Legacy individual form request:

```json
{
  "year": 2025,
  "scope": "form",
  "formId": "form-1040",
  "mode": "editable",
  "filename": "2025-form-1040.pdf"
}
```

Legacy recommended supported packet request:

```json
{
  "year": 2025,
  "scope": "return",
  "mode": "print",
  "filename": "2025-federal-return.pdf"
}
```

Preferred selectable packet request:

```json
{
  "year": 2025,
  "scope": "selection",
  "formIds": ["form-1040", "schedule-1", "schedule-d"],
  "mode": "editable",
  "includeProfilePii": false,
  "filename": "2025-supported-packet.pdf"
}
```

Successful exports return `application/pdf` with attachment disposition. Non-blocking warnings are also returned in `X-Tax-Return-Pdf-Warnings` as base64-encoded JSON. Each attempt creates a `fin_tax_return_pdf_exports` audit row with user id, year, scope, rendered form ids, mode, status, timestamp, filename, and a non-sensitive summary.

## Profile Data and PII

Per-user, per-year profile data is stored in `fin_tax_return_profiles`. Sensitive fields such as SSNs, IP PINs, and direct-deposit account data use encrypted casts. Export errors, warnings, and audit rows must not include decrypted values.

Taxpayer identity/profile fields do not block export. By default, saved profile PII is not passed to PDF field resolution, so names, SSNs, and address/header fields are blank and can be completed manually in editable PDFs. Existing saved identity fields are included only when `includeProfilePii` is explicitly `true`.

## Warning Semantics

Warnings do not block PDF generation. They include missing identity fields, unsupported required forms omitted from the supported packet, Form 8949 detail rows that cannot be mapped to supported boxes, Schedule 3 line 6 details that cannot be fully itemized, and selected forms that may render blank.

Blocking errors are reserved for no selected forms, unsupported selected form IDs, unavailable editable rendering, missing or invalid templates/maps, and rendering failures.

## Limits

- The 2025 supported PDF packet is limited to `form-1040`, `schedule-1`, `schedule-3`, `schedule-d`, and `form-8949` until more templates and maps are pinned.
- Unsupported required schedules are omitted from supported packets and surfaced as warnings instead of blocking export.
- Editable output recreates fields with hashed names rather than preserving the original IRS AcroForm field names in the generated PDF. The source field map still uses real IRS field names from the pinned template.
- No Java, PDFtk, commercial SetaPDF package, or GPL/AGPL runtime package is required.
- Development-time normalization is allowed only when the normalized official template is committed and covered by manifest hashes.
- No runtime/export-time template rewriting or IRS template fetching.
