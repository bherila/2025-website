import { getStandardDeduction } from '@/lib/tax/standardDeductions'

describe('getStandardDeduction', () => {
  it('returns the federal value for 2024 single', () => {
    expect(getStandardDeduction(2024, 'Single')).toBe(14_600)
  })

  it('returns the federal value for 2024 MFJ', () => {
    expect(getStandardDeduction(2024, 'Married Filing Jointly')).toBe(29_200)
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
