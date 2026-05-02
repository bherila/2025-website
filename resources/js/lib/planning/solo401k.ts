import currency from 'currency.js'

/**
 * Solo 401(k) / SE 401(k) contribution limits by tax year.
 * - employeeDeferral: §402(g) elective deferral cap
 * - catchUpAge50: additional allowed for age 50+
 * - overallCap: §415(c) total annual additions cap (employee + employer, excl. catch-up)
 * - ssWageBase: Social Security wage base (only the SS portion of SE tax is capped here;
 *   Medicare 2.9% applies to all SE earnings × 92.35%)
 *
 * Sources: IRS Notice 2023-75 (2024 limits), IRS Notice 2024-80 (2025 limits),
 * IRS Notice 2025-67 (2026 limits), and SSA 2026 COLA facts.
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
  2026: { employeeDeferral: 24_500, catchUpAge50: 8_000, overallCap: 72_000, ssWageBase: 184_500 },
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
 *   ssEarnings = min(net × 92.35%, remaining ssWageBase after W-2 wages) × 12.4%
 *   medicare   = (net × 92.35%) × 2.9%
 *   deductible = (ssEarnings + medicare) / 2
 *
 * Below the SS wage base this collapses to the familiar net × 92.35% × 15.3% / 2.
 * The 0.9% Additional Medicare Tax for high earners is **not** part of the deductible half.
 */
