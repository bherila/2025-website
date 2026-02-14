import { z } from 'zod'
import { ClientInvoicePaymentSchema, ClientInvoicePaymentHydrationSchema } from './invoice-payment'
import { coerceMoney, coerceNumberLike } from './zod-helpers'

// Basic time entry schema
export const InvoiceLineTimeEntrySchema = z.object({
  name: z.string(),
  minutes_worked: z.number(),
  date_worked: z.string().nullable(),
})
export type InvoiceLineTimeEntry = z.infer<typeof InvoiceLineTimeEntrySchema>

export const InvoiceLineSchema = z.object({
  client_invoice_line_id: z.number(),
  description: z.string(),
  quantity: coerceNumberLike('0'),
  unit_price: coerceMoney('0.00'),
  line_total: coerceMoney('0.00'),
  line_type: z.string(),
  hours: coerceNumberLike('0').nullable(),
  line_date: z.string().nullable(),
  time_entries: z.array(InvoiceLineTimeEntrySchema).optional(),
})
export type InvoiceLine = z.infer<typeof InvoiceLineSchema>

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
  retainer_hours_included: z.string(),
  hours_worked: z.string(),
  carried_in_hours: z.number().optional(),
  current_month_hours: z.number().optional(),
  rollover_hours_used: z.string(),
  unused_hours_balance: z.string(),
  negative_hours_balance: z.string(),
  starting_unused_hours: z.string(),
  starting_negative_hours: z.string(),
  hours_billed_at_rate: z.string(),
  notes: z.string().nullable(),
  line_items: z.array(InvoiceLineSchema),
  payments: z.array(ClientInvoicePaymentSchema),
  remaining_balance: z.string(),
  payments_total: z.string(),
  previous_invoice_id: z.number().nullable().optional(),
  next_invoice_id: z.number().nullable().optional(),
})
export type Invoice = z.infer<typeof InvoiceSchema>

// Relaxed schema for server-hydrated invoice payloads (accepts numbers/nulls/missing arrays)
export const InvoiceHydrationSchema = z.object({
  client_invoice_id: z.number(),
  client_company_id: z.number().optional(),
  invoice_number: z.string().nullable().optional(),
  invoice_total: coerceMoney('0.00').optional(),
  issue_date: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  paid_date: z.string().nullable().optional(),
  status: z.string().optional(),
  period_start: z.string().nullable().optional(),
  period_end: z.string().nullable().optional(),
  retainer_hours_included: coerceNumberLike('0').optional(),
  hours_worked: coerceNumberLike('0').optional(),
  carried_in_hours: z.number().optional(),
  current_month_hours: z.number().optional(),
  rollover_hours_used: coerceNumberLike('0').optional(),
  unused_hours_balance: coerceNumberLike('0').optional(),
  negative_hours_balance: coerceNumberLike('0').optional(),
  starting_unused_hours: coerceNumberLike('0').optional(),
  starting_negative_hours: coerceNumberLike('0').optional(),
  hours_billed_at_rate: coerceNumberLike('0').optional(),
  notes: z.string().nullable().optional(),
  line_items: z.array(InvoiceLineSchema).optional().default([]),
  payments: z.array(ClientInvoicePaymentHydrationSchema).optional().default([]),
  remaining_balance: coerceMoney('0.00').optional(),
  payments_total: coerceMoney('0.00').optional(),
  previous_invoice_id: z.number().nullable().optional(),
  next_invoice_id: z.number().nullable().optional(),
})
export type InvoiceHydration = z.infer<typeof InvoiceHydrationSchema>

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