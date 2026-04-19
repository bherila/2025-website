import type { FK1StructuredData } from '@/types/finance/k1-data'

import { computeForm8995Lines, extractQBIFromK1, qbiThreshold } from '../k1-to-8995'

function makeData(codes: FK1StructuredData['codes'] = {}): FK1StructuredData {
  return { schemaVersion: '2026.1', formType: 'K-1-1065', fields: {}, codes }
}

function box20(...items: { code: string; value: string; notes?: string }[]): FK1StructuredData['codes'] {
  return { '20': items.map(i => ({ code: i.code, value: i.value, notes: i.notes ?? '' })) }
}

// ── qbiThreshold ──────────────────────────────────────────────────────────────

describe('qbiThreshold', () => {
  it('returns 2024 thresholds', () => {
    expect(qbiThreshold(2024)).toEqual({ single: 191_950, mfj: 383_900 })
  })

  it('falls back to 2025 for unknown years', () => {
    expect(qbiThreshold(2099)).toEqual(qbiThreshold(2025))
  })
})

// ── extractQBIFromK1 ──────────────────────────────────────────────────────────

describe('extractQBIFromK1', () => {
  it('returns null when no Box 20 S or V', () => {
    expect(extractQBIFromK1(makeData(), 'Acme LP')).toBeNull()
  })

  it('extracts QBI income and 20% component', () => {
    const data = makeData(box20({ code: 'S', value: '50000' }))
    const result = extractQBIFromK1(data, 'Acme LP')
    expect(result).not.toBeNull()
    expect(result!.qbiIncome).toBe(50_000)
    expect(result!.qbiComponent).toBeCloseTo(10_000)
    expect(result!.ubia).toBe(0)
  })

  it('extracts UBIA from Code V', () => {
    const data = makeData(box20(
      { code: 'S', value: '30000' },
      { code: 'V', value: '200000' },
    ))
    const result = extractQBIFromK1(data, 'Acme LP')
    expect(result!.ubia).toBe(200_000)
  })

  it('clamps negative QBI to 0 for the component (loss does not give deduction)', () => {
    const data = makeData(box20({ code: 'S', value: '-15000' }))
    const result = extractQBIFromK1(data, 'Acme LP')
    expect(result!.qbiIncome).toBe(-15_000)
    expect(result!.qbiComponent).toBe(0)
  })

  it('captures notes from Code S', () => {
    const data = makeData(box20({ code: 'S', value: '10000', notes: 'W-2 wages: $50,000; SSTB: No' }))
    const result = extractQBIFromK1(data, 'Acme LP')
    expect(result!.sectionNotes).toBe('W-2 wages: $50,000; SSTB: No')
  })
})

// ── computeForm8995Lines ──────────────────────────────────────────────────────

describe('computeForm8995Lines', () => {
  it('returns empty entries when no K-1s have QBI', () => {
    const result = computeForm8995Lines(
      [{ data: makeData(), label: 'Empty LP' }],
      200_000,
      2024,
    )
    expect(result.entries).toHaveLength(0)
    expect(result.totalQBI).toBe(0)
    expect(result.estimatedDeduction).toBe(0)
  })

  it('computes deduction below threshold — single filer', () => {
    const data = makeData(box20({ code: 'S', value: '100000' }))
    const result = computeForm8995Lines(
      [{ data, label: 'Acme LP' }],
      200_000, // total income (below $191,950 threshold after std deduction)
      2024,
    )
    // estimatedTaxableIncome = 200_000 - 14_600 = 185_400
    // taxableIncomeCap = 185_400 * 0.2 = 37_080
    // qbiComponent = 100_000 * 0.2 = 20_000
    // deduction = min(20_000, 37_080) = 20_000
    expect(result.entries).toHaveLength(1)
    expect(result.totalQBI).toBe(100_000)
    expect(result.totalQBIComponent).toBeCloseTo(20_000)
    expect(result.estimatedTaxableIncome).toBeCloseTo(185_400)
    expect(result.taxableIncomeCap).toBeCloseTo(37_080)
    expect(result.estimatedDeduction).toBeCloseTo(20_000)
    expect(result.aboveThreshold).toBe(false)
  })

  it('caps deduction at 20% of taxable income when QBI component exceeds cap', () => {
    const data = makeData(box20({ code: 'S', value: '500000' }))
    const result = computeForm8995Lines(
      [{ data, label: 'Big LP' }],
      50_000,  // low total income
      2024,
    )
    // estimatedTaxableIncome = 50_000 - 14_600 = 35_400
    // taxableIncomeCap = 35_400 * 0.2 = 7_080
    // qbiComponent = 500_000 * 0.2 = 100_000 → capped at 7_080
    expect(result.estimatedDeduction).toBeCloseTo(7_080)
  })

  it('flags above threshold for single filer', () => {
    const data = makeData(box20({ code: 'S', value: '100000' }))
    const result = computeForm8995Lines(
      [{ data, label: 'Acme LP' }],
      250_000, // total income → taxable ~235k > $191,950 threshold
      2024,
    )
    expect(result.aboveThreshold).toBe(true)
  })

  it('uses MFJ threshold when isMarried=true', () => {
    const data = makeData(box20({ code: 'S', value: '100000' }))
    const single = computeForm8995Lines([{ data, label: 'LP' }], 300_000, 2024, false)
    const married = computeForm8995Lines([{ data, label: 'LP' }], 300_000, 2024, true)
    // Single: $300k > $191,950 threshold → above
    expect(single.aboveThreshold).toBe(true)
    // MFJ: $300k - $29,200 = $270,800 < $383,900 → below
    expect(married.aboveThreshold).toBe(false)
  })

  it('aggregates multiple K-1s', () => {
    const lp1 = makeData(box20({ code: 'S', value: '40000' }))
    const lp2 = makeData(box20({ code: 'S', value: '60000' }))
    const result = computeForm8995Lines(
      [{ data: lp1, label: 'LP 1' }, { data: lp2, label: 'LP 2' }],
      200_000,
      2024,
    )
    expect(result.entries).toHaveLength(2)
    expect(result.totalQBI).toBe(100_000)
    expect(result.totalQBIComponent).toBeCloseTo(20_000)
  })

  it('nets losses across partnerships before applying 20% (IRS Form 8995 Line 12)', () => {
    // LP1 has +$100k QBI, LP2 has -$50k loss → net $50k → component = $10k
    const lp1 = makeData(box20({ code: 'S', value: '100000' }))
    const lp2 = makeData(box20({ code: 'S', value: '-50000' }))
    const result = computeForm8995Lines(
      [{ data: lp1, label: 'LP 1' }, { data: lp2, label: 'LP 2' }],
      200_000,
      2024,
    )
    expect(result.totalQBI).toBe(50_000)
    expect(result.totalQBIComponent).toBeCloseTo(10_000)
    // Per-entry display components are still clamped (for informational display)
    expect(result.entries[0]?.qbiComponent).toBeCloseTo(20_000)
    expect(result.entries[1]?.qbiComponent).toBe(0)
  })

  it('returns 0 deduction when aggregate QBI is negative', () => {
    const data = makeData(box20({ code: 'S', value: '-30000' }))
    const result = computeForm8995Lines([{ data, label: 'Loss LP' }], 200_000, 2024)
    expect(result.totalQBI).toBe(-30_000)
    expect(result.totalQBIComponent).toBe(0)
    expect(result.estimatedDeduction).toBe(0)
  })
})
