import type { FK1StructuredData } from '@/types/finance/k1-data'

import {
  classify11SCharacter,
  extractK1Form461Disclosure,
  getK1ActivityClassification,
  getK1CompletenessChecklist,
  getK1sWithAMTItems,
  getK1sWithPassiveLosses,
  getK1sWithSEItems,
  getUnroutedCodes,
  isTraderFundK1,
  k1NetIncome,
  parseK1Codes,
  parseK1Field,
  resolve11SCharacter,
  sumAbsK1CodeItems,
} from '../k1Utils'

declare const require: (path: string) => unknown

interface K1CharacterFixture {
  notes: string
  expected: 'short' | 'long' | null
}

const characterFixtures = require('./fixtures/k1-11s-character-fixtures.json') as K1CharacterFixture[]

function makeData(overrides: Partial<FK1StructuredData> = {}): FK1StructuredData {
  return {
    schemaVersion: '2026.1',
    formType: 'K-1-1065',
    fields: {},
    codes: {},
    ...overrides,
  }
}

describe('parseK1Field', () => {
  it('returns 0 when field is absent', () => {
    expect(parseK1Field(makeData(), '5')).toBe(0)
  })

  it('parses numeric string', () => {
    expect(parseK1Field(makeData({ fields: { '5': { value: '9865' } } }), '5')).toBe(9865)
  })

  it('parses negative value', () => {
    expect(parseK1Field(makeData({ fields: { '8': { value: '-500' } } }), '8')).toBe(-500)
  })

  it('parses formatted accounting values', () => {
    expect(parseK1Field(makeData({ fields: { '5': { value: '8,893' } } }), '5')).toBe(8893)
    expect(parseK1Field(makeData({ fields: { '5': { value: '(8,893)' } } }), '5')).toBe(-8893)
  })
})

describe('classify11SCharacter', () => {
  it('returns undefined when notes are missing', () => {
    expect(classify11SCharacter(undefined)).toBeUndefined()
    expect(classify11SCharacter(null)).toBeUndefined()
    expect(classify11SCharacter('')).toBeUndefined()
  })

  it('classifies short-term notes', () => {
    expect(classify11SCharacter('Net short-term capital loss. Report on Schedule D / Form 8949 Part I.')).toBe('short')
    expect(classify11SCharacter('short term gain')).toBe('short')
    expect(classify11SCharacter('ST capital gain')).toBe('short')
  })

  it('classifies long-term notes', () => {
    expect(classify11SCharacter('Net long-term capital gain, assets held more than 3 years.')).toBe('long')
    expect(classify11SCharacter('long-term capital gain')).toBe('long')
    expect(classify11SCharacter('LT capital loss')).toBe('long')
  })

  it('returns undefined when notes do not mention character', () => {
    expect(classify11SCharacter('Non-portfolio capital gain (loss)')).toBeUndefined()
  })

  it('returns undefined when notes mention both short-term and long-term', () => {
    expect(classify11SCharacter('Statement includes short-term and long-term capital gain subtotals')).toBeUndefined()
  })

  it.each(characterFixtures)('matches the shared fixture for $notes', ({ notes, expected }) => {
    expect(classify11SCharacter(notes) ?? null).toBe(expected)
  })
})

describe('resolve11SCharacter', () => {
  it('prefers explicit user override over notes', () => {
    expect(resolve11SCharacter({ character: 'short', notes: 'long-term gain' })).toBe('short')
    expect(resolve11SCharacter({ character: 'long', notes: 'short-term loss' })).toBe('long')
  })

  it('falls back to notes when no override', () => {
    expect(resolve11SCharacter({ notes: 'Net long-term capital gain' })).toBe('long')
    expect(resolve11SCharacter({ notes: 'Net short-term capital loss' })).toBe('short')
  })

  it('returns undefined when neither override nor notes classify', () => {
    expect(resolve11SCharacter({})).toBeUndefined()
    expect(resolve11SCharacter({ notes: 'Non-portfolio capital gain' })).toBeUndefined()
  })
})

