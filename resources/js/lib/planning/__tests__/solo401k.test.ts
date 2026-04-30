import currency from 'currency.js'

import {
  computeSe401k,
  estimateDeductibleSeTax,
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
