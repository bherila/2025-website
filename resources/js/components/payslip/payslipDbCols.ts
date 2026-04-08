import currency from 'currency.js'
import { z } from 'zod'

export type pay_data = string | number | currency | null

const maybeStr = z.coerce.string().optional()
// Canonical numeric type used for every monetary column.
// Keep in sync with the PHP payslipRules() numeric|nullable rules.
const maybeNum = z.coerce.number().default(0)

// ─── Child table schemas ──────────────────────────────────────────────────────

/**
 * Per-state tax data row.  Canonical source for state income tax, SDI, and
 * taxable wages.  The three flat columns (ps_state_tax, ps_state_tax_addl,
 * ps_state_disability) were migrated into this table and dropped from
 * fin_payslip.
 */
export const fin_payslip_state_data_schema = z.object({
  id: z.number().optional(),
  payslip_id: z.number().optional(),
  state_code: z.string().min(2).max(2),
  taxable_wages: maybeNum,
  state_tax: maybeNum,
  state_tax_addl: maybeNum,
  state_disability: maybeNum,
})

export type fin_payslip_state_data = z.infer<typeof fin_payslip_state_data_schema>

/**
 * Bank deposit split for a payslip.
 * SUM(amount) should equal earnings_net_pay.
 */
export const fin_payslip_deposit_schema = z.object({
  id: z.number().optional(),
  payslip_id: z.number().optional(),
  bank_name: z.string().min(1).max(100),
  account_last4: z.string().max(4).optional(),
  amount: maybeNum,
})

export type fin_payslip_deposit = z.infer<typeof fin_payslip_deposit_schema>

// ─── Main payslip schema ──────────────────────────────────────────────────────

/**
 * Canonical payslip schema — single source of truth shared by:
 *   • The edit form (PayslipDetailClient.tsx)
 *   • The JSON modal (PayslipJsonModal.tsx)
 *   • MCP responses (ListPayslips.php)
 *
 * PHP validation rules in FinancePayslipController::payslipRules() MUST be
 * kept in sync with this schema.
 */
export const fin_payslip_schema = z
  .object({
    payslip_id: z.number().optional(),
    period_start: z
      .string({
        required_error: 'Period start date is required',
        invalid_type_error: 'Period start date must be a valid date string',
      } as any)
      .min(1, { message: 'Period start date cannot be empty' }),
    period_end: z
      .string({
        required_error: 'Period end date is required',
        invalid_type_error: 'Period end date must be a valid date string',
      } as any)
      .min(1, { message: 'Period end date cannot be empty' }),
    pay_date: z
      .string({
        required_error: 'Pay date is required',
        invalid_type_error: 'Pay date must be a valid date string',
      } as any)
      .min(1, { message: 'Pay date cannot be empty' }),

    // ── Earnings ────────────────────────────────────────────────────────────
    earnings_gross: maybeNum,
    earnings_bonus: maybeNum,
    earnings_net_pay: maybeNum,
    earnings_rsu: maybeNum,
    earnings_dividend_equivalent: maybeNum,

    // ── Imputed income ──────────────────────────────────────────────────────
    imp_other: maybeNum,
    imp_legal: maybeNum,
    imp_fitness: maybeNum,
    imp_ltd: maybeNum,
    imp_life_choice: maybeNum,

    // ── Federal taxes ───────────────────────────────────────────────────────
    ps_oasdi: maybeNum,
    ps_medicare: maybeNum,
    ps_fed_tax: maybeNum,
    ps_fed_tax_addl: maybeNum,
    ps_fed_tax_refunded: maybeNum,

    // ── Taxable wage bases ──────────────────────────────────────────────────
    taxable_wages_oasdi: maybeNum,
    taxable_wages_medicare: maybeNum,
    taxable_wages_federal: maybeNum,

    // ── RSU post-tax offsets (stored as positive) ───────────────────────────
    ps_rsu_tax_offset: maybeNum,
    ps_rsu_excess_refund: maybeNum,

    // ── Retirement ──────────────────────────────────────────────────────────
    ps_401k_pretax: maybeNum,
    ps_401k_aftertax: maybeNum,
    ps_401k_employer: maybeNum,

    // ── Pre-tax deductions ──────────────────────────────────────────────────
    ps_pretax_medical: maybeNum,
    ps_pretax_fsa: maybeNum,
    ps_pretax_vision: maybeNum,
    ps_pretax_dental: maybeNum,
    ps_salary: maybeNum,
    ps_vacation_payout: maybeNum,

    // ── PTO / hours ─────────────────────────────────────────────────────────
    pto_accrued: maybeNum,
    pto_used: maybeNum,
    pto_available: maybeNum,
    pto_statutory_available: maybeNum,
    hours_worked: maybeNum,

    // ── Meta ────────────────────────────────────────────────────────────────
    ps_payslip_file_hash: maybeStr,
    ps_is_estimated: z.coerce.boolean().default(false),
    ps_comment: maybeStr,
    employment_entity_id: z.number().nullable().optional(),

    // ── Catch-all JSON (any unrecognised payslip data) ──────────────────────
    other: z.record(z.string(), z.unknown()).optional(),

    // ── Child table relationships (eager-loaded by API) ─────────────────────
    state_data: z.array(fin_payslip_state_data_schema).optional(),
    deposits: z.array(fin_payslip_deposit_schema).optional(),
  })
  .refine((data) => data.period_start <= data.period_end, {
    message: 'Period start date must be before or equal to period end date',
    path: ['period_start'],
  })
  .refine((data) => data.pay_date >= data.period_end, {
    message: 'Pay date must be after or equal to period end date',
    path: ['pay_date'],
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

