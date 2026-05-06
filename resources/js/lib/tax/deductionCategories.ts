/**
 * User-entered tax-preview categories.
 * Kept in sync with `App\Enums\Finance\DeductionCategory`.
 */

export const DEDUCTION_CATEGORIES = [
  'real_estate_tax',
  'state_est_tax',
  'sales_tax',
  'mortgage_interest',
  'charitable_cash',
  'charitable_noncash',
  'other',
  'schedule_f_gross_income',
  'schedule_f_expenses',
  'form4797_part_i_1231_gain',
  'form4797_part_i_1231_loss',
  'form4797_part_ii_ordinary_gain',
  'form4797_part_ii_ordinary_loss',
  'form4797_part_iii_recapture',
  'form8606_nondeductible_contributions',
  'form8606_prior_year_basis',
  'form8606_year_end_fmv',
] as const

export type DeductionCategory = (typeof DEDUCTION_CATEGORIES)[number]

export const DEDUCTION_CATEGORY_LABELS: Record<DeductionCategory, string> = {
  real_estate_tax: 'Real estate / property tax',
  state_est_tax: 'State estimated tax paid',
  sales_tax: 'General sales tax',
  mortgage_interest: 'Mortgage interest',
  charitable_cash: 'Charitable — cash',
  charitable_noncash: 'Charitable — non-cash',
  other: 'Other deduction',
  schedule_f_gross_income: 'Schedule F — gross farm income',
  schedule_f_expenses: 'Schedule F — total farm expenses',
  form4797_part_i_1231_gain: 'Form 4797 — Part I §1231 gain',
  form4797_part_i_1231_loss: 'Form 4797 — Part I §1231 loss',
  form4797_part_ii_ordinary_gain: 'Form 4797 — Part II ordinary gain',
  form4797_part_ii_ordinary_loss: 'Form 4797 — Part II ordinary loss',
  form4797_part_iii_recapture: 'Form 4797 — Part III recapture',
  form8606_nondeductible_contributions: 'Form 8606 — nondeductible IRA contributions',
  form8606_prior_year_basis: 'Form 8606 — prior-year IRA basis',
  form8606_year_end_fmv: 'Form 8606 — year-end IRA FMV',
}

/** Categories that contribute to the SALT cap (Schedule A Line 7). */
export const SALT_CATEGORIES: ReadonlySet<DeductionCategory> = new Set([
  'real_estate_tax',
  'state_est_tax',
  'sales_tax',
])

/**
 * Label for a persisted category. Defensive against stale DB values not in the
 * current whitelist — falls back to the raw code.
 */
export function labelForCategory(category: string): string {
  return (DEDUCTION_CATEGORY_LABELS as Record<string, string>)[category] ?? category
}
