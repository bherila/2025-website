import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'

import { computeScheduleALines } from '../ScheduleAPreview'

// ── Fixture helpers (mirrors Form4952Preview.test.ts) ─────────────────────────

function makeK1Data(overrides: Partial<FK1StructuredData> = {}): FK1StructuredData {
  return {
    schemaVersion: '2026.1',
    formType: 'K-1-1065',
    fields: {},
    codes: {},
    ...overrides,
  }
}

function makeK1Doc(data: FK1StructuredData, partnerName = 'Test Partnership'): TaxDocument {
  return {
    id: 1,
    user_id: 1,
    tax_year: 2024,
    form_type: 'k1',
    employment_entity_id: null,
    account_id: null,
    original_filename: null,
    stored_filename: null,
    s3_path: null,
    mime_type: 'application/pdf',
    file_size_bytes: 0,
    file_hash: 'abc',
    is_reviewed: true,
    notes: null,
    human_file_size: '0 B',
    download_count: 0,
    genai_job_id: null,
    genai_status: null,
    parsed_data: data,
    uploader: null,
    employment_entity: { id: 1, display_name: partnerName },
    account: null,
    account_links: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }
}

// ── Issue 7: Box 13L routes to Sch A Line 16 ─────────────────────────────────

describe('computeScheduleALines — Box 13L (Issue 7)', () => {
  it('includes Box 13L (portfolio deduction, no 2% floor) in otherItemizedSources', () => {
    const data = makeK1Data({
      codes: { '13': [{ code: 'L', value: '4000' }] },
    })
    const result = computeScheduleALines({ reviewedK1Docs: [makeK1Doc(data)] })
    expect(result.otherItemizedSources).toHaveLength(1)
    expect(result.otherItemizedSources[0]?.amount).toBe(4000)
    expect(result.otherItemizedSources[0]?.label).toContain('Box 13L')
    expect(result.totalOtherItemized).toBe(4000)
  })

  it('adds totalOtherItemized into totalItemizedDeductions', () => {
    const data = makeK1Data({
      codes: { '13': [{ code: 'L', value: '4000' }] },
    })
    const result = computeScheduleALines({
      reviewedK1Docs: [makeK1Doc(data)],
      saltPaid: 8000,
      userDeductions: [
        { id: 1, category: 'mortgage_interest', description: null, amount: 3000 },
      ],
    })
    // 8000 SALT + 3000 mortgage + 4000 Box 13L = 15000
    expect(result.totalItemizedDeductions).toBe(15000)
  })

  it('treats negative-stored Box 13L as a deduction (absolute value)', () => {
    const data = makeK1Data({
      codes: { '13': [{ code: 'L', value: '-2500' }] },
    })
    const result = computeScheduleALines({ reviewedK1Docs: [makeK1Doc(data)] })
    expect(result.totalOtherItemized).toBe(2500)
  })

  it('does not pick up Box 13K (§67(g) suspended) for Sch A Line 16', () => {
    const data = makeK1Data({
      codes: {
        '13': [
          { code: 'K', value: '3000' },
          { code: 'L', value: '1000' },
        ],
      },
    })
    const result = computeScheduleALines({ reviewedK1Docs: [makeK1Doc(data)] })
    // Only L routes here; K is suspended (handled by Form 4952 §67(g) logic)
    expect(result.totalOtherItemized).toBe(1000)
  })

  it('does not route Box 13G/H (investment interest) to Line 16', () => {
    const data = makeK1Data({
      codes: {
        '13': [
          { code: 'H', value: '5000' },
          { code: 'G', value: '2000' },
        ],
      },
    })
    const result = computeScheduleALines({ reviewedK1Docs: [makeK1Doc(data)] })
    expect(result.otherItemizedSources).toHaveLength(0)
    // Still flows to investment interest (Line 9)
    expect(result.totalInvIntExpense).toBe(7000)
  })

  it('aggregates Box 13L across multiple K-1s', () => {
    const dataA = makeK1Data({ codes: { '13': [{ code: 'L', value: '1500' }] } })
    const dataB = makeK1Data({ codes: { '13': [{ code: 'L', value: '2500' }] } })
    const result = computeScheduleALines({
      reviewedK1Docs: [makeK1Doc(dataA, 'Partnership A'), makeK1Doc(dataB, 'Partnership B')],
    })
    expect(result.otherItemizedSources).toHaveLength(2)
    expect(result.totalOtherItemized).toBe(4000)
  })
})
