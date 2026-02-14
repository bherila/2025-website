import { z } from 'zod'

export const ClientInvoicePaymentSchema = z.object({
  client_invoice_payment_id: z.number(),
  client_invoice_id: z.number(),
  amount: z.string(),
  payment_date: z.string(),
  payment_method: z.union([z.literal('Credit Card'), z.literal('ACH'), z.literal('Wire'), z.literal('Check'), z.literal('Other')]),
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type ClientInvoicePayment = z.infer<typeof ClientInvoicePaymentSchema>
