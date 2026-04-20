import { parseCurrencyInput } from '../resources/js/components/finance/tax-preview-primitives'

describe('parseCurrencyInput', () => {
  it.each([
    ['', 0],
    ['abc', 0],
    ['1,234.56', 1234.56],
    ['1.2.3', 1.23],
    ['$100', 100],
    ['-50', 50],
  ])('parses %p as %p', (input, expected) => {
    expect(parseCurrencyInput(input)).toBe(expected)
  })
})
