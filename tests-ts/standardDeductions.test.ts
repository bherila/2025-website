import { getSaltCap, getStandardDeduction } from '@/lib/tax/standardDeductions'

describe('getStandardDeduction', () => {
  it('returns the federal value for 2024 single', () => {
    expect(getStandardDeduction(2024, 'Single')).toBe(14_600)
  })

  it('returns the federal value for 2024 MFJ', () => {
    expect(getStandardDeduction(2024, 'Married Filing Jointly')).toBe(29_200)
  })

  it('returns OBBBA-updated federal values for 2025 and 2026', () => {
    expect(getStandardDeduction(2025, 'Single')).toBe(15_750)
    expect(getStandardDeduction(2025, 'Married Filing Jointly')).toBe(31_500)
    expect(getStandardDeduction(2026, 'Single')).toBe(16_100)
    expect(getStandardDeduction(2026, 'Married Filing Jointly')).toBe(32_200)
  })

  it('returns the year-specific SALT cap', () => {
    expect(getSaltCap(2024)).toBe(10_000)
    expect(getSaltCap(2025)).toBe(40_000)
  })

  it('returns the CA state value for 2024 single (not the federal value)', () => {
    expect(getStandardDeduction(2024, 'Single', 'CA')).toBe(5_540)
  })

  it('returns the NY state value for 2024 MFJ', () => {
    expect(getStandardDeduction(2024, 'Married Filing Jointly', 'NY')).toBe(16_050)
  })

  it('CA MFJ is materially lower than federal MFJ (regression against the #257 bug)', () => {
    const fed = getStandardDeduction(2024, 'Married Filing Jointly')
    const ca = getStandardDeduction(2024, 'Married Filing Jointly', 'CA')
    expect(ca).toBeLessThan(fed)
    expect(fed - ca).toBeGreaterThan(15_000)
  })

  it('falls back to the most recent year when an unknown future year is requested', () => {
    expect(getStandardDeduction(2099, 'Single', 'CA')).toBe(5_540)
  })

  it('returns 0 for an unsupported state (do-not-subtract signal)', () => {
    expect(getStandardDeduction(2024, 'Single', 'TX')).toBe(0)
  })
})
