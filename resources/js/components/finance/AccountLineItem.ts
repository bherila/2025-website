import { z } from 'zod'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
dayjs.extend(customParseFormat)

// Schema for a tag
export const AccountLineItemTagSchema = z.object({
  tag_id: z.number().optional(),
  tag_userid: z.string(),
  tag_color: z.string().max(20),
  tag_label: z.string().max(50),
})

// Schema validation for the account_line_items table
export const AccountLineItemSchema = z.object({
  t_id: z.number().optional(),
  t_account: z.number().nullable().optional(),
  t_date: z.string(),
  t_date_posted: z.string().nullable().optional(),
  t_type: z.string().optional().nullable(),
  t_schc_category: z.string().nullable().optional(),
  t_amt: z.string().optional(),
  t_symbol: z.string().max(20).nullable().optional(),
  t_cusip: z.string().max(20).nullable().optional(),
  t_qty: z.coerce.number().default(0).optional(),
  t_price: z.string().default('0').optional(),
  t_commission: z.string().default('0').optional(),
  t_fee: z.coerce.string().default('0').optional(),
  t_method: z.string().max(20).nullable().optional(),
  t_source: z.string().max(20).nullable().optional(),
  t_origin: z.string().max(20).nullable().optional(),
  opt_expiration: z.string().optional(),
  opt_type: z.enum(['call', 'put']).nullable().optional(),
  opt_strike: z.coerce.string().default('0').nullable().optional(),
  t_description: z.string().max(255).nullable().optional(),
  t_comment: z.string().max(255).nullable().optional(),
  t_from: z.string().nullable().optional(),
  t_to: z.string().nullable().optional(),
  t_interest_rate: z.string().max(20).nullable().optional(),
  t_harvested_amount: z.string().optional().nullable(),
  parent_t_id: z.number().nullable().optional(),
  tags: z.array(AccountLineItemTagSchema).optional(),
})

export type AccountLineItemTag = z.infer<typeof AccountLineItemTagSchema>
export type AccountLineItem = z.infer<typeof AccountLineItemSchema>
