import { z } from 'zod'

export const accountSuggestionAccountSchema = z.object({
  acct_id: z.number(),
  acct_name: z.string(),
  acct_number: z.string().nullable().optional(),
  when_closed: z.string().nullable().optional(),
})

export const accountSuggestionLinkSchema = z.object({
  id: z.number(),
  document_id: z.number(),
  tax_document_id: z.number().nullable().optional(),
  account_id: z.number().nullable().optional(),
  form_type: z.string().nullable().optional(),
  tax_year: z.number().nullable().optional(),
  account_section_label: z.string().nullable().optional(),
  ai_identifier: z.string().nullable().optional(),
  ai_account_name: z.string().nullable().optional(),
  is_reviewed: z.boolean().optional(),
  source_filename: z.string().nullable().optional(),
  account: accountSuggestionAccountSchema.nullable().optional(),
})

export const accountCandidateSchema = z.object({
  account: accountSuggestionAccountSchema,
  score: z.number(),
  reasons: z.array(z.string()),
  is_closed: z.boolean(),
})

export const accountSuggestionResponseSchema = z.object({
  hints: z.object({
    document_id: z.number(),
    link_id: z.number(),
    tax_document_id: z.number().nullable(),
    form_type: z.string().nullable(),
    tax_year: z.number().nullable(),
    account_section_label: z.string().nullable(),
    ai_identifier: z.string().nullable(),
    ai_account_name: z.string().nullable(),
    source_filename: z.string().nullable(),
    broker: z.string().nullable(),
  }),
  suggestions: z.array(accountCandidateSchema),
  similar_links: z.array(accountSuggestionLinkSchema),
})

export const bulkAccountUpdateResponseSchema = z.object({
  affected_link_ids: z.array(z.number()),
  links: z.array(accountSuggestionLinkSchema),
})

export type AccountSuggestionAccount = z.infer<typeof accountSuggestionAccountSchema>
export type AccountSuggestionLink = z.infer<typeof accountSuggestionLinkSchema>
export type AccountCandidate = z.infer<typeof accountCandidateSchema>
export type AccountSuggestionResponse = z.infer<typeof accountSuggestionResponseSchema>
export type BulkAccountUpdateResponse = z.infer<typeof bulkAccountUpdateResponseSchema>
