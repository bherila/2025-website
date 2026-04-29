import currency from 'currency.js'

/**
 * Solo 401(k) / SE 401(k) contribution limits by tax year.
 * - employeeDeferral: §402(g) elective deferral cap
 * - catchUpAge50: additional allowed for age 50+
 * - overallCap: §415(c) total annual additions cap (employee + employer, excl. catch-up)
 *
 * Sources: IRS Notice 2023-75 (2024 limits), IRS Notice 2024-80 (2025 limits).
 */
export const SE_401K_LIMITS: Record<number, { employeeDeferral: number; catchUpAge50: number; overallCap: number }> = {
  2024: { employeeDeferral: 23_000, catchUpAge50: 7_500, overallCap: 69_000 },
  2025: { employeeDeferral: 23_500, catchUpAge50: 7_500, overallCap: 70_000 },
}

const DEFAULT_SE_401K_YEAR = 2025

export function getLimitsForYear(year: number) {
  return SE_401K_LIMITS[year] ?? SE_401K_LIMITS[DEFAULT_SE_401K_YEAR]!
}

export interface Se401kInputs {
  year: number
  /** Net earnings from self-employment before SE tax reduction — Schedule SE line 6. */
  netEarningsFromSE: number
  /** Deductible half of SE tax (line 13). Reduces the compensation base. */
  deductibleSeTax: number
  /** W-2 employee pre-tax 401(k) already deferred this year (reduces remaining room). */
  w2EmployeePretaxDeferred: number
}

export interface Se401kLines {
  /** Compensation base = net SE earnings − deductible half of SE tax. */
  compensationBase: number
  /** Employee deferral room remaining for the year. */
  employeeDeferralRoom: number
  /** Maximum employer contribution (20% of compensationBase for Schedule C filers). */
  maxEmployerContribution: number
  /** Overall §415(c) cap minus W-2 deferrals already applied elsewhere. */
  overallCap: number
  /** Recommended contribution = min(employeeRoom + employerMax, overallCap). */
  recommendedContribution: number
  /** Year-specific limit block used for the calc. */
  limits: { employeeDeferral: number; catchUpAge50: number; overallCap: number }
}

/**
 * The Solo 401(k) employer contribution for a self-employed person is
 * effectively 20% of (net SE earnings − ½ SE tax), not 25% — the 25%
 * figure assumes gross W-2 wages. See IRS Pub 560 rate table.
 */
const EMPLOYER_CONTRIBUTION_RATE = 0.20

export function computeSe401k({
  year,
  netEarningsFromSE,
  deductibleSeTax,
  w2EmployeePretaxDeferred,
}: Se401kInputs): Se401kLines {
  const limits = getLimitsForYear(year)

  const compensationBase = Math.max(
    0,
    currency(netEarningsFromSE).subtract(deductibleSeTax).value,
  )

  const employeeDeferralRoom = Math.max(
    0,
    currency(limits.employeeDeferral).subtract(w2EmployeePretaxDeferred).value,
  )

  const maxEmployerContribution = currency(compensationBase, { precision: 2 })
    .multiply(EMPLOYER_CONTRIBUTION_RATE).value

  const overallCap = Math.max(
    0,
    currency(limits.overallCap).subtract(w2EmployeePretaxDeferred).value,
  )

  const rawCombined = currency(employeeDeferralRoom).add(maxEmployerContribution).value
  // Contribution cannot exceed either the §415(c) cap or the compensation base itself
  // (you can't contribute more than you earn).
  const recommendedContribution = Math.min(rawCombined, overallCap, compensationBase)

  return {
    compensationBase,
    employeeDeferralRoom,
    maxEmployerContribution,
    overallCap,
    recommendedContribution,
    limits,
  }
}

/** SE tax rate constants for the deductible-half helper (Schedule SE). */
const SE_WAGE_FACTOR = 0.9235
const SE_TAX_RATE = 0.153

/**
 * Estimates the deductible half of SE tax from net SE earnings.
 * Uses: net × 92.35% × 15.3% / 2.
 * This approximation works when all income is below the Social Security wage base.
 */
export function estimateDeductibleSeTax(netEarningsFromSE: number): number {
  if (netEarningsFromSE <= 0) return 0
  return currency(netEarningsFromSE)
    .multiply(SE_WAGE_FACTOR)
    .multiply(SE_TAX_RATE)
    .divide(2).value
}
