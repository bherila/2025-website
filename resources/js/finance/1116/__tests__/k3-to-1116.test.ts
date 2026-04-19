import type { FK1StructuredData } from '@/types/finance/k1-data'

import {
  extractForeignTaxSummaries,
  extractK1NIIComponents,
  extractK3ForeignTaxTotal,
  extractK3IncomeBreakdown,
  extractK3Line4bApportionment,
  extractK3PassiveAssetRatio,
} from '../k3-to-1116'

// ── Fixture helpers ────────────────────────────────────────────────────────────

function makeData(overrides: Partial<FK1StructuredData> = {}): FK1StructuredData {
  return {
    schemaVersion: '2026.1',
    formType: 'K-1-1065',
    fields: {},
    codes: {},
    ...overrides,
  }
}

function toolSection(sectionId: string, rows: Record<string, unknown>[]) {
  return { sectionId, title: sectionId, data: { rows } }
}

function canonicalSection(sectionId: string, data: Record<string, unknown>) {
  return { sectionId, title: sectionId, data }
}

// ── extractK3IncomeBreakdown ───────────────────────────────────────────────────

describe('extractK3IncomeBreakdown', () => {
  it('returns zeros when no K-3 sections exist', () => {
    const result = extractK3IncomeBreakdown(makeData())
    expect(result).toEqual({ passiveIncome: 0, generalIncome: 0, sourcedByPartner: 0, isNetLine: false })
  })

  it('extracts from section 1 tool-format rows, skipping US rows', () => {
    const data = makeData({
      k3: {
        sections: [
          toolSection('part2_section1', [
            { country: 'US', col_c_passive: 500, col_d_general: 0, col_f_sourced_by_partner: 0 },
            { country: 'DE', col_c_passive: 1200, col_d_general: 300, col_f_sourced_by_partner: 100 },
            { country: 'FR', col_c_passive: 800, col_d_general: 0, col_f_sourced_by_partner: 50 },
          ]),
        ],
      },
    })
    const result = extractK3IncomeBreakdown(data)
    expect(result.passiveIncome).toBe(2000)
    expect(result.generalIncome).toBe(300)
    expect(result.sourcedByPartner).toBe(150)
    expect(result.isNetLine).toBe(false)
  })

  it('prefers line 55 net figure from section 2 (tool format)', () => {
    const data = makeData({
      k3: {
        sections: [
          toolSection('part2_section1', [
            { country: 'DE', col_c_passive: 9999, col_d_general: 0, col_f_sourced_by_partner: 0 },
          ]),
          toolSection('part2_section2', [
            { line: '55', col_c_passive: 1500, col_d_general: 200, col_f_sourced_by_partner: 75 },
          ]),
        ],
      },
    })
    const result = extractK3IncomeBreakdown(data)
    expect(result.passiveIncome).toBe(1500)
    expect(result.generalIncome).toBe(200)
    expect(result.sourcedByPartner).toBe(75)
    expect(result.isNetLine).toBe(true)
  })

  it('extracts from canonical section 1 format, skipping US rows', () => {
    const data = makeData({
      k3: {
        sections: [
          canonicalSection('part2_section1', {
            line6_interest: {
              rows: [
                { country: 'US', c: 400, d: 0, f: 0 },
                { country: 'DE', c: 1000, d: 500, f: 200 },
              ],
            },
          }),
        ],
      },
    })
    const result = extractK3IncomeBreakdown(data)
    expect(result.passiveIncome).toBe(1000)
    expect(result.generalIncome).toBe(500)
    expect(result.sourcedByPartner).toBe(200)
  })
})

// ── extractK3PassiveAssetRatio ────────────────────────────────────────────────

describe('extractK3PassiveAssetRatio', () => {
  it('returns null when section is absent', () => {
    expect(extractK3PassiveAssetRatio(makeData())).toBeNull()
  })

  it('returns derivedPassiveAssetRatio when present', () => {
    const data = makeData({
      k3: {
        sections: [
          canonicalSection('part3_section2', { derivedPassiveAssetRatio: 0.42 }),
        ],
      },
    })
    expect(extractK3PassiveAssetRatio(data)).toBe(0.42)
  })

  it('computes ratio from tool format line 6a', () => {
    const data = makeData({
      k3: {
        sections: [
          toolSection('part3_section2', [
            { line: '6a', col_c_passive: 250_000, col_g_total: 1_000_000 },
          ]),
        ],
      },
    })
    expect(extractK3PassiveAssetRatio(data)).toBeCloseTo(0.25)
  })

  it('returns null when total is zero', () => {
    const data = makeData({
      k3: {
        sections: [
          toolSection('part3_section2', [{ line: '6a', col_c_passive: 0, col_g_total: 0 }]),
        ],
      },
    })
    expect(extractK3PassiveAssetRatio(data)).toBeNull()
  })
})

