/**
 * User-entered tax-preview categories.
 * Kept in sync with `App\Enums\Finance\DeductionCategory`.
 */

export const DEDUCTION_CATEGORIES = [
  'real_estate_tax',
  'state_est_tax',
  'sales_tax',
  'personal_property_tax',
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
  'schedule3_child_dependent_care_credit',
  'schedule3_education_credits',
  'schedule3_retirement_savings_credit',
  'schedule3_residential_clean_energy_credit',
  'schedule3_energy_efficient_home_improvement_credit',
  'schedule3_general_business_credit',
  'schedule3_prior_year_minimum_tax_credit',
  'schedule3_other_nonrefundable_credits',
  'schedule3_net_premium_tax_credit',
  'schedule3_extension_payment',
  'schedule3_excess_social_security_withheld',
  'schedule3_fuel_tax_credit',
  'schedule3_other_refundable_credits',
] as const

export type DeductionCategory = (typeof DEDUCTION_CATEGORIES)[number]

export const DEDUCTION_CATEGORY_LABELS: Record<DeductionCategory, string> = {
  real_estate_tax: 'Real estate / property tax',
  state_est_tax: 'State estimated tax paid',
  sales_tax: 'General sales tax',
  personal_property_tax: 'Personal property tax',
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
  schedule3_child_dependent_care_credit: 'Schedule 3 — child and dependent care credit',
  schedule3_education_credits: 'Schedule 3 — education credits',
  schedule3_retirement_savings_credit: 'Schedule 3 — retirement savings contributions credit',
  schedule3_residential_clean_energy_credit: 'Schedule 3 — residential clean energy credit',
  schedule3_energy_efficient_home_improvement_credit: 'Schedule 3 — energy efficient home improvement credit',
  schedule3_general_business_credit: 'Schedule 3 — general business credit',
  schedule3_prior_year_minimum_tax_credit: 'Schedule 3 — prior-year minimum tax credit',
  schedule3_other_nonrefundable_credits: 'Schedule 3 — other nonrefundable credits',
  schedule3_net_premium_tax_credit: 'Schedule 3 — net premium tax credit',
  schedule3_extension_payment: 'Schedule 3 — extension payment',
  schedule3_excess_social_security_withheld: 'Schedule 3 — excess Social Security withheld',
  schedule3_fuel_tax_credit: 'Schedule 3 — fuel tax credit',
  schedule3_other_refundable_credits: 'Schedule 3 — other refundable credits',
}

/** Categories that contribute to the SALT cap (Schedule A Line 7). */
export const SALT_CATEGORIES: ReadonlySet<DeductionCategory> = new Set([
  'real_estate_tax',
  'state_est_tax',
  'sales_tax',
  'personal_property_tax',
])

/**
 * Label for a persisted category. Defensive against stale DB values not in the
 * current whitelist — falls back to the raw code.
 */
export function labelForCategory(category: string): string {
  return (DEDUCTION_CATEGORY_LABELS as Record<string, string>)[category] ?? category
}