describe('parseK1Codes', () => {
  it('returns 0 when box is absent', () => {
    expect(parseK1Codes(makeData(), '11')).toBe(0)
  })

  it('sums all code values for a box', () => {
    const data = makeData({
      codes: {
        '11': [
          { code: 'C', value: '32545' },
          { code: 'ZZ', value: '-23167' },
          { code: 'ZZ', value: '-54237' },
          { code: 'ZZ', value: '3198' },
        ],
      },
    })
    expect(parseK1Codes(data, '11')).toBeCloseTo(-41661)
  })

  it('sums formatted code values for a box', () => {
    const data = makeData({
      codes: {
        '13': [
          { code: 'ZZ', value: '8,893' },
          { code: 'ZZ', value: '(258)' },
        ],
      },
    })
    expect(parseK1Codes(data, '13')).toBe(8635)
  })
})

describe('sumAbsK1CodeItems', () => {
  it('sums matching code values as positive magnitudes', () => {
    const data = makeData({
      codes: {
        '13': [
          { code: 'zz', value: '8,893' },
          { code: 'ZZ', value: '(258)' },
          { code: 'H', value: '100' },
        ],
      },
    })

    expect(sumAbsK1CodeItems(data, '13', 'ZZ')).toBe(9151)
  })

  it('documents that signed recoveries are treated as deduction magnitudes', () => {
    const data = makeData({
      codes: {
        '13': [
          { code: 'ZZ', value: '-250' },
        ],
      },
    })

    expect(sumAbsK1CodeItems(data, '13', 'ZZ')).toBe(250)
  })
})

describe('trader fund helpers', () => {
  it('detects trader fund K-1s from statement notes', () => {
    const data = makeData({
      codes: {
        '13': [{ code: 'ZZ', value: '8893', notes: 'Trader deductions from trading activities' }],
      },
    })

    expect(isTraderFundK1(data)).toBe(true)
  })

  it('does not detect trader fund status from negated statement notes when the structured field is absent', () => {
    const data = makeData({
      raw_text: 'The partnership is not a trader in securities.',
    })

    expect(isTraderFundK1(data)).toBe(false)
  })

  it('uses the structured trader-in-securities field before statement notes', () => {
    const explicitFalse = makeData({
      fields: {
        partnershipPosition_traderInSecurities: { value: 'false' },
      },
      raw_text: 'The partnership is not a trader in securities.',
    })
    const explicitTrue = makeData({
      fields: {
        partnershipPosition_traderInSecurities: { value: 'true' },
      },
      raw_text: 'No trader deductions are described in the statement.',
    })

    expect(isTraderFundK1(explicitFalse)).toBe(false)
    expect(isTraderFundK1(explicitTrue)).toBe(true)
  })

  it('extracts Box 20AJ Form 461 support disclosure', () => {
    const data = makeData({
      codes: {
        '20': [{
          code: 'AJ',
          value: '-79535',
          notes: 'Capital gains from trade or business: $124,206; Capital losses from trade or business: ($155,469); Other income from trade or business: $65,845; Other deductions from trade or business: ($114,117).',
        }],
      },
    })

    expect(extractK1Form461Disclosure(data)).toEqual({
      capitalGains: 124206,
      capitalLosses: -155469,
      otherIncome: 65845,
      otherDeductions: -114117,
      net: -79535,
    })
  })

  it('extracts Box 20AJ Form 461 support disclosure with leading minus signs', () => {
    const data = makeData({
      codes: {
        '20': [{
          code: 'AJ',
          value: '-79535',
          notes: 'Capital gains from trade or business: $124,206; Capital losses from trade or business: -$155,469; Other income from trade or business: $65,845; Other deductions from trade or business: -$114,117.',
        }],
      },
    })

    expect(extractK1Form461Disclosure(data)).toEqual({
      capitalGains: 124206,
      capitalLosses: -155469,
      otherIncome: 65845,
      otherDeductions: -114117,
      net: -79535,
    })
  })
})

