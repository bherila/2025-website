# Payslips

**Routes**: `GET /finance/payslips` (list), `GET /finance/payslips/entry` (create/edit)
**Components**: `resources/js/components/payslip/PayslipClient.tsx`, `PayslipDetailClient.tsx`, `PayslipTable.tsx`, `TotalsTable.client.tsx`

The Payslips page records each pay stub as a structured payslip entry. All monetary math uses `currency.js`. The data feeds into the Tax Preview W-2 income summary.

---

## Payslip List Page

- Year selector tabs at the top (year comes from URL `?year=YYYY`).
- **PayslipTable** — tabular view of all payslips for the year. Inline editing supported.
- **TotalsTable** — quarterly running totals (Q1, Q2, Q3, Q4 YTD) for federal and California state taxes.
- **Add Payslip** button — navigates to `/finance/payslips/entry?year=YYYY`.
- **Edit as JSON** button — opens `PayslipJsonModal` in `bulk` mode for direct editing.
- **Import** buttons — CSV/TSV import and `PayslipImportModal` for copy-paste imports.

## Payslip Detail Page

- Form fields for all payslip columns (dates, earnings, taxes, deductions, 401k).
- **W-2 Job selector** — links the payslip to a W-2 employment entity.
- **Edit as JSON** button — opens `PayslipJsonModal` in `single` mode with an LLM prompt.
- **Save Edits** / **Save as New** / **Delete** buttons.

## JSON Editing (PayslipJsonModal)

`resources/js/components/payslip/PayslipJsonModal.tsx` handles both single and bulk payslip editing:
- **Validation** — uses `fin_payslip_schema` (Zod) for single-item and `z.array(fin_payslip_schema)` for bulk.
- **LLM Prompt** — loads `GET /api/payslips/prompt` to display a copyable prompt + JSON schema.
- **Modes**: `single` → `POST /api/payslips`; `bulk` → `POST /api/payslips/bulk`

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/payslips` | List payslips (filter with `?year=YYYY`) |
| `GET` | `/api/payslips/years` | List years with payslip data |
| `GET` | `/api/payslips/prompt` | LLM prompt + JSON schema for payslip extraction |
| `GET` | `/api/payslips/{id}` | Single payslip by ID |
| `POST` | `/api/payslips` | Create or update a single payslip |
| `POST` | `/api/payslips/bulk` | Bulk create/update an array of payslips |
| `DELETE` | `/api/payslips/{id}` | Delete a payslip |
| `POST` | `/api/payslips/{id}/estimated-status` | Toggle `ps_is_estimated` flag |
| `POST` | `/api/payslips/import` | CSV/TSV bulk import |

---

## Payslip Schema

The canonical Zod schema is `fin_payslip_schema` in `resources/js/components/payslip/payslipDbCols.ts`. The TypeScript type `fin_payslip` is inferred via `z.infer<typeof fin_payslip_schema>`.

Key field groups:

| Group | Fields |
|-------|--------|
| Dates | `period_start`, `period_end`, `pay_date` |
| Earnings | `ps_salary`, `earnings_gross`, `earnings_bonus`, `earnings_rsu`, `earnings_net_pay`, `ps_vacation_payout` |
| Imputed income | `imp_legal`, `imp_fitness`, `imp_ltd`, `imp_other` |
| Federal taxes | `ps_oasdi`, `ps_medicare`, `ps_fed_tax`, `ps_fed_tax_addl`, `ps_fed_tax_refunded` |
| State taxes | `ps_state_tax`, `ps_state_disability`, `ps_state_tax_addl` |
| Retirement | `ps_401k_pretax`, `ps_401k_aftertax`, `ps_401k_employer` |
| Pre-tax deductions | `ps_pretax_medical`, `ps_pretax_dental`, `ps_pretax_vision`, `ps_pretax_fsa` |
| Meta | `ps_is_estimated`, `ps_comment`, `ps_payslip_file_hash`, `employment_entity_id` |
