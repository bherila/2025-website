import { z } from 'zod'

export const ClientPaymentMethodSchema = z.object({
  id: z.number(),
  type: z.string(),
  brand: z.string().nullable(),
  last4: z.string().nullable(),
  exp_month: z.number().nullable(),
  exp_year: z.number().nullable(),
  bank_name: z.string().nullable(),
  is_default: z.boolean(),
  created_at: z.string().nullable(),
})

export type ClientPaymentMethod = z.infer<typeof ClientPaymentMethodSchema>

export const ClientPaymentMethodListResponseSchema = z.object({
  payment_methods: z.array(ClientPaymentMethodSchema),
})

export type ClientPaymentMethodListResponse = z.infer<typeof ClientPaymentMethodListResponseSchema>