describe('k1NetIncome', () => {
  it('returns 0 when no data', () => {
    expect(k1NetIncome(makeData())).toBe(0)
  })

  it('sums basic income boxes', () => {
    const data = makeData({
      fields: {
        '5': { value: '1000' },
        '6a': { value: '2000' },
      },
    })
    expect(k1NetIncome(data)).toBe(3000)
  })

  it('does NOT double-count Box 6b (qualified dividends are a subset of Box 6a)', () => {
    // Box 6b = qualified dividends — a subset of Box 6a ordinary dividends.
    // Including 6b separately inflates net income by the qualified dividend amount.
    const data = makeData({
      fields: {
        '6a': { value: '1000' }, // ordinary dividends
        '6b': { value: '800' },  // 800 of the 1000 is qualified — NOT additional income
      },
    })
    // Net income should be 1000 (from 6a), NOT 1800 (6a + 6b)
    expect(k1NetIncome(data)).toBe(1000)
  })

  it('subtracts Box 13 deductions (not adds them)', () => {
    // Box 13 codes are DEDUCTIONS — investment interest expense, trader deductions, etc.
    // They should REDUCE net income, not increase it.
    const data = makeData({
      fields: { '5': { value: '10000' } }, // interest income
      codes: {
        '13': [
          { code: 'H', value: '3000' }, // investment interest expense (deduction)
          { code: 'ZZ', value: '500' },  // other deduction
        ],
      },
    })
    // Net income = 10000 - 3000 - 500 = 6500
    // Bug: returns 10000 + 3000 + 500 = 13500
    expect(k1NetIncome(data)).toBe(6500)
  })

  it('computes correct net for Delphi Plus-style K-1 (complex real-world case)', () => {
    // AQR TA DELPHI PLUS FUND, LLC — 2025 K-1 (simplified from training data)
    // Box 5 interest: 9865
    // Box 6a ordinary div: 20237
    // Box 6b qualified div: 16047 (subset of 6a — must NOT be added again)
    // Box 11C (sec1256): 32545
    // Box 11S (non-portfolio, multiple): -101298 + 62473 + 7562 = -31263
    // Box 11ZZ (section 988, swap, PFIC): -23167 + -54237 + 3198 = -74206
    // Box 13H (inv interest): 9776 + 13176 + 3368 = 26320 (deduction)
    // Box 13ZZ (trader/admin): 8893 + 258 = 9151 (deduction)
    //
    // Expected net = (9865 + 20237) + (32545 - 31263 - 74206) - (26320 + 9151)
    //              = 30102 + (-72924) - 35471
    //              = 30102 - 72924 - 35471
    //              = -78293
    const data = makeData({
      fields: {
        '5': { value: '9865' },
        '6a': { value: '20237' },
        '6b': { value: '16047' }, // qualified div — subset of 6a
      },
      codes: {
        '11': [
          { code: 'C', value: '32545' },
          { code: 'S', value: '-101298' },
          { code: 'S', value: '62473' },
          { code: 'S', value: '7562' },
          { code: 'ZZ', value: '-23167' },
          { code: 'ZZ', value: '-54237' },
          { code: 'ZZ', value: '3198' },
        ],
        '13': [
          { code: 'H', value: '9776' },
          { code: 'H', value: '13176' },
          { code: 'H', value: '3368' },
          { code: 'ZZ', value: '8893' },
          { code: 'ZZ', value: '258' },
        ],
      },
    })
    expect(k1NetIncome(data)).toBe(-78293)
  })

  it('subtracts Box 12 (section 179 deduction)', () => {
    const data = makeData({
      fields: {
        '1': { value: '10000' },
        '12': { value: '2000' },
      },
    })
    expect(k1NetIncome(data)).toBe(8000)
  })

  it('subtracts Box 21 (foreign taxes)', () => {
    const data = makeData({
      fields: {
        '5': { value: '5000' },
        '21': { value: '500' },
      },
    })
    expect(k1NetIncome(data)).toBe(4500)
  })

  it('treats negative Box 13 as a deduction (not income) — consistent sign handling (Issue 5)', () => {
    // If a Box 13 code is stored as negative (e.g., reversal), it should still reduce net income
    const data = makeData({
      fields: { '5': { value: '10000' } },
      codes: {
        '13': [
          { code: 'H', value: '-5000' },
        ],
      },
    })
    // With -Math.abs() convention: deduction = -5000, net = 10000 - 5000 = 5000
    expect(k1NetIncome(data)).toBe(5000)
  })

  it('treats positive Box 13 the same as negative — both reduce income (Issue 5)', () => {
    // Box 13 values of +5000 and -5000 should both produce the same deduction
    const dataPositive = makeData({
      fields: { '5': { value: '10000' } },
      codes: { '13': [{ code: 'H', value: '5000' }] },
    })
    const dataNegative = makeData({
      fields: { '5': { value: '10000' } },
      codes: { '13': [{ code: 'H', value: '-5000' }] },
    })
    expect(k1NetIncome(dataPositive)).toBe(5000)
    expect(k1NetIncome(dataNegative)).toBe(5000)
  })
})

// ── getUnroutedCodes ──────────────────────────────────────────────────────────

