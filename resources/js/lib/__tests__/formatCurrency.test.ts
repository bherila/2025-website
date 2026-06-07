import { formatCurrency, formatFriendlyAmount, formatFriendlyCurrencyAmount } from '../formatCurrency'

describe('formatCurrency helpers', () => {
  it('keeps exact currency formatting available', () => {
    expect(formatCurrency(239283)).toBe('$239,283.00')
  })

  it('keeps existing friendly amount semantics unchanged', () => {
    expect(formatFriendlyAmount(239283)).toBe('239.3k')
  })

  it('formats compact friendly currency amounts', () => {
    expect(formatFriendlyCurrencyAmount(1000000)).toBe('$1M')
    expect(formatFriendlyCurrencyAmount(239283)).toBe('$239k')
    expect(formatFriendlyCurrencyAmount('$239,283')).toBe('$239k')
    expect(formatFriendlyCurrencyAmount(1250000)).toBe('$1.3M')
    expect(formatFriendlyCurrencyAmount(999)).toBe('$999')
  })

  it('promotes near-boundary thousands when rounding crosses into millions', () => {
    expect(formatFriendlyCurrencyAmount(999499)).toBe('$999k')
    expect(formatFriendlyCurrencyAmount(999500)).toBe('$1M')
  })

  it('promotes near-boundary millions when rounding crosses into billions', () => {
    expect(formatFriendlyCurrencyAmount(999499999)).toBe('$999M')
    expect(formatFriendlyCurrencyAmount(999500000)).toBe('$1B')
  })

  it('keeps negative friendly currency amounts obvious', () => {
    expect(formatFriendlyCurrencyAmount(-239283)).toBe('-$239k')
    expect(formatFriendlyCurrencyAmount(-999500)).toBe('-$1M')
  })

  it('matches exact currency null fallback behavior', () => {
    expect(formatFriendlyCurrencyAmount(null)).toBe('-')
  })
})
