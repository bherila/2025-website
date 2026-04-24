import { render, screen } from '@testing-library/react'
import React from 'react'

import type { TaxDocument } from '@/types/finance/tax-document'

import ScheduleEPreview, { computeScheduleELines } from '../ScheduleEPreview'

function makeMiscDoc(overrides: Partial<TaxDocument> = {}): TaxDocument {
  return {
    id: 1,
    user_id: 1,
    tax_year: 2025,
    form_type: '1099_misc',
    employment_entity_id: null,
    account_id: null,
    original_filename: 'misc.pdf',
    stored_filename: null,
    s3_path: null,
    mime_type: 'application/pdf',
    file_size_bytes: 1,
    file_hash: 'misc',
    is_reviewed: true,
    misc_routing: null,
    notes: null,
    human_file_size: '1 B',
    download_count: 0,
    genai_job_id: null,
    genai_status: 'parsed',
    parsed_data: { payer_name: 'Tenant Co', box1_rents: 1500 },
    uploader: null,
    employment_entity: null,
    account: null,
    account_links: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('ScheduleEPreview', () => {
  it('renders 1099-MISC rental income before any K-1 rows', () => {
    render(<ScheduleEPreview reviewedK1Docs={[]} reviewed1099Docs={[makeMiscDoc()]} selectedYear={2025} />)

    expect(screen.getByText('Part I — 1099-MISC Rental & Royalty Income')).toBeInTheDocument()
    expect(screen.getByText('Tenant Co — 1099-MISC')).toBeInTheDocument()
    expect(screen.getByText('1099-MISC rental & royalty income subtotal')).toBeInTheDocument()
    expect(screen.getAllByText('$1,500')).not.toHaveLength(0)
  })

  it('adds 1099-MISC rental income into the Schedule E grand total', () => {
    const lines = computeScheduleELines([], [makeMiscDoc({ parsed_data: { payer_name: 'Tenant Co', box2_royalties: 900 } })])

    expect(lines.miscIncomeTotal).toBe(900)
    expect(lines.grandTotal).toBe(900)
  })
})
