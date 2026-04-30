import { z } from 'zod'

export const taxLotReconciliationStatusSchema = z.enum([
  'matched',
  'variance',
  'missing_account',
  'missing_1099b',
  'duplicate',
])

export const taxLotReconciliationLotSchema = z.object({
  lot_id: z.number(),
  acct_id: z.number(),
  symbol: z.string().nullable(),
  description: z.string().nullable(),
  quantity: z.number(),
  purchase_date: z.string().nullable(),
  sale_date: z.string().nullable(),
  proceeds: z.number().nullable(),
  cost_basis: z.number().nullable(),
  realized_gain_loss: z.number().nullable(),
  is_short_term: z.boolean().nullable(),
  lot_source: z.string().nullable(),
  statement_id: z.number().nullable(),
  close_t_id: z.number().nullable(),
  tax_document_id: z.number().nullable(),
  superseded_by_lot_id: z.number().nullable(),
  reconciliation_status: z.string().nullable(),
  reconciliation_notes: z.string().nullable(),
  tax_document_filename: z.string().nullable(),
})

export const taxLotReconciliationDeltasSchema = z.object({
  quantity: z.number().nullable(),
  proceeds: z.number().nullable(),
  cost_basis: z.number().nullable(),
  realized_gain_loss: z.number().nullable(),
  sale_date_days: z.number().nullable(),
})

export const taxLotReconciliationRowSchema = z.object({
  status: taxLotReconciliationStatusSchema,
  reported_lot: taxLotReconciliationLotSchema.nullable(),
  account_lot: taxLotReconciliationLotSchema.nullable(),
  candidate_lots: z.array(taxLotReconciliationLotSchema),
  deltas: taxLotReconciliationDeltasSchema,
})

export const taxLotReconciliationSummarySchema = z.object({
  matched: z.number(),
  variance: z.number(),
  missing_account: z.number(),
  missing_1099b: z.number(),
  duplicates: z.number(),
  unresolved_account_links: z.number(),
})

export const taxLotReconciliationAccountSchema = z.object({
  account_id: z.number(),
  account_name: z.string(),
  summary: taxLotReconciliationSummarySchema,
  rows: z.array(taxLotReconciliationRowSchema),
})

export const unresolvedTaxDocumentAccountLinkSchema = z.object({
  id: z.number(),
  tax_document_id: z.number(),
  filename: z.string().nullable(),
  form_type: z.string(),
  tax_year: z.number(),
  ai_identifier: z.string().nullable(),
  ai_account_name: z.string().nullable(),
})

export const taxLotReconciliationResponseSchema = z.object({
  tax_year: z.number(),
  summary: taxLotReconciliationSummarySchema,
  accounts: z.array(taxLotReconciliationAccountSchema),
  unresolved_account_links: z.array(unresolvedTaxDocumentAccountLinkSchema),
})

export type TaxLotReconciliationStatus = z.infer<typeof taxLotReconciliationStatusSchema>
export type TaxLotReconciliationLot = z.infer<typeof taxLotReconciliationLotSchema>
export type TaxLotReconciliationRow = z.infer<typeof taxLotReconciliationRowSchema>
export type TaxLotReconciliationAccount = z.infer<typeof taxLotReconciliationAccountSchema>
export type TaxLotReconciliationResponse = z.infer<typeof taxLotReconciliationResponseSchema>
