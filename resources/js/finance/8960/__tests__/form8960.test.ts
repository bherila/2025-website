import { computeForm8960Lines } from '../form8960'

const base = {
  taxableInterest: 0,
  ordinaryDividends: 0,
  netCapGainsRaw: 0,
  passiveIncome: 0,
  investmentInterestExpense: 0,
  magi: 0,
  isMarried: false,
}

describe('computeForm8960Lines', () => {
  it('returns zero NIIT when MAGI is below threshold', () => {
    const r = computeForm8960Lines({ ...base, taxableInterest: 10_000, magi: 150_000 })
    expect(r.niitTax).toBe(0)
    expect(r.magiExcess).toBe(0)
  })

  it('computes NIIT on NII when MAGI >> threshold', () => {
    const r = computeForm8960Lines({
      ...base,
      taxableInterest: 36_189,
      ordinaryDividends: 61_284,
      netCapGainsRaw: -3_000, // loss → NII contribution = 0
      passiveIncome: 9_258,
      investmentInterestExpense: 33_897,
      magi: 2_122_500,
      isMarried: false,
    })
    // grossNII = 36189 + 61284 + 0 + 9258 = 106731
    // NII after deduction = 106731 - 33897 = 72834
    // magiExcess = 2122500 - 200000 = 1922500
    // NIIT = 3.8% × min(72834, 1922500) = 3.8% × 72834
    expect(r.grossNII).toBeCloseTo(106_731)
    expect(r.netInvestmentIncome).toBeCloseTo(72_834)
    expect(r.niitTax).toBeCloseTo(72_834 * 0.038, 0)
  })

  it('caps NIIT at 3.8% × magiExcess when NII exceeds MAGI excess', () => {
    // MAGI just barely over threshold → NIIT limited by MAGI excess
    const r = computeForm8960Lines({
      ...base,
      taxableInterest: 500_000, // huge NII
      magi: 210_000, // only $10k over threshold
      isMarried: false,
    })
    expect(r.magiExcess).toBe(10_000)
    expect(r.niitTax).toBeCloseTo(380) // 3.8% × $10k
  })

  it('uses $250k threshold for MFJ', () => {
    const r = computeForm8960Lines({ ...base, taxableInterest: 50_000, magi: 260_000, isMarried: true })
    expect(r.threshold).toBe(250_000)
    expect(r.magiExcess).toBe(10_000)
  })

  it('capital losses do not reduce NII below 0', () => {
    const r = computeForm8960Lines({ ...base, netCapGainsRaw: -50_000, magi: 300_000 })
    expect(r.netCapGains).toBe(0)
    expect(r.grossNII).toBe(0)
  })

  it('includes nonpassive K-1 trading income or loss in NII', () => {
    const r = computeForm8960Lines({
      ...base,
      taxableInterest: 100_000,
      nonpassiveTradingIncome: -20_000,
      magi: 400_000,
    })

    expect(r.grossNII).toBe(80_000)
    expect(r.components.find((c) => c.label.includes('nonpassive trading'))?.amount).toBe(-20_000)
  })
})