// ── extractK3Line4bApportionment ──────────────────────────────────────────────

describe('extractK3Line4bApportionment', () => {
  it('returns null when no passive ratio', () => {
    expect(extractK3Line4bApportionment(makeData())).toBeNull()
  })

  it('computes line4b from interest lines and passive ratio', () => {
    const data = makeData({
      k3: {
        sections: [
          toolSection('part3_section2', [
            { line: '6a', col_c_passive: 400_000, col_g_total: 1_000_000 },
          ]),
          toolSection('part2_section2', [
            { line: '39', col_g_total: 10_000 },
            { line: '40', col_g_total: 5_000 },
            { line: '99', col_g_total: 99_999 }, // not an interest line — ignored
          ]),
        ],
      },
    })
    const result = extractK3Line4bApportionment(data)
    if (!result) throw new Error('expected result')
    expect(result.interestExpense).toBe(15_000)
    expect(result.passiveRatio).toBeCloseTo(0.4)
    expect(result.line4b).toBeCloseTo(6_000)
  })
})

// ── extractK3ForeignTaxTotal ──────────────────────────────────────────────────

describe('extractK3ForeignTaxTotal', () => {
  it('returns 0 when section is absent', () => {
    expect(extractK3ForeignTaxTotal(makeData())).toBe(0)
  })

  it('returns grandTotalUSD from tool format', () => {
    const data = makeData({
      k3: {
        sections: [
          canonicalSection('part3_section4', {
            grandTotalUSD: 3_500,
            countries: [{ amount_usd: 1_500 }, { amount_usd: 2_000 }],
          }),
        ],
      },
    })
    expect(extractK3ForeignTaxTotal(data)).toBe(3_500)
  })

  it('sums country amounts when grandTotalUSD is absent', () => {
    const data = makeData({
      k3: {
        sections: [
          canonicalSection('part3_section4', {
            countries: [{ amount_usd: 1_200 }, { amount_usd: 800 }],
          }),
        ],
      },
    })
    expect(extractK3ForeignTaxTotal(data)).toBe(2_000)
  })
})

// ── extractForeignTaxSummaries — SBP election ─────────────────────────────────

describe('extractForeignTaxSummaries — SBP election', () => {
  function makeDataWithK3(
    passiveIncome: number,
    sourcedByPartner: number,
    electionSBPasUS: boolean,
  ): FK1StructuredData {
    return makeData({
      codes: {
        '16': [{ code: 'I', value: '1000' }],
      },
      k3: {
        sections: [
          toolSection('part2_section1', [
            { country: 'DE', col_c_passive: passiveIncome, col_d_general: 0, col_f_sourced_by_partner: sourcedByPartner },
          ]),
        ],
      },
      k3Elections: { sourcedByPartnerAsUSSource: electionSBPasUS },
    })
  }

  it('includes sourcedByPartner in passive income when election is NOT active', () => {
    const summaries = extractForeignTaxSummaries(makeDataWithK3(1_000, 500, false))
    expect(summaries).toHaveLength(1)
    const s = summaries[0]
    if (!s) throw new Error('expected summary')
    expect(s.grossForeignIncome).toBe(1_500)
  })

  it('excludes sourcedByPartner from passive income when election IS active', () => {
    const summaries = extractForeignTaxSummaries(makeDataWithK3(1_000, 500, true))
    expect(summaries).toHaveLength(1)
    const s = summaries[0]
    if (!s) throw new Error('expected summary')
    expect(s.grossForeignIncome).toBe(1_000)
  })

  it('returns empty when no foreign taxes present', () => {
    const data = makeData()
    expect(extractForeignTaxSummaries(data)).toHaveLength(0)
  })
})

// ── extractK1NIIComponents ────────────────────────────────────────────────────

describe('extractK1NIIComponents', () => {
  it('returns zeros when no data', () => {
    const result = extractK1NIIComponents(makeData())
    expect(result).toEqual({ passiveIncome: 0, interestIncome: 0, dividends: 0, capitalGains: 0, totalNII: 0 })
  })

  it('sums passive income and capital gains from K-3 and boxes', () => {
    const data = makeData({
      fields: {
        '6a': { value: '500' }, // ordinary dividends
        '8': { value: '200' },  // short-term gain
        '9a': { value: '300' }, // long-term gain
      },
      k3: {
        sections: [
          toolSection('part2_section1', [
            { country: 'DE', col_c_passive: 1_200, col_d_general: 0, col_f_sourced_by_partner: 0 },
          ]),
        ],
      },
    })
    const result = extractK1NIIComponents(data)
    expect(result.passiveIncome).toBe(1_200)
    expect(result.interestIncome).toBe(0) // always 0: Box 5 is US-source per K-3
    expect(result.dividends).toBe(500)
    expect(result.capitalGains).toBe(500)
    expect(result.totalNII).toBe(2_200)
  })
})
