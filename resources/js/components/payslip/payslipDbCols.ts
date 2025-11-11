import { z } from 'zod'
import currency from 'currency.js'

export type pay_data = string | number | currency | null

const maybeStr = z.coerce.string().optional()
const maybeNum = z.coerce.number().default(0)

export const fin_payslip_schema = z
  .object({
    period_start: z
      .string({
        required_error: 'Period start date is required',
        invalid_type_error: 'Period start date must be a valid date string',
      })
      .min(1, { message: 'Period start date cannot be empty' }),
    period_end: z
      .string({
        required_error: 'Period end date is required',
        invalid_type_error: 'Period end date must be a valid date string',
      })
      .min(1, { message: 'Period end date cannot be empty' }),
    pay_date: z
      .string({
        required_error: 'Pay date is required',
        invalid_type_error: 'Pay date must be a valid date string',
      })
      .min(1, { message: 'Pay date cannot be empty' }),

    // Currency fields with maybeNum
    earnings_gross: maybeNum,
    earnings_bonus: maybeNum,
    earnings_net_pay: maybeNum,
    earnings_rsu: maybeNum,
    imp_other: maybeNum,
    imp_legal: maybeNum,
    imp_fitness: maybeNum,
    imp_ltd: maybeNum,
    ps_oasdi: maybeNum,
    ps_medicare: maybeNum,
    ps_fed_tax: maybeNum,
    ps_fed_tax_addl: maybeNum,
    ps_state_tax: maybeNum,
    ps_state_disability: maybeNum,
    ps_state_tax_addl: maybeNum,
    ps_401k_pretax: maybeNum,
    ps_401k_aftertax: maybeNum,
    ps_401k_employer: maybeNum,
    ps_fed_tax_refunded: maybeNum,

    ps_payslip_file_hash: maybeStr,
    ps_is_estimated: z.coerce.boolean().default(false),
    ps_comment: maybeStr,
    ps_pretax_medical: maybeNum,
    ps_pretax_fsa: maybeNum,
    ps_pretax_vision: maybeNum,
    ps_pretax_dental: maybeNum,
    ps_salary: maybeNum,
    ps_vacation_payout: maybeNum,
    other: z.any(),
  })
  .refine(
    (data) => {
      // Additional cross-field validation can be added here if needed
      return true
    },
    {
      message: 'Validation failed',
    },
  )

export type fin_payslip = z.infer<typeof fin_payslip_schema>

export type fin_payslip_col = keyof fin_payslip
