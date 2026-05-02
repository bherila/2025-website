import currency from 'currency.js'

import {
  computeIraContribution,
  computeRetirementContributions,
  computeSe401k,
  estimateDeductibleSeTax,
  RETIREMENT_LIMITS,
  SE_401K_LIMITS,
  totalContributionWithCatchup,
} from '../solo401k'

describe('computeSe401k', () => {
  it('returns zeros when there are no self-employment earnings', () => {
    const result = computeSe401k({
      year: 2025,
      netEarningsFromSE: 0,
      deductibleSeTax: 0,
      w2EmployeePretaxDeferred: 0,
    })
    expect(result.compensationBase).toBe(0)
    expect(result.recommendedContribution).toBe(0)
  })

  it('computes compensation base as net SE earnings minus deductible half of SE tax', () => {
    const result = computeSe401k({
      year: 2025,
      netEarningsFromSE: 100_000,
      deductibleSeTax: 7_065,
      w2EmployeePretaxDeferred: 0,
    })
    expect(result.compensationBase).toBe(92_935)
  })

  it('applies the 20% employer contribution rate to the compensation base', () => {
    const result = computeSe401k({
      year: 2025,
      netEarningsFromSE: 100_000,
      deductibleSeTax: 0,
      w2EmployeePretaxDeferred: 0,
    })
    expect(result.maxEmployerContribution).toBe(20_000)
  })

  it('subtracts W-2 pre-tax deferrals from both the employee limit and the §415(c) cap', () => {
    const result = computeSe401k({
      year: 2025,
      netEarningsFromSE: 100_000,
      deductibleSeTax: 0,
      w2EmployeePretaxDeferred: 10_000,
    })
    expect(result.employeeDeferralRoom).toBe(SE_401K_LIMITS[2025]!.employeeDeferral - 10_000)
    expect(result.overallCap).toBe(SE_401K_LIMITS[2025]!.overallCap - 10_000)
  })

  it('caps the recommended contribution at §415(c) when employee + employer exceed the overall cap', () => {
    // High-income SE + no W-2 deferrals: employee 23,500 + employer 80,000 = 103,500,
    // but §415(c) caps at 70,000 in 2025.
    const result = computeSe401k({
      year: 2025,
      netEarningsFromSE: 400_000,
      deductibleSeTax: 0,
      w2EmployeePretaxDeferred: 0,
    })
    expect(result.recommendedContribution).toBe(SE_401K_LIMITS[2025]!.overallCap)
  })

  it('falls back to the most recent year when called with an unknown year', () => {
    const result = computeSe401k({
      year: 2099,
      netEarningsFromSE: 50_000,
      deductibleSeTax: 0,
      w2EmployeePretaxDeferred: 0,
    })
    const mostRecentYear = Math.max(...Object.keys(SE_401K_LIMITS).map(Number))
    expect(result.limits.employeeDeferral).toBe(SE_401K_LIMITS[mostRecentYear]!.employeeDeferral)
  })

  it('caps recommended contribution at compensation base when earnings are low', () => {
    // With $5,000 SE earnings, contribution cannot exceed $5,000.
    // Employee room (23,500) + employer (1,000) = 24,500, capped by base of 5,000.
    const result = computeSe401k({
      year: 2025,
      netEarningsFromSE: 5_000,
      deductibleSeTax: 0,
      w2EmployeePretaxDeferred: 0,
    })
    expect(result.recommendedContribution).toBe(5_000)
    expect(result.compensationBase).toBe(5_000)
  })

  it('handles W-2 deferrals that fully exhaust the employee deferral limit', () => {
    const result = computeSe401k({
      year: 2025,
      netEarningsFromSE: 100_000,
      deductibleSeTax: 0,
      w2EmployeePretaxDeferred: SE_401K_LIMITS[2025]!.employeeDeferral,
    })
    expect(result.employeeDeferralRoom).toBe(0)
  })

  it('includes 2026 401(k) and Social Security wage-base limits', () => {
    expect(SE_401K_LIMITS[2026]).toEqual({
      employeeDeferral: 24_500,
      catchUpAge50: 8_000,
      overallCap: 72_000,
      ssWageBase: 184_500,
    })
  })
})

