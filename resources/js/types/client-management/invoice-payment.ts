import { z } from 'zod'
import { coerceMoney } from './zod-helpers'

export const ClientInvoicePaymentSchema = z.object({
  client_invoice_payment_id: z.number(),
  client_invoice_id: z.number(),
  amount: z.string(),
  payment_date: z.string(),
  payment_method: z.union([z.literal('Credit Card'), z.literal('ACH'), z.literal('Wire'), z.literal('Check'), z.literal('Other')]),
  notes: z.string().nullable(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
})

export type ClientInvoicePayment = z.infer<typeof ClientInvoicePaymentSchema>

// Relaxed payment schema used only for server-hydrated payloads where some
// fields may be omitted or numeric values may be used instead of strings.
export const ClientInvoicePaymentHydrationSchema = z.object({
  client_invoice_payment_id: z.number().optional(),
  client_invoice_id: z.number().optional(),
  amount: coerceMoney('0.00').optional(),
  payment_date: z.string().optional(),
  payment_method: z.string().optional(),
  notes: z.union([z.string(), z.null()]).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
})
export type ClientInvoicePaymentHydration = z.infer<typeof ClientInvoicePaymentHydrationSchema>
