import { formatLabNumber, formatLabReferenceRange, formatLabValue } from '@/phr/labs/formatLabResult'

describe('lab result formatting', () => {
  it('trims noisy decimal precision from numeric lab fields', () => {
    expect(formatLabNumber('3.5000000000')).toBe('3.5')
    expect(formatLabNumber('1.2460000000')).toBe('1.25')
    expect(formatLabNumber('115.0000000000')).toBe('115')
  })

  it('treats very large sentinel values as infinity placeholders', () => {
    expect(formatLabNumber('99999')).toBe('∞')
    expect(formatLabNumber('9999999.0000000000')).toBe('∞')
  })

  it('formats reference ranges with concise numbers and infinity placeholders', () => {
    expect(formatLabReferenceRange({
      range_min: '59.0000000000',
      range_max: '9999999.0000000000',
      range_unit: 'mL/min/1.73m2',
      reference_range_text: null,
    })).toBe('59–∞ mL/min/1.73m2')
  })

  it('falls back to formatted numeric values when display values are absent', () => {
    expect(formatLabValue({ value: null, value_numeric: '0.8800000000' })).toBe('0.88')
    expect(formatLabValue({ value: 'Positive', value_numeric: null })).toBe('Positive')
  })
})