describe('estimateDeductibleSeTax', () => {
  it('returns zero for zero earnings', () => {
    expect(estimateDeductibleSeTax(0)).toBe(0)
  })

  it('returns zero for negative earnings', () => {
    expect(estimateDeductibleSeTax(-1000)).toBe(0)
  })

  it('computes (earnings × 92.35% × 15.3%) / 2 below the SS wage base', () => {
    const earnings = 100_000
    const expected = currency(earnings).multiply(0.9235).multiply(0.153).divide(2).value
    expect(estimateDeductibleSeTax(earnings, 2025)).toBeCloseTo(expected, 2)
  })

  it('caps the SS portion at the year-specific wage base for high earners', () => {
    // 2025 SS wage base = 176,100. With 300,000 net earnings:
    //   seBase = 300,000 × 0.9235 = 277,050
    //   SS  = min(277,050, 176,100) × 0.124 = 176,100 × 0.124 = 21,836.40
    //   Med = 277,050 × 0.029 = 8,034.45
    //   deductible = (21,836.40 + 8,034.45) / 2 = 14,935.425
    const result = estimateDeductibleSeTax(300_000, 2025)
    expect(result).toBeCloseTo(14_935.43, 2)

    // The naive (no cap) formula would over-estimate by ~$6.7k:
    const naive = currency(300_000).multiply(0.9235).multiply(0.153).divide(2).value
    expect(naive - result).toBeGreaterThan(6_000)
  })

  it('reduces the SS portion by W-2 wages already subject to Social Security tax', () => {
    const result = estimateDeductibleSeTax(100_000, 2025, 176_100)

    expect(result).toBeCloseTo(1_339.08, 2)
  })

  it('treats earnings under the SS wage base identically with or without a year', () => {
    const earnings = 50_000
    expect(estimateDeductibleSeTax(earnings)).toBeCloseTo(estimateDeductibleSeTax(earnings, 2025), 2)
  })
})

describe('totalContributionWithCatchup', () => {
  const lines = computeSe401k({
    year: 2025,
    netEarningsFromSE: 200_000,
    deductibleSeTax: 0,
    w2EmployeePretaxDeferred: 0,
  })

  it('returns the recommended contribution unchanged when catchup is off', () => {
    expect(totalContributionWithCatchup(lines, false)).toBe(lines.recommendedContribution)
  })

  it('adds the year-specific catch-up amount on top of the §415(c) cap', () => {
    const total = totalContributionWithCatchup(lines, true)
    expect(total).toBe(currency(lines.recommendedContribution).add(SE_401K_LIMITS[2025]!.catchUpAge50).value)
  })

  it('bounds the total at the compensation base when earnings are too low to absorb full catch-up', () => {
    const lowLines = computeSe401k({
      year: 2025,
      netEarningsFromSE: 5_000,
      deductibleSeTax: 0,
      w2EmployeePretaxDeferred: 0,
    })
    expect(totalContributionWithCatchup(lowLines, true)).toBe(lowLines.compensationBase)
  })
})