export function estimateDeductibleSeTax(
  netEarningsFromSE: number,
  year?: number,
  w2SocialSecurityWages = 0,
): number {
  if (netEarningsFromSE <= 0) {
    return 0
  }
  const ssWageBase = year != null ? getLimitsForYear(year).ssWageBase : Infinity
  const seBase = currency(netEarningsFromSE).multiply(SE_WAGE_FACTOR).value
  const remainingSsWageBase = ssWageBase === Infinity
    ? Infinity
    : Math.max(0, currency(ssWageBase).subtract(w2SocialSecurityWages).value)
  const ssTaxable = Math.min(seBase, remainingSsWageBase)
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

export type FilingStatus = 'single' | 'headOfHousehold' | 'marriedFilingJointly' | 'qualifyingWidow' | 'marriedFilingSeparately'

export interface IraPhaseoutRange {
  start: number
  end: number
}

export interface RetirementYearLimits extends Se401kYearLimits {
  iraContribution: number
  iraCatchUpAge50: number
  rothIraPhaseout: Record<FilingStatus, IraPhaseoutRange>
  traditionalIraCoveredPhaseout: Record<FilingStatus, IraPhaseoutRange | null>
  traditionalIraSpouseCoveredPhaseout: Record<FilingStatus, IraPhaseoutRange | null>
}

export const RETIREMENT_LIMITS: Record<number, RetirementYearLimits> = {
  2024: {
    ...SE_401K_LIMITS[2024]!,
    iraContribution: 7_000,
    iraCatchUpAge50: 1_000,
    rothIraPhaseout: {
      single: { start: 146_000, end: 161_000 },
      headOfHousehold: { start: 146_000, end: 161_000 },
      marriedFilingJointly: { start: 230_000, end: 240_000 },
      qualifyingWidow: { start: 230_000, end: 240_000 },
      marriedFilingSeparately: { start: 0, end: 10_000 },
    },
    traditionalIraCoveredPhaseout: {
      single: { start: 77_000, end: 87_000 },
      headOfHousehold: { start: 77_000, end: 87_000 },
      marriedFilingJointly: { start: 123_000, end: 143_000 },
      qualifyingWidow: { start: 123_000, end: 143_000 },
      marriedFilingSeparately: { start: 0, end: 10_000 },
    },
    traditionalIraSpouseCoveredPhaseout: {
      single: null,
      headOfHousehold: null,
      marriedFilingJointly: { start: 230_000, end: 240_000 },
      qualifyingWidow: { start: 230_000, end: 240_000 },
      marriedFilingSeparately: { start: 0, end: 10_000 },
    },
  },
  2025: {
    ...SE_401K_LIMITS[2025]!,
    iraContribution: 7_000,
    iraCatchUpAge50: 1_000,
    rothIraPhaseout: {
      single: { start: 150_000, end: 165_000 },
      headOfHousehold: { start: 150_000, end: 165_000 },
      marriedFilingJointly: { start: 236_000, end: 246_000 },
      qualifyingWidow: { start: 236_000, end: 246_000 },
      marriedFilingSeparately: { start: 0, end: 10_000 },
    },
    traditionalIraCoveredPhaseout: {
      single: { start: 79_000, end: 89_000 },
      headOfHousehold: { start: 79_000, end: 89_000 },
      marriedFilingJointly: { start: 126_000, end: 146_000 },
      qualifyingWidow: { start: 126_000, end: 146_000 },
      marriedFilingSeparately: { start: 0, end: 10_000 },
    },
    traditionalIraSpouseCoveredPhaseout: {
      single: null,
      headOfHousehold: null,
      marriedFilingJointly: { start: 236_000, end: 246_000 },
      qualifyingWidow: { start: 236_000, end: 246_000 },
      marriedFilingSeparately: { start: 0, end: 10_000 },
    },
  },
  2026: {
    ...SE_401K_LIMITS[2026]!,
    iraContribution: 7_500,
    iraCatchUpAge50: 1_100,
    rothIraPhaseout: {
      single: { start: 153_000, end: 168_000 },
      headOfHousehold: { start: 153_000, end: 168_000 },
      marriedFilingJointly: { start: 242_000, end: 252_000 },
      qualifyingWidow: { start: 242_000, end: 252_000 },
      marriedFilingSeparately: { start: 0, end: 10_000 },
    },
    traditionalIraCoveredPhaseout: {
      single: { start: 81_000, end: 91_000 },
      headOfHousehold: { start: 81_000, end: 91_000 },
      marriedFilingJointly: { start: 129_000, end: 149_000 },
      qualifyingWidow: { start: 129_000, end: 149_000 },
      marriedFilingSeparately: { start: 0, end: 10_000 },
    },
    traditionalIraSpouseCoveredPhaseout: {
      single: null,
      headOfHousehold: null,
      marriedFilingJointly: { start: 242_000, end: 252_000 },
      qualifyingWidow: { start: 242_000, end: 252_000 },
      marriedFilingSeparately: { start: 0, end: 10_000 },
    },
  },
}

const DEFAULT_RETIREMENT_YEAR = Math.max(...Object.keys(RETIREMENT_LIMITS).map(Number))

export function getRetirementLimitsForYear(year: number): RetirementYearLimits {
  return RETIREMENT_LIMITS[year] ?? RETIREMENT_LIMITS[DEFAULT_RETIREMENT_YEAR]!
}

export interface RetirementContributionInputs extends Se401kInputs {
  w2Income: number
  w2PretaxInPlanRothConversion: number
  includeSelfEmploymentIncome: boolean
  includeCatchup: boolean
  filingStatus: FilingStatus
  magi: number
  taxpayerCoveredByWorkplacePlan: boolean
  spouseCoveredByWorkplacePlan: boolean
  traditionalIraContribution: number
  rothIraContribution: number
}

export interface IraContributionLines {
  eligibleCompensation: number
  annualLimit: number
  contributionLimit: number
  totalRequestedContribution: number
  excessContribution: number
  rothAllowedContribution: number
  rothExcessContribution: number
  traditionalDeductibleAmount: number
  traditionalNondeductibleAmount: number
  rothPhaseoutRange: IraPhaseoutRange
  traditionalDeductionPhaseoutRange: IraPhaseoutRange | null
  limits: RetirementYearLimits
}

export interface RetirementContributionLines {
  se401k: Se401kLines
  se401kTotalWithCatchup: number
  se401kCatchupAddition: number
  eligibleCompensation: number
  w2PretaxInPlanRothConversion: number
  ira: IraContributionLines
  limits: RetirementYearLimits
}

function getPhaseoutMultiplier(magi: number, range: IraPhaseoutRange | null): number {
  if (range === null) {
    return 1
  }
  if (magi <= range.start) {
    return 1
  }
  if (magi >= range.end) {
    return 0
  }

  const remaining = currency(range.end).subtract(magi).value
  const width = currency(range.end).subtract(range.start).value

  return remaining / width
}

function getTraditionalDeductionPhaseoutRange({
  filingStatus,
  limits,
  spouseCoveredByWorkplacePlan,
  taxpayerCoveredByWorkplacePlan,
}: Pick<RetirementContributionInputs, 'filingStatus' | 'spouseCoveredByWorkplacePlan' | 'taxpayerCoveredByWorkplacePlan'> & {
  limits: RetirementYearLimits
}): IraPhaseoutRange | null {
  if (taxpayerCoveredByWorkplacePlan) {
    return limits.traditionalIraCoveredPhaseout[filingStatus]
  }

  if (spouseCoveredByWorkplacePlan) {
    return limits.traditionalIraSpouseCoveredPhaseout[filingStatus]
  }

  return null
}

export function computeIraContribution({
  filingStatus,
  includeCatchup,
  magi,
  spouseCoveredByWorkplacePlan,
  taxpayerCoveredByWorkplacePlan,
  traditionalIraContribution,
  rothIraContribution,
  year,
  eligibleCompensation,
}: Pick<
  RetirementContributionInputs,
  | 'filingStatus'
  | 'includeCatchup'
  | 'magi'
  | 'spouseCoveredByWorkplacePlan'
  | 'taxpayerCoveredByWorkplacePlan'
  | 'traditionalIraContribution'
  | 'rothIraContribution'
  | 'year'
> & {
  eligibleCompensation: number
}): IraContributionLines {
  const limits = getRetirementLimitsForYear(year)
  const annualLimit = currency(limits.iraContribution)
    .add(includeCatchup ? limits.iraCatchUpAge50 : 0)
    .value
  const contributionLimit = Math.min(annualLimit, eligibleCompensation)
  const totalRequestedContribution = currency(traditionalIraContribution).add(rothIraContribution).value
  const excessContribution = Math.max(
    0,
    currency(totalRequestedContribution).subtract(contributionLimit).value,
  )

  const rothPhaseoutRange = limits.rothIraPhaseout[filingStatus]
  const rothRoomAfterTraditional = Math.max(
    0,
    currency(contributionLimit).subtract(traditionalIraContribution).value,
  )
  const rothPhaseoutContributionLimit = currency(contributionLimit)
    .multiply(getPhaseoutMultiplier(magi, rothPhaseoutRange))
    .value
  const rothAllowedContribution = Math.min(
    rothRoomAfterTraditional,
    rothPhaseoutContributionLimit,
  )
  const rothExcessContribution = Math.max(
    0,
    currency(rothIraContribution).subtract(rothAllowedContribution).value,
  )

  const traditionalDeductionPhaseoutRange = getTraditionalDeductionPhaseoutRange({
    filingStatus,
    limits,
    spouseCoveredByWorkplacePlan,
    taxpayerCoveredByWorkplacePlan,
  })
  const traditionalDeductibleAmount = Math.min(
    traditionalIraContribution,
    contributionLimit,
    currency(traditionalIraContribution)
      .multiply(getPhaseoutMultiplier(magi, traditionalDeductionPhaseoutRange))
      .value,
  )
  const traditionalNondeductibleAmount = Math.max(
    0,
    currency(traditionalIraContribution).subtract(traditionalDeductibleAmount).value,
  )

  return {
    eligibleCompensation,
    annualLimit,
    contributionLimit,
    totalRequestedContribution,
    excessContribution,
    rothAllowedContribution,
    rothExcessContribution,
    traditionalDeductibleAmount,
    traditionalNondeductibleAmount,
    rothPhaseoutRange,
    traditionalDeductionPhaseoutRange,
    limits,
  }
}

export function computeRetirementContributions(inputs: RetirementContributionInputs): RetirementContributionLines {
  const limits = getRetirementLimitsForYear(inputs.year)
  const se401k = computeSe401k({
    year: inputs.year,
    netEarningsFromSE: inputs.includeSelfEmploymentIncome ? inputs.netEarningsFromSE : 0,
    deductibleSeTax: inputs.includeSelfEmploymentIncome ? inputs.deductibleSeTax : 0,
    w2EmployeePretaxDeferred: inputs.w2EmployeePretaxDeferred,
  })
  const se401kTotalWithCatchup = totalContributionWithCatchup(se401k, inputs.includeCatchup)
  const seEligibleCompensationForIra = Math.max(
    0,
    currency(se401k.compensationBase).subtract(se401kTotalWithCatchup).value,
  )
  const eligibleCompensation = Math.max(
    0,
    currency(inputs.w2Income).add(seEligibleCompensationForIra).value,
  )
  const ira = computeIraContribution({
    eligibleCompensation,
    filingStatus: inputs.filingStatus,
    includeCatchup: inputs.includeCatchup,
    magi: inputs.magi,
    spouseCoveredByWorkplacePlan: inputs.spouseCoveredByWorkplacePlan,
    taxpayerCoveredByWorkplacePlan: inputs.taxpayerCoveredByWorkplacePlan,
    traditionalIraContribution: inputs.traditionalIraContribution,
    rothIraContribution: inputs.rothIraContribution,
    year: inputs.year,
  })

  return {
    se401k,
    se401kTotalWithCatchup,
    se401kCatchupAddition: currency(se401kTotalWithCatchup).subtract(se401k.recommendedContribution).value,
    eligibleCompensation,
    w2PretaxInPlanRothConversion: inputs.w2PretaxInPlanRothConversion,
    ira,
    limits,
  }
}
