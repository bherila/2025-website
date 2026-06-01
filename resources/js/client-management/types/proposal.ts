import { z } from 'zod'

import { coerceMoney, coerceNumberLike } from './zod-helpers'

export const PROPOSAL_STATUSES = [
  'draft',
  'sent',
  'changes_requested',
  'accepted',
  'rejected',
  'expired',
] as const
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]

export const PROPOSAL_ITEM_KINDS = ['scope', 'add_on'] as const
export type ProposalItemKind = (typeof PROPOSAL_ITEM_KINDS)[number]

export const ProposalItemSchema = z.object({
  id: z.coerce.number(),
  client_proposal_id: z.coerce.number().optional(),
  kind: z.enum(PROPOSAL_ITEM_KINDS),
  description: z.string(),
  amount: coerceMoney('0.00').nullable().optional(),
  charge_cadence: z.enum(['monthly', 'quarterly', 'semi_annual', 'annual', 'one_time']),
  is_optional: z.coerce.boolean(),
  is_selected: z.coerce.boolean(),
  sort_order: z.coerce.number(),
})
export type ProposalItem = z.infer<typeof ProposalItemSchema>

export const ProposalSchema = z.object({
  id: z.coerce.number(),
  client_company_id: z.coerce.number(),
  root_id: z.coerce.number().nullable().optional(),
  version: z.coerce.number(),
  previous_version_id: z.coerce.number().nullable().optional(),
  agreement_id: z.coerce.number().nullable().optional(),
  project_id: z.coerce.number().nullable().optional(),
  status: z.enum(PROPOSAL_STATUSES),
  is_visible_to_client: z.coerce.boolean(),
  sent_at: z.string().nullable().optional(),
  expires_at: z.string().nullable().optional(),
  title: z.string(),
  body_markdown: z.string().nullable().optional(),
  base_amount: coerceMoney('0.00'),
  base_description: z.string().nullable().optional(),
  credit_amount: coerceMoney('0.00').nullable().optional(),
  credit_label: z.string().nullable().optional(),
  payment_net_days: z.coerce.number(),
  estimated_completion_days: z.coerce.number().nullable().optional(),
  retainer_amount: coerceMoney('0.00').nullable().optional(),
  retainer_interval_months: z.coerce.number().nullable().optional(),
  retainer_included_hours: coerceNumberLike('0').nullable().optional(),
  retainer_hourly_rate: coerceMoney('0.00').nullable().optional(),
  retainer_description: z.string().nullable().optional(),
  client_response_message: z.string().nullable().optional(),
  response_name: z.string().nullable().optional(),
  response_title: z.string().nullable().optional(),
  responded_at: z.string().nullable().optional(),
  accepted_at: z.string().nullable().optional(),
  accept_signature_name: z.string().nullable().optional(),
  accept_signature_title: z.string().nullable().optional(),
  items: z.array(ProposalItemSchema).default([]),
})
export type Proposal = z.infer<typeof ProposalSchema>

/** Retainer interval (months) snapped to the values the billing engine supports. */
export const RETAINER_INTERVALS = [1, 3, 6, 12] as const

const STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  changes_requested: 'Changes Requested',
  accepted: 'Accepted',
  rejected: 'Rejected',
  expired: 'Expired',
}

export function proposalStatusLabel(status: ProposalStatus): string {
  return STATUS_LABELS[status]
}
