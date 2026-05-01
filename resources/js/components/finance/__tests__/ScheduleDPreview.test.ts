import type { TaxDocument } from '@/types/finance/tax-document'

import { computeScheduleD } from '../ScheduleDPreview'

function make1099DivDoc(overrides: Partial<TaxDocument> = {}): TaxDocument {
  return {
    id: 1,
    user_id: 1,
    tax_year: 2025,
    form_type: '1099_div',
    employment_entity_id: null,
    account_id: null,
    original_filename: 'div.pdf',
    stored_filename: null,
    s3_path: null,
    mime_type: 'application/pdf',
    file_size_bytes: 1,
    file_hash: 'div',
    is_reviewed: true,
    misc_routing: null,
    notes: null,
    human_file_size: '1 B',
    download_count: 0,
    genai_job_id: null,
    genai_status: 'parsed',
    parsed_data: { payer_name: 'Standalone Div', box2a_cap_gain: 250 },
    uploader: null,
    employment_entity: null,
    account: null,
    account_links: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeBrokerDivDoc(): TaxDocument {
  return {
    id: 2,
    user_id: 1,
    tax_year: 2025,
    form_type: 'broker_1099',
    employment_entity_id: null,
    account_id: 10,
    original_filename: 'broker.pdf',
    stored_filename: null,
    s3_path: null,
    mime_type: 'application/pdf',
    file_size_bytes: 1,
    file_hash: 'broker',
    is_reviewed: true,
    misc_routing: null,
    notes: null,
    human_file_size: '1 B',
    download_count: 0,
    genai_job_id: null,
    genai_status: 'parsed',
    parsed_data: { payer_name: 'Broker Div', div_2a_cap_gain: 400 },
    uploader: null,
    employment_entity: null,
    account: { acct_id: 10, acct_name: 'Brokerage' },
    account_links: [{
      id: 20,
      tax_document_id: 2,
      account_id: 10,
      form_type: '1099_div',
      tax_year: 2025,
      ai_identifier: null,
      ai_account_name: null,
      is_reviewed: true,
      notes: null,
      account: { acct_id: 10, acct_name: 'Brokerage' },
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function makeK1WithBox11S(): TaxDocument {
  return {
    id: 3,
    user_id: 1,
    tax_year: 2025,
    form_type: 'k1',
    employment_entity_id: null,
    account_id: null,
    original_filename: 'k1.pdf',
    stored_filename: null,
    s3_path: null,
    mime_type: 'application/pdf',
    file_size_bytes: 1,
    file_hash: 'k1',
    is_reviewed: true,
    misc_routing: null,
    notes: null,
    human_file_size: '1 B',
    download_count: 0,
    genai_job_id: null,
    genai_status: 'parsed',
    parsed_data: {
      schemaVersion: '2026.1',
      formType: '1065',
      fields: { B: { value: 'AQR TA DELPHI PLUS FUND, LLC' } },
      codes: {
        '11': [
          { code: 'C', value: '32545', notes: 'Section 1256 contracts' },
          { code: 'S', value: '-101298', notes: 'Net short-term capital loss' },
          { code: 'S', value: '62473', notes: 'Net long-term capital gain, assets held 3 years or less' },
          { code: 'S', value: '7562', notes: 'Net long-term capital gain, assets held more than 3 years' },
        ],
      },
    },
    uploader: null,
    employment_entity: null,
    account: null,
    account_links: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

describe('computeScheduleD', () => {
  it('adds 1099-DIV capital gain distributions to Schedule D line 13', () => {
    const result = computeScheduleD([], [make1099DivDoc(), makeBrokerDivDoc()])

    expect(result.schD.schD_line13).toBe(650)
    expect(result.schD.schD_line15).toBe(650)
    expect(result.schD.schD_line16).toBe(650)
  })

  it('splits Box 11C into 60/40 LT/ST and routes Box 11S to lines 5/12 by character', () => {
    const result = computeScheduleD([makeK1WithBox11S()], [])

    // Form 6781 split: 32,545 → 13,018 ST + 19,527 LT
    expect(result.schD.schD_line3_gain_loss).toBe(13018)
    expect(result.schD.schD_line10_gain_loss).toBe(19527)

    // Box 11S short-term sub-line → line 5; long-term sub-lines → line 12
    expect(result.schD.schD_line5).toBeCloseTo(-101298)
    expect(result.schD.schD_line12).toBeCloseTo(70035)

    // Net ST = -101,298 + 13,018 = -88,280
    expect(result.netST).toBeCloseTo(-88280)
    // Net LT = 70,035 + 19,527 = 89,562
    expect(result.netLT).toBeCloseTo(89562)
  })

  it('honors a user-supplied character override on Box 11S even when notes disagree', () => {
    const doc = makeK1WithBox11S()
    // Force the (originally short-term) -101,298 sub-line to long-term via override.
    const codes11S = (doc.parsed_data as { codes: { '11': { code: string; value: string; notes: string; character?: 'short' | 'long' }[] } }).codes['11']
    const stRow = codes11S.find((c) => c.value === '-101298')!
    stRow.character = 'long'

    const result = computeScheduleD([doc], [])

    // -101,298 should now appear on line 12 (LT) — line 5 has no remaining 11S contribution.
    expect(result.schD.schD_line5).toBeCloseTo(0)
    expect(result.schD.schD_line12).toBeCloseTo(-101298 + 62473 + 7562)
  })
})
