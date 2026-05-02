import { parseMoney, parseMoneyOrZero, sumMoneyValues } from '../money'

describe('money helpers', () => {
  it('parses currency-formatted and accounting-style amounts', () => {
    expect(parseMoney('$8,893.12')).toBe(8893.12)
    expect(parseMoney('(8,893)')).toBe(-8893)
    expect(parseMoney('-$8,893')).toBe(-8893)
  })

  it('returns null for non-money placeholders', () => {
    expect(parseMoney('STMT')).toBeNull()
    expect(parseMoney('')).toBeNull()
    expect(parseMoney(null)).toBeNull()
  })

  it('sums values with currency.js semantics', () => {
    expect(sumMoneyValues(['0.10', '0.20', '(0.05)'])).toBe(0.25)
  })

  it('coerces invalid inputs to zero when requested', () => {
    expect(parseMoneyOrZero('STMT')).toBe(0)
  })
})
