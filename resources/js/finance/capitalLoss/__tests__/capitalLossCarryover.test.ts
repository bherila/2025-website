import { computeCapitalLossCarryover } from '../capitalLossCarryover'

describe('computeCapitalLossCarryover', () => {
  it('returns no carryover when combined gain is positive', () => {
    const r = computeCapitalLossCarryover(5_000, 3_000)
    expect(r.hasCarryover).toBe(false)
    expect(r.totalCarryover).toBe(0)
    expect(r.appliedToOrdinaryIncome).toBe(0)
  })

  it('returns no carryover when combined loss is within $3k limit', () => {
    const r = computeCapitalLossCarryover(-2_000, -500)
    expect(r.combined).toBe(-2_500)
    expect(r.appliedToOrdinaryIncome).toBe(2_500)
    expect(r.totalCarryover).toBe(0)
    expect(r.hasCarryover).toBe(false)
  })

  it('carries over ST loss when only ST is negative and exceeds $3k', () => {
    const r = computeCapitalLossCarryover(-212_533, 0)
    expect(r.appliedToOrdinaryIncome).toBe(3_000)
    expect(r.shortTermCarryover).toBe(209_533)
    expect(r.longTermCarryover).toBe(0)
    expect(r.totalCarryover).toBe(209_533)
    expect(r.hasCarryover).toBe(true)
  })

  it('carries over LT loss when only LT is negative', () => {
    const r = computeCapitalLossCarryover(0, -719)
    expect(r.appliedToOrdinaryIncome).toBe(719)
    expect(r.longTermCarryover).toBe(0)
    expect(r.hasCarryover).toBe(false)
  })

  it('applies ST first when both are negative, carries remainder', () => {
    // ST: -10k, LT: -5k → total -15k, $3k applied from ST, $0 from LT
    const r = computeCapitalLossCarryover(-10_000, -5_000)
    expect(r.combined).toBe(-15_000)
    expect(r.appliedToOrdinaryIncome).toBe(3_000)
    expect(r.shortTermCarryover).toBe(7_000)  // 10k - 3k
    expect(r.longTermCarryover).toBe(5_000)   // fully carried
    expect(r.totalCarryover).toBe(12_000)
  })

  it('uses $1,500 limit for MFS', () => {
    const r = computeCapitalLossCarryover(-10_000, 0, true)
    expect(r.appliedToOrdinaryIncome).toBe(1_500)
    expect(r.shortTermCarryover).toBe(8_500)
  })

  it('net ST gain offsets LT loss before carryover', () => {
    // ST: +5k, LT: -10k → net -5k, $3k applied to ordinary, $2k LT carryover
    const r = computeCapitalLossCarryover(5_000, -10_000)
    expect(r.combined).toBe(-5_000)
    expect(r.appliedToOrdinaryIncome).toBe(3_000)
    expect(r.longTermCarryover).toBe(2_000)
    expect(r.shortTermCarryover).toBe(0)
  })
})