describe('getUnroutedCodes', () => {
  it('returns empty when all codes have routing entries', () => {
    const data = makeData({ codes: { '20': [{ code: ' z ', value: '5000' }] } })
    expect(getUnroutedCodes(data)).toEqual([])
  })

  it('does not flag suspension codes — they are intentionally in the table', () => {
    const data = makeData({ codes: { '13': [{ code: 'K', value: '100' }] } })
    expect(getUnroutedCodes(data)).toEqual([])
  })

  it('flags coded boxes with no routing entry', () => {
    // Box 18 and 19 have no entries in K1_CODE_ROUTING_NOTES
    const data = makeData({ codes: { '18': [{ code: 'A', value: '200' }] } })
    const result = getUnroutedCodes(data)
    expect(result).toHaveLength(1)
    expect(result[0]?.box).toBe('18')
    expect(result[0]?.code).toBe('A')
    expect(result[0]?.value).toBe('200')
  })

  it('mixes routed and unrouted across boxes', () => {
    const data = makeData({
      codes: {
        '14': [{ code: 'A', value: '300' }], // routed → Schedule SE
        '19': [{ code: 'A', value: '100' }], // not in routing table
        '20': [{ code: 'Z', value: '500' }], // routed → Form 8995
      },
    })
    const keys = getUnroutedCodes(data).map((r) => `${r.box}${r.code}`)
    expect(keys).toContain('19A')
    expect(keys).not.toContain('14A')
    expect(keys).not.toContain('20Z')
  })

  it('is case-insensitive', () => {
    const data = makeData({ codes: { '20': [{ code: 'z', value: '1000' }] } })
    expect(getUnroutedCodes(data)).toEqual([])
  })
})

// ── getK1ActivityClassification ───────────────────────────────────────────────

describe('getK1ActivityClassification', () => {
  it('returns nonpassive for trader in securities', () => {
    const data = makeData({ fields: { partnershipPosition_traderInSecurities: { value: 'true' } } })
    expect(getK1ActivityClassification(data)).toBe('nonpassive')
  })

  it('returns nonpassive for general partner type', () => {
    const data = makeData({ fields: { G: { value: 'General Partner' } } })
    expect(getK1ActivityClassification(data)).toBe('nonpassive')
  })

  it('returns passive for limited partner type', () => {
    const data = makeData({ fields: { G: { value: 'Limited Partner' } } })
    expect(getK1ActivityClassification(data)).toBe('passive')
  })

  it('returns unknown when no classification signals present', () => {
    expect(getK1ActivityClassification(makeData())).toBe('unknown')
  })
})

// ── getK1CompletenessChecklist ────────────────────────────────────────────────

describe('getK1CompletenessChecklist', () => {
  it('returns empty for K-1 with no notable codes', () => {
    const data = makeData({ codes: { '13': [{ code: 'G', value: '100' }] } })
    expect(getK1CompletenessChecklist(data)).toEqual([])
  })

  it('flags Box 20Z as missing when statementA is absent', () => {
    const data = makeData({ codes: { '20': [{ code: 'Z', value: '5000' }] } })
    const items = getK1CompletenessChecklist(data)
    const item = items.find((i) => i.item.includes('20Z'))
    expect(item?.status).toBe('missing')
    expect(item?.item).toContain('not yet extracted')
  })

  it('marks Box 20Z as ok when statementA is present', () => {
    const data = makeData({
      codes: { '20': [{ code: 'Z', value: '5000' }] },
      statementA: { qualifiedBusinessIncome: 5000, w2Wages: 0, ubia: 0, reitDividends: 0, ptpIncome: 0, isSstb: false },
    })
    const item = getK1CompletenessChecklist(data).find((i) => i.item.includes('20Z'))
    expect(item?.status).toBe('ok')
    expect(item?.item).toContain('extracted')
    expect(item?.item).not.toContain('not yet')
  })

  it('flags Box 17 AMT items', () => {
    const data = makeData({ codes: { '17': [{ code: 'E', value: '20' }] } })
    expect(getK1CompletenessChecklist(data).some((i) => i.item.includes('Box 17') && i.status === 'needs_user_action')).toBe(true)
  })

  it('flags Box 14 self-employment items', () => {
    const data = makeData({ codes: { '14': [{ code: 'A', value: '10000' }] } })
    const item = getK1CompletenessChecklist(data).find((i) => i.item.includes('Box 14'))
    expect(item?.status).toBe('needs_user_action')
    expect(item?.item).toContain('Schedule SE tab')
  })

  it('flags unknown Box 1 classification for Form 8582 review', () => {
    const data = makeData({
      fields: {
        '1': { value: '-3200' },
        B: { value: 'Unclassified Partnership' },
      },
    })

    expect(getK1CompletenessChecklist(data).some((i) =>
      i.item.includes('treated as passive by default') && i.status === 'needs_user_action',
    )).toBe(true)
  })

  it('flags K-3 sections when present', () => {
    const data = makeData({
      k3: { sections: [{ sectionId: 'part2_section1', title: 'Part II', data: { rows: [] } }] },
    })
    expect(getK1CompletenessChecklist(data).some((i) => i.item.includes('K-3') && i.status === 'needs_user_action')).toBe(true)
  })

  it('flags 13ZZ "other" code', () => {
    const data = makeData({ codes: { '13': [{ code: 'ZZ', value: '50' }] } })
    expect(getK1CompletenessChecklist(data).some((i) => i.item.includes('"Other"') && i.status === 'needs_user_action')).toBe(true)
  })
})

