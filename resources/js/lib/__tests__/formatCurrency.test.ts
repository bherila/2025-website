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

  it('keeps negative friendly currency amounts obvious', () => {
    expect(formatFriendlyCurrencyAmount(-239283)).toBe('-$239k')
  })

  it('matches exact currency null fallback behavior', () => {
    expect(formatFriendlyCurrencyAmount(null)).toBe('-')
  })
})
