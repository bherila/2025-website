import currency from 'currency.js'

/**
 * Solo 401(k) / SE 401(k) contribution limits by tax year.
 * - employeeDeferral: §402(g) elective deferral cap
 * - catchUpAge50: additional allowed for age 50+
 * - overallCap: §415(c) total annual additions cap (employee + employer, excl. catch-up)
 * - ssWageBase: Social Security wage base (only the SS portion of SE tax is capped here;
 *   Medicare 2.9% applies to all SE earnings × 92.35%)
 *
 * Sources: IRS Notice 2023-75 (2024 limits), IRS Notice 2024-80 (2025 limits).
 */
export interface Se401kYearLimits {
  employeeDeferral: number
  catchUpAge50: number
  overallCap: number
  ssWageBase: number
}

export const SE_401K_LIMITS: Record<number, Se401kYearLimits> = {
  2024: { employeeDeferral: 23_000, catchUpAge50: 7_500, overallCap: 69_000, ssWageBase: 168_600 },
  2025: { employeeDeferral: 23_500, catchUpAge50: 7_500, overallCap: 70_000, ssWageBase: 176_100 },
}

const DEFAULT_SE_401K_YEAR = Math.max(...Object.keys(SE_401K_LIMITS).map(Number))

export function getLimitsForYear(year: number): Se401kYearLimits {
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
  limits: Se401kYearLimits
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
const SS_RATE = 0.124
const MEDICARE_RATE = 0.029

/**
 * Estimates the deductible half of SE tax from net SE earnings, year-aware.
 *
 * Schedule SE math:
 *   ssEarnings = min(net × 92.35%, ssWageBase) × 12.4%
 *   medicare   = (net × 92.35%) × 2.9%
 *   deductible = (ssEarnings + medicare) / 2
 *
 * Below the SS wage base this collapses to the familiar net × 92.35% × 15.3% / 2.
 * The 0.9% Additional Medicare Tax for high earners is **not** part of the deductible half.
 */
export function estimateDeductibleSeTax(netEarningsFromSE: number, year?: number): number {
  if (netEarningsFromSE <= 0) {
    return 0
  }
  const ssWageBase = year != null ? getLimitsForYear(year).ssWageBase : Infinity
  const seBase = currency(netEarningsFromSE).multiply(SE_WAGE_FACTOR).value
  const ssTaxable = Math.min(seBase, ssWageBase)
  const ssTax = currency(ssTaxable).multiply(SS_RATE).value
  const medicareTax = currency(seBase).multiply(MEDICARE_RATE).value
  return currency(ssTax).add(medicareTax).divide(2).value
}

/**
 * Returns the maximum total Solo 401(k) contribution including the §402(g)
 * age-50+ catch-up. Catch-up sits outside the §415(c) cap per IRS rules but is
 * still bounded by the compensation base (you cannot contribute more than you
 * earn). When `includeCatchup` is false, returns the recommended contribution
 * unchanged.
 */
export function totalContributionWithCatchup(
  lines: Pick<Se401kLines, 'recommendedContribution' | 'compensationBase' | 'limits'>,
  includeCatchup: boolean,
): number {
  if (!includeCatchup) {
    return lines.recommendedContribution
  }
  const withCatchup = currency(lines.recommendedContribution).add(lines.limits.catchUpAge50).value
  return Math.min(withCatchup, lines.compensationBase)
}
