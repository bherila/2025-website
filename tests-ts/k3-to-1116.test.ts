/**
 * Unit tests for the K-3 → Form 1116 mapping module.
 */
import {
  calculateApportionedInterest,
  extractForeignTaxFrom1099Div,
  extractForeignTaxFrom1099Int,
  extractForeignTaxFromK1,
} from '../resources/js/finance/1116/k3-to-1116'
import type { FK1StructuredData } from '../resources/js/types/finance/k1-data'

function makeK1(codes: FK1StructuredData['codes']): FK1StructuredData {
  return {
    schemaVersion: '2026.1',
    formType: 'K-1-1065',
    fields: {},
    codes,
  }
}

describe('extractForeignTaxFromK1', () => {
  it('returns null when Box 16 has no foreign taxes', () => {
    const data = makeK1({})
    expect(extractForeignTaxFromK1(data)).toBeNull()
  })

  it('extracts foreign taxes paid (code I)', () => {
    const data = makeK1({
      '16': [
        { code: 'A', value: 'United States' },
        { code: 'I', value: '250.50' },
      ],
    })
    const result = extractForeignTaxFromK1(data, 42)
    expect(result).not.toBeNull()
    expect(result!.totalForeignTaxPaid).toBe(250.5)
    expect(result!.country).toBe('United States')
    expect(result!.accountId).toBe(42)
    expect(result!.sourceType).toBe('k1')
  })

  it('adds codes I and J together', () => {
    const data = makeK1({
      '16': [
        { code: 'I', value: '100' },
        { code: 'J', value: '50' },
      ],
    })
    const result = extractForeignTaxFromK1(data)
    expect(result!.totalForeignTaxPaid).toBe(150)
  })

  it('classifies as passive when only passive income (code B) present', () => {
    const data = makeK1({
      '16': [
        { code: 'B', value: '1000' },
        { code: 'I', value: '50' },
      ],
    })
    expect(extractForeignTaxFromK1(data)!.category).toBe('passive')
  })

  it('classifies as general when general income (code C) present', () => {
    const data = makeK1({
      '16': [
        { code: 'C', value: '1000' },
        { code: 'I', value: '50' },
      ],
    })
    expect(extractForeignTaxFromK1(data)!.category).toBe('general')
  })

  it('includes gross foreign income', () => {
    const data = makeK1({
      '16': [
        { code: 'B', value: '500' },
        { code: 'C', value: '300' },
        { code: 'I', value: '40' },
      ],
    })
    const result = extractForeignTaxFromK1(data)
    expect(result!.grossForeignIncome).toBe(800)
  })

  it('is case-insensitive for code matching', () => {
    const data = makeK1({
      '16': [
        { code: 'i', value: '75' },
      ],
    })
    const result = extractForeignTaxFromK1(data)
    expect(result!.totalForeignTaxPaid).toBe(75)
  })
})

describe('extractForeignTaxFrom1099Div', () => {
  it('returns null when box7 is zero', () => {
    expect(extractForeignTaxFrom1099Div({ box7_foreign_tax: 0 })).toBeNull()
    expect(extractForeignTaxFrom1099Div({})).toBeNull()
  })

  it('extracts foreign tax from box7', () => {
    const result = extractForeignTaxFrom1099Div({ box7_foreign_tax: 35.5, box8_foreign_country: 'DE' }, 7)
    expect(result!.totalForeignTaxPaid).toBe(35.5)
    expect(result!.country).toBe('DE')
    expect(result!.sourceType).toBe('1099_div')
    expect(result!.accountId).toBe(7)
    expect(result!.category).toBe('passive')
  })

  it('handles string value for box7', () => {
    const result = extractForeignTaxFrom1099Div({ box7_foreign_tax: '12.5' })
    expect(result!.totalForeignTaxPaid).toBe(12.5)
  })
})

describe('extractForeignTaxFrom1099Int', () => {
  it('returns null when box6 is zero', () => {
    expect(extractForeignTaxFrom1099Int({})).toBeNull()
  })

  it('extracts foreign tax from box6', () => {
    const result = extractForeignTaxFrom1099Int({ box6_foreign_tax: 18, box7_foreign_country: 'UK' }, 5)
    expect(result!.totalForeignTaxPaid).toBe(18)
    expect(result!.country).toBe('UK')
    expect(result!.sourceType).toBe('1099_int')
    expect(result!.accountId).toBe(5)
  })
})

describe('calculateApportionedInterest', () => {
  it('returns zeros when totalAdjustedBasis is zero', () => {
    const result = calculateApportionedInterest(1000, 500, 0)
    expect(result.apportionedForeignInterest).toBe(0)
    expect(result.ratio).toBe(0)
  })

  it('computes correct apportionment', () => {
    // 25% foreign, $1000 total interest → $250 apportioned
    const result = calculateApportionedInterest(1000, 2500, 10000)
    expect(result.ratio).toBeCloseTo(0.25)
    expect(result.apportionedForeignInterest).toBeCloseTo(250)
  })

  it('handles 100% foreign assets', () => {
    const result = calculateApportionedInterest(500, 1000, 1000)
    expect(result.ratio).toBe(1)
    expect(result.apportionedForeignInterest).toBe(500)
  })
})
