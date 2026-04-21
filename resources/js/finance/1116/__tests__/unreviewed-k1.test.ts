import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'

import { getRelevantUnreviewedK1Docs } from '../unreviewed-k1'

function makeData(overrides: Partial<FK1StructuredData> = {}): FK1StructuredData {
  return {
    schemaVersion: '2026.1',
    formType: 'K-1-1065',
    fields: {},
    codes: {},
    ...overrides,
  }
}

function makeDoc(id: number, parsed: FK1StructuredData, isReviewed: boolean): TaxDocument {
  return {
    id,
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
    file_hash: String(id),
    is_reviewed: isReviewed,
    notes: null,
    human_file_size: '0 B',
    download_count: 0,
    genai_job_id: null,
    genai_status: null,
    parsed_data: parsed,
    uploader: null,
    employment_entity: { id, display_name: `Partner ${id}` },
    account: null,
    account_links: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }
}

describe('getRelevantUnreviewedK1Docs', () => {
  it('returns unreviewed K-1 with relevant foreign tax data', () => {
    const unreviewed = makeDoc(1, makeData({
      fields: { B: { value: 'Partner One' }, '21': { value: '99' } },
    }), false)
    const reviewed = makeDoc(2, makeData({
      fields: { B: { value: 'Reviewed' }, '21': { value: '88' } },
    }), true)

    const result = getRelevantUnreviewedK1Docs([unreviewed, reviewed])
    expect(result).toEqual([{ id: 1, partnerName: 'Partner One' }])
  })

  it('ignores unreviewed K-1 with no relevant foreign tax data', () => {
    const unreviewed = makeDoc(1, makeData({
      fields: { B: { value: 'No Data' }, '21': { value: '0' } },
      codes: { '16': [{ code: 'A', value: '0' }] },
    }), false)

    expect(getRelevantUnreviewedK1Docs([unreviewed])).toEqual([])
  })
})
