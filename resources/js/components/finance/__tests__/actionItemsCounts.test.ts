import currency from 'currency.js'

import { computeActionItemSeverityCounts } from '@/components/finance/actionItemsCounts'
import type { TaxDocument } from '@/types/finance/tax-document'

const emptyIncome1099 = {
  interestIncome: currency(0),
  dividendIncome: currency(0),
  qualifiedDividends: currency(0),
}

function k1Doc(overrides: { codes13?: { code: string; value: string }[]; box5?: string; box21?: string }): TaxDocument {
  return {
    id: 1,
    parsed_data: {
      schemaVersion: '1.0',
      fields: {
        ...(overrides.box5 ? { '5': { value: overrides.box5 } } : {}),
        ...(overrides.box21 ? { '21': { value: overrides.box21 } } : {}),
      },
      codes: {
        ...(overrides.codes13 ? { '13': overrides.codes13.map((c) => ({ code: c.code, value: c.value, notes: '' })) } : {}),
      },
    },
  } as unknown as TaxDocument
}

describe('computeActionItemSeverityCounts', () => {
  it('returns at least the always-on prior-year carryforward warn alert', () => {
    expect(computeActionItemSeverityCounts({ reviewedK1Docs: [], reviewed1099Docs: [], income1099: emptyIncome1099 })).toEqual({
      alert: 0,
      warn: 1,
      info: 0,
      total: 1,
    })
  })

  it('counts §67(g) suspended deductions (Box 13K) as alert', () => {
    const counts = computeActionItemSeverityCounts({
      reviewedK1Docs: [k1Doc({ codes13: [{ code: 'K', value: '500' }] })],
      reviewed1099Docs: [],
      income1099: emptyIncome1099,
    })
    expect(counts.alert).toBe(1)
  })

  it('counts Box 13F election items as warn', () => {
    const counts = computeActionItemSeverityCounts({
      reviewedK1Docs: [k1Doc({ codes13: [{ code: 'F', value: '100' }] })],
      reviewed1099Docs: [],
      income1099: emptyIncome1099,
    })
    expect(counts.warn).toBe(2) // prior-year + election
  })

  it('counts Box 13T as info', () => {
    const counts = computeActionItemSeverityCounts({
      reviewedK1Docs: [k1Doc({ codes13: [{ code: 'T', value: '250' }] })],
      reviewed1099Docs: [],
      income1099: emptyIncome1099,
    })
    expect(counts.info).toBe(1)
  })

  it('counts Box 21 without K-3 country entries as alert', () => {
    const counts = computeActionItemSeverityCounts({
      reviewedK1Docs: [k1Doc({ box21: '1500' })],
      reviewed1099Docs: [],
      income1099: emptyIncome1099,
    })
    expect(counts.alert).toBe(1)
  })

  it('does not double-count when no K-1 docs are present', () => {
    const counts = computeActionItemSeverityCounts({
      reviewedK1Docs: [],
      reviewed1099Docs: [],
      income1099: emptyIncome1099,
    })
    expect(counts.total).toBe(1)
  })
})
