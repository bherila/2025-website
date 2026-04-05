# ISSUE-150: Form 1116 (Foreign Tax Credit) Support

## Overview
Implement support for IRS Form 1116 (Foreign Tax Credit) in the Finance Tool. This includes extracting data from PDFs (via K-3 or direct 1116 forms), calculating interest expense apportionment using the "Asset Method," and providing a user interface for review and worksheet-based adjustments.

## 1. UI Requirements

### Tax Preview Page Updates [DONE]
- Added a new column to the "Account Documents" table (after 1099-MISC) titled **"Foreign Tax"**.
- Added a button labeled **"1116 Worksheet"** in this column.

### Form 1116 Worksheet Modal [DONE]
- Clicking "1116 Worksheet" opens a modal to assist in calculating **Line 4a** and **Line 4b**.
- Automatically suggests values for "Adjusted Basis" by querying `fin_account_lots` via new `GET /api/finance/all/lots` endpoint.
  - **Total Assets:** Sum of `cost_basis` for all open lots in the account as of the end of the tax year.
  - **Foreign Assets:** Filter lots in accounts that have received foreign tax distributions.

### Review Document Modal Updates [DONE]
- `TaxDocumentReviewModal.tsx` updated to render `F1116ReviewPanel` if `formType` is `1116`.
- Support for `fieldType: "multiLineText"` added in `F1116ReviewPanel.tsx`.
- Visual highlighting for fields with `confidence < 0.85` (and without manual override) added to both `F1116ReviewPanel` and `K1ReviewPanel`.

## 2. Data Modeling [DONE]

### Form 1116 JSON Structure
Consistent with the flexible JSON blob strategy for K-1/K-3:
Implemented in `resources/js/finance/1116/types.ts`.

## 3. Extraction & Mapping Logic [DONE]

### K-3 to Form 1116 Mapping
- Implemented `resources/js/finance/1116/k3-to-1116.ts`.
- Handles mapping from K-1 Box 16 fields and 1099-DIV/INT foreign tax fields.

## 4. Implementation Details

### Directory Structure [DONE]
```
/resources/js/finance/1116/
  F1116_SPEC.ts        (Field specification for renderer)
  k3-to-1116.ts       (Mapping logic)
  WorksheetModal.tsx   (1116 Apportionment Worksheet)
  F1116ReviewPanel.tsx (Review/Edit UI)
  types.ts             (Type definitions for 1116)
  index.ts             (Barrel exports)
```

### Documentation [DONE]
Updated the following files:
- `docs/finance/FinanceTool.md`
- `docs/finance/TaxSystem.md`
- `docs/GenAI-Import.md`

## 5. Validations & Testing

- **Automated Tests:**
  - [DONE] Unit tests for K-3 → 1116 mapping logic in `tests-ts/k3-to-1116.test.ts`.
  - [TODO] Snapshot tests for `F1116ReviewPanel`.
- **Manual Validations:**
  - [DONE] Verified `GET /api/finance/all/lots` route and controller logic.
  - [DONE] Verified Worksheet basis discovery logic.
  - [DONE] Verified Review Panel confidence highlighting.

## 6. Execution Note
This feature was implemented using **Claude Sonnet**. **Opus** is reserved for actual PDF data extraction at runtime.
