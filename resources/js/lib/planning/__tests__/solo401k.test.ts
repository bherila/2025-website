import { computeSe401k, estimateDeductibleSeTax, SE_401K_LIMITS } from '../solo401k'

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
    expect(result.limits.employeeDeferral).toBe(SE_401K_LIMITS[2025]!.employeeDeferral)
  })

  it('caps recommended contribution at compensation base when earnings are low', () => {
    // With $5,000 SE earnings, contribution cannot exceed $5,000 even if limits are higher.
    const result = computeSe401k({
      year: 2025,
      netEarningsFromSE: 5_000,
      deductibleSeTax: 0,
      w2EmployeePretaxDeferred: 0,
    })
    expect(result.recommendedContribution).toBeLessThanOrEqual(5_000)
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

  it('computes approximately half of (earnings × 92.35% × 15.3%)', () => {
    const earnings = 100_000
    const expected = earnings * 0.9235 * 0.153 / 2
    expect(estimateDeductibleSeTax(earnings)).toBeCloseTo(expected, 1)
  })
})
