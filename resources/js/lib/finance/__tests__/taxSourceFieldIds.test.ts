import {
  k3Part2Section1SourceFieldId,
  k3Part2Section2SourceFieldId,
  k3Part3Section2SourceFieldId,
  k3Part4SourceFieldId,
} from '@/lib/finance/taxSourceFieldIds'

describe('taxSourceFieldIds', () => {
  it('namespaces K-3 source fields by part and section', () => {
    expect(k3Part2Section1SourceFieldId('55')).toBe('k3-part2s1-line-55')
    expect(k3Part2Section2SourceFieldId('55')).toBe('k3-part2s2-line-55')
    expect(k3Part3Section2SourceFieldId('55')).toBe('k3-part3s2-line-55')
    expect(k3Part4SourceFieldId('55')).toBe('k3-part4-line-55')
  })

  it('normalizes display line labels to the same target ids as parsed line keys', () => {
    expect(k3Part2Section1SourceFieldId('Lines 24')).toBe(k3Part2Section1SourceFieldId('24'))
    expect(k3Part2Section1SourceFieldId('Line 24')).toBe(k3Part2Section1SourceFieldId('24'))
    expect(k3Part2Section1SourceFieldId('7-8')).toBe(k3Part2Section1SourceFieldId('7'))
  })
})
