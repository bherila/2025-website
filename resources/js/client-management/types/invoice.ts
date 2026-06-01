import { z } from 'zod'

import { ClientInvoicePaymentSchema } from './invoice-payment'
import { coerceMoney, coerceNumberLike, nullableStringDefault } from './zod-helpers'

// Basic time entry schema (used as a subitem on an invoice line)
export const InvoiceLineTimeEntrySchema = z.object({
  name: z.string().nullable(),
  minutes_worked: z.number(),
  date_worked: z.string().nullable(),
  is_deferred_billing: z.boolean(),
})
export type InvoiceLineTimeEntry = z.infer<typeof InvoiceLineTimeEntrySchema>

// A single deferred time entry that did not fit the retainer capacity this cycle.
// Surfaced under the invoice's line items so admins can see what is rolling forward.
export const DeferredPendingBilledInvoiceSchema = z.object({
  id: z.number(),
  invoice_number: z.string().nullable(),
  issue_date: z.string().nullable(),
})
export type DeferredPendingBilledInvoice = z.infer<typeof DeferredPendingBilledInvoiceSchema>

export const DeferredPendingEntrySchema = z.object({
  id: z.number(),
  hours: z.number(),
  date_worked: z.string(),
  name: z.string().nullable(),
  billed_invoice: DeferredPendingBilledInvoiceSchema.nullable(),
})
export type DeferredPendingEntry = z.infer<typeof DeferredPendingEntrySchema>

export const InvoiceLineSchema = z.object({
  client_invoice_line_id: z.number(),
  description: z.string(),
  quantity: z.preprocess((v) => (v == null ? '' : String(v)), z.string()),
  unit_price: coerceMoney('0.00'),
  line_total: coerceMoney('0.00'),
  line_type: z.string(),
  hours: coerceNumberLike('0').nullable(),
  line_date: z.string().nullable(),
  time_entries: z.array(InvoiceLineTimeEntrySchema),
  client_agreement_recurring_item_id: z.number().nullable(),
})
export type InvoiceLine = z.infer<typeof InvoiceLineSchema>

export const InvoiceStripePaymentSchema = z.object({
  id: z.number(),
  stripe_payment_intent_id: z.string(),
  stripe_payment_method_id: nullableStringDefault,
  amount: z.number(),
  status: z.string(),
  failure_reason: nullableStringDefault,
  last_event_id: nullableStringDefault,
  created_at: nullableStringDefault,
  updated_at: nullableStringDefault,
})
export type InvoiceStripePayment = z.infer<typeof InvoiceStripePaymentSchema>

// NOTE: payments shape isn't fully modeled here — keep as unknown for now.
export const InvoiceSchema = z.object({
  client_invoice_id: z.number(),
  client_company_id: z.number(),
  invoice_number: z.string().nullable(),
  invoice_total: z.string(),
  issue_date: z.string().nullable(),
  due_date: z.string().nullable(),
  paid_date: z.string().nullable(),
  status: z.enum(['draft', 'issued', 'paid', 'void', 'canceled']),
  period_start: z.string().nullable(),
  period_end: z.string().nullable(),
  invoice_kind: z.enum(['cadence_period', 'interim_overage', 'terminal', 'ad_hoc']),
  cycle_start: z.string().nullable(),
  cycle_end: z.string().nullable(),
  retainer_hours_included: z.string(),
  hours_worked: z.string(),
  carried_in_hours: z.number(),
  current_month_hours: z.number(),
  negative_offset: z.number(),
  rollover_hours_used: z.string(),
  unused_hours_balance: z.string(),
  negative_hours_balance: z.string(),
  starting_unused_hours: z.string().nullable(),
  starting_negative_hours: z.string().nullable(),
  hours_billed_at_rate: z.string(),
  notes: z.string().nullable(),
  line_items: z.array(InvoiceLineSchema),
  payments: z.array(ClientInvoicePaymentSchema),
  stripe_payments: z.array(InvoiceStripePaymentSchema).optional().default([]),
  remaining_balance: z.string(),
  payments_total: z.string(),
  credit_applied: z.number(),
  overpaid_amount: z.number(),
  available_credit_after: z.number(),
  deferred_pending: z.array(DeferredPendingEntrySchema),
  previous_invoice_id: z.number().nullable().optional(),
  next_invoice_id: z.number().nullable().optional(),
})
export type Invoice = z.infer<typeof InvoiceSchema>

export const InvoicePreviewSchema = z.object({
  period_start: z.string(),
  period_end: z.string(),
  time_entries_count: z.number(),
  hours_worked: z.number(),
  invoice_total: z.number(),
  delayed_billing_hours: z.number(),
  delayed_billing_entries_count: z.number(),
  agreement: z
    .object({
      monthly_retainer_hours: z.string(),
      monthly_retainer_fee: z.string(),
      hourly_rate: z.string(),
    })
    .optional(),
  calculation: z
    .object({
      hours_covered_by_retainer: z.number(),
      rollover_hours_used: z.number(),
      hours_billed_at_rate: z.number(),
      unused_hours_balance: z.number(),
    })
    .optional(),
})
export type InvoicePreview = z.infer<typeof InvoicePreviewSchema>

// Lightweight invoice item used for hydrated invoice lists (server often returns minimal fields)
export const InvoiceListItemSchema = z.object({
  client_invoice_id: z.number(),
  client_company_id: z.number().optional(),
  invoice_number: z.string().nullable().optional(),
  invoice_total: coerceMoney('0.00'),
  issue_date: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  status: z.string(),
  period_start: z.string().nullable().optional(),
  period_end: z.string().nullable().optional(),
  invoice_kind: z.string().optional(),
  cycle_start: z.string().nullable().optional(),
  cycle_end: z.string().nullable().optional(),
  remaining_balance: coerceMoney('0.00').optional(),
  payments_total: coerceMoney('0.00').optional(),
})
export type InvoiceListItem = z.infer<typeof InvoiceListItemSchema>
// Props used by small utility components (typed, callbacks not validated at runtime)
export interface ClientAdminActionsProps {
  companyId: number
  onClose: () => void
  onSuccess?: () => void
}
