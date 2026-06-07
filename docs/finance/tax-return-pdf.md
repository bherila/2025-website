# Tax Return PDF Export

Tax Return PDF export is currently a blocked/readiness MVP. The application pins the official IRS fillable Form 1040 PDF locally, validates its SHA-256 hash, dumps real AcroForm fields without PDFtk/Java, validates a human-readable field map against those fields, and exposes an authenticated export endpoint that returns clear readiness errors and writes an audit record. It does not generate or persist PDFs until a native editable AcroForm fill engine is available.

## Current Status

The FPDM spike against the current official IRS Form 1040 template failed before field filling:

```text
FPDF-Merge Error: Fast Web View mode is not supported
```

Development-time template normalization is acceptable if the normalized official template is committed to the repository and validated with manifest hashes. Runtime/export-time preprocessing is not acceptable: user export requests must use pinned local templates and must not invoke Java, PDFtk, qpdf, Ghostscript, or network fetches.

Normalization was re-spiked locally with these development-time candidates:

```bash
qpdf --object-streams=disable --stream-data=preserve --normalize-content=n resources/irs/forms/2025/f1040.pdf storage/app/testing/f1040-qpdf-object-streams-disabled.pdf
qpdf --qdf --object-streams=disable resources/irs/forms/2025/f1040.pdf storage/app/testing/f1040-qpdf-qdf.pdf
qpdf --force-version=1.4 --object-streams=disable --stream-data=uncompress --decode-level=all resources/irs/forms/2025/f1040.pdf storage/app/testing/f1040-qpdf-v14-uncompressed.pdf
qpdf --force-version=1.4 --object-streams=disable --stream-data=compress --decode-level=all resources/irs/forms/2025/f1040.pdf storage/app/testing/f1040-qpdf-v14-compressed.pdf
```

Those qpdf outputs kept the XFA/form metadata, but FPDM still failed:

```text
FilterFlateDecode: invalid stream data
FPDF-Merge Error: trailer_table corrupted?; missing start delimiter <<
```

Ghostscript was also tried as a non-Java development-time normalizer, but its output reported `Form: none`, which drops editability and is not acceptable as the primary fillable-form path.

The `tmw/fpdm` dependency was removed after these failed spikes.

The production native-PHP path should be a licensed AcroForm filler such as SetaPDF-FormFiller. A scaffold class exists, but no licensed implementation is wired.

## Pinned Template

- Manifest: `resources/irs/manifests/2025.json`
- Template: `resources/irs/forms/2025/f1040.pdf`
- SHA-256: `3d31c226df0d189ced80e039d01cf0f8820c1019681a0f0ca6264de277b7e982`
- Field dump:
  - `resources/irs/fields/2025/form-1040.fields.json`
  - `resources/irs/fields/2025/form-1040.fields.txt`
- Field map: `resources/irs/maps/2025/form-1040.json`

Templates are never fetched during export. `IrsPdfTemplateRepository` validates the pinned file exists and matches the manifest hash before use.

## Commands

Dump fields from a pinned form:

```bash
php artisan finance:irs-forms:dump-fields --year=2025 --form=form-1040
```

Run the FPDM spike command:

```bash
php artisan finance:irs-form-fill-spike --year=2025 --form=form-1040 --out=storage/app/testing/f1040-fpdm-spike.pdf
```

In this branch the command fails clearly because FPDM is not installed after the failed spike.

Attempt the CLI export path:

```bash
php artisan finance:tax-return-pdf --user=1 --year=2025 --form=form-1040 --mode=editable --out=storage/app/testing/2025-form-1040-editable.pdf
```

This currently returns the native-engine blocked error and writes no PDF.

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

Example complete return readiness request:

```json
{
  "year": 2025,
  "scope": "return",
  "mode": "print",
  "filename": "2025-federal-return.pdf"
}
```

Until an engine is available, the endpoint returns HTTP 422 with `errors` and `warnings`. Each attempt creates a `fin_tax_return_pdf_exports` audit row with user id, year, scope, form ids, mode, status, timestamp, filename, and a non-sensitive error summary. Generated PDFs are not stored by default.

## Profile Data

Per-user, per-year profile data is stored in `fin_tax_return_profiles`. Sensitive fields such as SSNs, IP PINs, and direct-deposit account data use encrypted casts. Export errors and audit rows must not include decrypted values.

Complete return export requires profile readiness. Individual Form 1040 export may leave profile fields blank when a future editable engine is available, because the user can manually complete unfilled fields.

## Limits

- No Java or PDFtk dependency.
- Development-time normalization is allowed only when the normalized official template is committed and covered by manifest hashes.
- No runtime/export-time template rewriting or IRS template fetching.
- No coordinate stamping as the primary path while IRS fillable fields are available.
- FPDI/TCPDF remains a fallback only for future static overlays, continuation pages, or flattened print packets.
- Complete editable return merging is blocked until field-collision behavior is proven safe.
- Unsupported required schedules block complete-return export instead of producing a partial return packet.
