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

describe('computeScheduleD', () => {
  it('adds 1099-DIV capital gain distributions to Schedule D line 13', () => {
    const result = computeScheduleD([], [make1099DivDoc(), makeBrokerDivDoc()])

    expect(result.schD.schD_line13).toBe(650)
    expect(result.schD.schD_line15).toBe(650)
    expect(result.schD.schD_line16).toBe(650)
  })
})