describe('computeIraContribution', () => {
  it('includes 2026 IRA limits', () => {
    expect(RETIREMENT_LIMITS[2026]!.iraContribution).toBe(7_500)
    expect(RETIREMENT_LIMITS[2026]!.iraCatchUpAge50).toBe(1_100)
  })

  it('caps combined traditional and Roth IRA contributions at the annual limit', () => {
    const result = computeIraContribution({
      year: 2025,
      eligibleCompensation: 100_000,
      filingStatus: 'single',
      includeCatchup: false,
      magi: 50_000,
      taxpayerCoveredByWorkplacePlan: false,
      spouseCoveredByWorkplacePlan: false,
      traditionalIraContribution: 5_000,
      rothIraContribution: 4_000,
    })

    expect(result.contributionLimit).toBe(7_000)
    expect(result.excessContribution).toBe(2_000)
    expect(result.rothAllowedContribution).toBe(2_000)
    expect(result.rothExcessContribution).toBe(2_000)
  })

  it('shows Roth IRA as excess when Traditional IRA already exhausts the shared limit', () => {
    const result = computeIraContribution({
      year: 2025,
      eligibleCompensation: 100_000,
      filingStatus: 'single',
      includeCatchup: false,
      magi: 50_000,
      taxpayerCoveredByWorkplacePlan: false,
      spouseCoveredByWorkplacePlan: false,
      traditionalIraContribution: 7_000,
      rothIraContribution: 1_000,
    })

    expect(result.rothAllowedContribution).toBe(0)
    expect(result.rothExcessContribution).toBe(1_000)
  })

  it('caps IRA contributions at eligible compensation when earnings are low', () => {
    const result = computeIraContribution({
      year: 2025,
      eligibleCompensation: 3_000,
      filingStatus: 'single',
      includeCatchup: true,
      magi: 50_000,
      taxpayerCoveredByWorkplacePlan: false,
      spouseCoveredByWorkplacePlan: false,
      traditionalIraContribution: 7_000,
      rothIraContribution: 0,
    })

    expect(result.annualLimit).toBe(8_000)
    expect(result.contributionLimit).toBe(3_000)
    expect(result.excessContribution).toBe(4_000)
  })

  it('phases out Roth IRA eligibility across the MAGI range', () => {
    const result = computeIraContribution({
      year: 2025,
      eligibleCompensation: 100_000,
      filingStatus: 'single',
      includeCatchup: false,
      magi: 157_500,
      taxpayerCoveredByWorkplacePlan: false,
      spouseCoveredByWorkplacePlan: false,
      traditionalIraContribution: 0,
      rothIraContribution: 7_000,
    })

    expect(result.rothAllowedContribution).toBe(3_500)
    expect(result.rothExcessContribution).toBe(3_500)
  })

  it('disallows Roth IRA contributions above the MAGI phaseout range', () => {
    const result = computeIraContribution({
      year: 2025,
      eligibleCompensation: 100_000,
      filingStatus: 'marriedFilingSeparately',
      includeCatchup: false,
      magi: 10_000,
      taxpayerCoveredByWorkplacePlan: false,
      spouseCoveredByWorkplacePlan: false,
      traditionalIraContribution: 0,
      rothIraContribution: 7_000,
    })

    expect(result.rothAllowedContribution).toBe(0)
    expect(result.rothExcessContribution).toBe(7_000)
  })

  it('phases out traditional IRA deductibility when the taxpayer is covered by a workplace plan', () => {
    const result = computeIraContribution({
      year: 2025,
      eligibleCompensation: 100_000,
      filingStatus: 'single',
      includeCatchup: false,
      magi: 84_000,
      taxpayerCoveredByWorkplacePlan: true,
      spouseCoveredByWorkplacePlan: false,
      traditionalIraContribution: 7_000,
      rothIraContribution: 0,
    })

    expect(result.traditionalDeductibleAmount).toBe(3_500)
    expect(result.traditionalNondeductibleAmount).toBe(3_500)
  })

  it('uses the spouse-covered phaseout when the taxpayer is not covered', () => {
    const result = computeIraContribution({
      year: 2025,
      eligibleCompensation: 100_000,
      filingStatus: 'marriedFilingJointly',
      includeCatchup: false,
      magi: 241_000,
      taxpayerCoveredByWorkplacePlan: false,
      spouseCoveredByWorkplacePlan: true,
      traditionalIraContribution: 7_000,
      rothIraContribution: 0,
    })

    expect(result.traditionalDeductibleAmount).toBe(3_500)
    expect(result.traditionalNondeductibleAmount).toBe(3_500)
  })

  it('keeps traditional IRA contributions fully deductible when neither spouse has workplace coverage', () => {
    const result = computeIraContribution({
      year: 2025,
      eligibleCompensation: 100_000,
      filingStatus: 'marriedFilingJointly',
      includeCatchup: false,
      magi: 500_000,
      taxpayerCoveredByWorkplacePlan: false,
      spouseCoveredByWorkplacePlan: false,
      traditionalIraContribution: 7_000,
      rothIraContribution: 0,
    })

    expect(result.traditionalDeductibleAmount).toBe(7_000)
    expect(result.traditionalNondeductibleAmount).toBe(0)
  })
})

describe('computeRetirementContributions', () => {
  const baseInputs = {
    year: 2025,
    w2Income: 80_000,
    w2EmployeePretaxDeferred: 10_000,
    w2PretaxInPlanRothConversion: 4_000,
    includeSelfEmploymentIncome: true,
    includeCatchup: false,
    netEarningsFromSE: 100_000,
    deductibleSeTax: 7_065,
    filingStatus: 'single' as const,
    magi: 100_000,
    taxpayerCoveredByWorkplacePlan: true,
    spouseCoveredByWorkplacePlan: false,
    traditionalIraContribution: 3_500,
    rothIraContribution: 3_500,
  }

  it('reduces self-employment IRA compensation by the self-employed 401(k) contribution', () => {
    const result = computeRetirementContributions(baseInputs)

    expect(result.eligibleCompensation).toBe(140_848)
    expect(result.ira.contributionLimit).toBe(7_000)
  })

  it('keeps W-2 in-plan Roth conversion informational only', () => {
    const result = computeRetirementContributions(baseInputs)
    const withoutConversion = computeRetirementContributions({
      ...baseInputs,
      w2PretaxInPlanRothConversion: 0,
    })

    expect(result.w2PretaxInPlanRothConversion).toBe(4_000)
    expect(result.se401k.employeeDeferralRoom).toBe(withoutConversion.se401k.employeeDeferralRoom)
    expect(result.se401k.overallCap).toBe(withoutConversion.se401k.overallCap)
  })

  it('ignores self-employment contribution math when SE income is disabled', () => {
    const result = computeRetirementContributions({
      ...baseInputs,
      includeSelfEmploymentIncome: false,
    })

    expect(result.se401k.compensationBase).toBe(0)
    expect(result.se401k.recommendedContribution).toBe(0)
    expect(result.eligibleCompensation).toBe(80_000)
  })
})