// ── Multi-K-1 incomplete-computation signals ──────────────────────────────────

describe('getK1sWithAMTItems', () => {
  it('returns empty when no K-1s have Box 17', () => {
    expect(getK1sWithAMTItems([makeData()])).toEqual([])
  })

  it('returns entity name for K-1 with Box 17 codes', () => {
    const data = makeData({
      fields: { B: { value: 'AQR Fund\n123 Main St' } },
      codes: { '17': [{ code: 'A', value: '5000' }] },
    })
    expect(getK1sWithAMTItems([data])).toEqual(['AQR Fund'])
  })

  it('falls back to "Unknown entity" when field B absent', () => {
    const data = makeData({ codes: { '17': [{ code: 'A', value: '1000' }] } })
    expect(getK1sWithAMTItems([data])).toEqual(['Unknown entity'])
  })
})

describe('getK1sWithSEItems', () => {
  it('returns empty when no K-1s have Box 14', () => {
    expect(getK1sWithSEItems([makeData()])).toEqual([])
  })

  it('returns entity name for K-1 with Box 14 code A', () => {
    const data = makeData({
      fields: { B: { value: 'Self-Employed LLC' } },
      codes: { '14': [{ code: 'A', value: '80000' }] },
    })
    expect(getK1sWithSEItems([data])).toEqual(['Self-Employed LLC'])
  })

  it('returns entity name for K-1 with Box 14 code C', () => {
    const data = makeData({
      fields: { B: { value: 'SE Farm LLC' } },
      codes: { '14': [{ code: 'c', value: '12000' }] },
    })
    expect(getK1sWithSEItems([data])).toEqual(['SE Farm LLC'])
  })

  it('does not flag K-1 with Box 14 codes other than A/C', () => {
    const data = makeData({
      fields: { B: { value: 'Non-SE Partnership' } },
      codes: { '14': [{ code: 'B', value: '1000' }] },
    })
    expect(getK1sWithSEItems([data])).toEqual([])
  })
})

describe('getK1sWithPassiveLosses', () => {
  it('returns empty when no losses', () => {
    const data = makeData({ fields: { '1': { value: '50000' } } })
    expect(getK1sWithPassiveLosses([data])).toEqual([])
  })

  it('detects negative Box 1 loss', () => {
    const data = makeData({
      fields: { B: { value: 'Real Estate LP' }, '1': { value: '-20000' } },
    })
    expect(getK1sWithPassiveLosses([data])).toEqual(['Real Estate LP'])
  })

  it('does not flag Box 2 rental loss by itself', () => {
    const data = makeData({
      fields: { B: { value: 'Rental LP' }, '2': { value: '-5000' } },
    })
    expect(getK1sWithPassiveLosses([data])).toEqual([])
  })

  it('does not flag negative Box 1 for nonpassive activities', () => {
    const data = makeData({
      fields: { B: { value: 'Trader GP LLC' }, '1': { value: '-5000' }, G: { value: 'General Partner' } },
    })
    expect(getK1sWithPassiveLosses([data])).toEqual([])
  })

  it('does not flag entities with only positive income', () => {
    const income = makeData({ fields: { '1': { value: '10000' }, '2': { value: '2000' } } })
    expect(getK1sWithPassiveLosses([income])).toEqual([])
  })
})
