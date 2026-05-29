import { z } from 'zod'

import { accountSuggestionLinkSchema } from './account-suggestion'

export const lotReconciliationLinkStateSchema = z.enum([
  'auto_matched',
  'needs_review',
  'accepted_broker',
  'accepted_account_override',
  'ignored_duplicate',
  'unlinked',
  'broker_only',
  'account_only',
])

export const lotReconciliationLinkStateCountsSchema = z.object({
  auto_matched: z.number(),
  needs_review: z.number(),
  accepted_broker: z.number(),
  accepted_account_override: z.number(),
  ignored_duplicate: z.number(),
  unlinked: z.number(),
  broker_only: z.number(),
  account_only: z.number(),
})

export const lotReconciliationDashboardStatusSchema = z.enum(['in_sync', 'needs_review', 'drift'])
export const reconciliationHealthSchema = z.enum(['ok', 'drift', 'blocked'])
export const lotMatchRunStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'superseded'])
export const lotMatchRunModeSchema = z.enum(['preserve', 'force'])

export const lotMatchRunSchema = z.object({
  id: z.number(),
  document_id: z.number(),
  user_id: z.number(),
  status: lotMatchRunStatusSchema,
  mode: lotMatchRunModeSchema,
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  result_summary: z.record(z.string(), z.unknown()).nullable(),
  error: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

export const lotMatchRunsResponseSchema = z.object({
  tax_document_id: z.number(),
  document_id: z.number().nullable(),
  runs: z.array(lotMatchRunSchema),
})

export const problemBucketCountsSchema = z.object({
  missing_accounts: z.number(),
  mismatches: z.number(),
  broker_only: z.number(),
  account_only: z.number(),
  duplicates: z.number(),
  auto_matched: z.number(),
})

export const lotReconciliationLotSchema = z.object({
  lot_id: z.number(),
  acct_id: z.number(),
  account_name: z.string().nullable(),
  symbol: z.string().nullable(),
  description: z.string().nullable(),
  cusip: z.string().nullable(),
  quantity: z.number().nullable(),
  purchase_date: z.string().nullable(),
  sale_date: z.string().nullable(),
  proceeds: z.number().nullable(),
  cost_basis: z.number().nullable(),
  wash_sale_disallowed: z.number().nullable(),
  realized_gain_loss: z.number().nullable(),
  is_short_term: z.boolean().nullable(),
  form_8949_box: z.string().nullable(),
  is_covered: z.boolean().nullable(),
  source: z.string().nullable(),
  lot_source: z.string().nullable(),
  reconciliation_status: z.string().nullable(),
  superseded_by_lot_id: z.number().nullable(),
})

export const lotReconciliationMatchReasonSchema = z.object({
  reason_code: z.string(),
  score: z.number(),
  deltas: z.object({
    proceeds: z.number().nullable(),
    basis: z.number().nullable(),
    wash: z.number().nullable(),
    qty: z.number().nullable(),
    date_days: z.number().nullable(),
  }),
  notes: z.string().nullable(),
})

export const lotReconciliationLinkSchema = z.object({
  id: z.number(),
  tax_document_id: z.number().nullable(),
  broker_lot_id: z.number().nullable(),
  account_lot_id: z.number().nullable(),
  state: lotReconciliationLinkStateSchema,
  match_reason: lotReconciliationMatchReasonSchema.nullable(),
  accepted_by_user_id: z.number().nullable(),
  accepted_at: z.string().nullable(),
  broker_lot: lotReconciliationLotSchema.nullable(),
  account_lot: lotReconciliationLotSchema.nullable(),
})

export const lotReconciliationLinksResponseSchema = z.object({
  document: z.object({
    id: z.number(),
    document_id: z.number().nullable(),
    broker: z.string().nullable(),
    tax_year: z.number(),
    form_type: z.string(),
    original_filename: z.string().nullable(),
    last_matched_at: z.string().nullable(),
    account_links: z.array(accountSuggestionLinkSchema),
  }),
  summary: z.object({
    total: z.number(),
    link_state_counts: lotReconciliationLinkStateCountsSchema,
  }),
  links: z.array(lotReconciliationLinkSchema),
  relink_candidates: z.array(lotReconciliationLotSchema),
})

export const taxDocumentReconciliationReportSchema = z.object({
  tax_document_id: z.number(),
  broker: z.string().nullable(),
  tax_year: z.number(),
  form_type: z.string(),
  last_matched_at: z.string().nullable(),
  status: z.string(),
  dashboard_status: lotReconciliationDashboardStatusSchema,
  link_state_counts: lotReconciliationLinkStateCountsSchema,
  summary: z.object({
    status: z.string(),
    entry_count: z.number(),
    expected_lot_count: z.number(),
    broker_lot_count: z.number(),
    diagnostics_count: z.number(),
    max_delta: z.number(),
  }).passthrough(),
  diagnostics: z.array(z.object({
    code: z.string(),
    severity: z.string(),
    message: z.string(),
  }).passthrough()),
  entries: z.array(z.unknown()),
})

export const taxYearLotReconciliationResponseSchema = z.object({
  user_id: z.number(),
  tax_year: z.number(),
  summary: z.object({
    status: z.string(),
    dashboard_status: lotReconciliationDashboardStatusSchema,
    document_count: z.number(),
    documents_by_status: z.object({
      in_sync: z.number(),
      needs_review: z.number(),
      drift: z.number(),
    }),
    diagnostics_count: z.number(),
    max_delta: z.number(),
  }).passthrough(),
  documents: z.array(z.object({
    tax_document_id: z.number(),
    broker: z.string().nullable(),
    tax_year: z.number(),
    form_type: z.string(),
    last_matched_at: z.string().nullable(),
    status: z.string(),
    dashboard_status: lotReconciliationDashboardStatusSchema,
    link_state_counts: lotReconciliationLinkStateCountsSchema,
    summary: z.object({
      diagnostics_count: z.number(),
      max_delta: z.number(),
    }).passthrough(),
  }).passthrough()),
})

export const taxYearReconciliationSummaryResponseSchema = z.object({
  user_id: z.number(),
  tax_year: z.number(),
  summary: z.object({
    document_count: z.number(),
    unresolved_account_links: z.number(),
    link_state_counts: lotReconciliationLinkStateCountsSchema,
    documents_by_health: z.object({
      ok: z.number(),
      drift: z.number(),
      blocked: z.number(),
    }),
    problem_bucket_counts: problemBucketCountsSchema,
  }),
  documents: z.array(z.object({
    tax_document_id: z.number(),
    document_id: z.number().nullable(),
    broker: z.string().nullable(),
    form_type: z.string(),
    original_filename: z.string().nullable(),
    tax_year: z.number(),
    health: reconciliationHealthSchema,
    last_matched_at: z.string().nullable(),
    unresolved_account_links: z.number(),
    link_state_counts: lotReconciliationLinkStateCountsSchema,
    problem_bucket_counts: problemBucketCountsSchema,
    latest_match_run: lotMatchRunSchema.nullable(),
  })),
  unresolved_account_links: z.array(accountSuggestionLinkSchema),
})

export type LotReconciliationLinkState = z.infer<typeof lotReconciliationLinkStateSchema>
export type LotReconciliationLinkStateCounts = z.infer<typeof lotReconciliationLinkStateCountsSchema>
export type LotReconciliationDashboardStatus = z.infer<typeof lotReconciliationDashboardStatusSchema>
export type ReconciliationHealth = z.infer<typeof reconciliationHealthSchema>
export type LotMatchRunStatus = z.infer<typeof lotMatchRunStatusSchema>
export type LotMatchRunMode = z.infer<typeof lotMatchRunModeSchema>
export type LotMatchRun = z.infer<typeof lotMatchRunSchema>
export type LotMatchRunsResponse = z.infer<typeof lotMatchRunsResponseSchema>
export type ProblemBucketCounts = z.infer<typeof problemBucketCountsSchema>
export type LotReconciliationLot = z.infer<typeof lotReconciliationLotSchema>
export type LotReconciliationLink = z.infer<typeof lotReconciliationLinkSchema>
export type LotReconciliationLinksResponse = z.infer<typeof lotReconciliationLinksResponseSchema>
export type TaxDocumentReconciliationReport = z.infer<typeof taxDocumentReconciliationReportSchema>
export type TaxYearLotReconciliationResponse = z.infer<typeof taxYearLotReconciliationResponseSchema>
export type TaxYearReconciliationSummaryResponse = z.infer<typeof taxYearReconciliationSummaryResponseSchema>
