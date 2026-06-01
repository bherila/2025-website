import { z } from 'zod'

import { nullableStringDefault } from './zod-helpers'

export const ClientInvoicePaymentSchema = z.object({
  client_invoice_payment_id: z.number(),
  client_invoice_id: z.number(),
  amount: z.string(),
  payment_date: z.string(),
  payment_method: z.string().min(1),
  notes: nullableStringDefault,
  created_at: nullableStringDefault,
  updated_at: nullableStringDefault,
})

export type ClientInvoicePayment = z.infer<typeof ClientInvoicePaymentSchema>
