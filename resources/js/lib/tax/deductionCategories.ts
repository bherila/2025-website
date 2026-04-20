/**
 * Schedule A user-entered deduction categories.
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
}

/** Categories that contribute to the $10k SALT cap (Schedule A Line 7). */
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
