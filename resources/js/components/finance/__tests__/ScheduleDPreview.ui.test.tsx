import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

import type { TaxDocument } from '@/types/finance/tax-document'

import ScheduleDPreview from '../ScheduleDPreview'

function makeTaxDocument(overrides: Partial<TaxDocument> = {}): TaxDocument {
  return {
    id: 1,
    user_id: 1,
    tax_year: 2025,
    form_type: '1099_b',
    employment_entity_id: null,
    account_id: null,
    original_filename: 'doc.pdf',
    stored_filename: null,
    s3_path: null,
    mime_type: 'application/pdf',
    file_size_bytes: 1,
    file_hash: 'doc',
    is_reviewed: true,
    misc_routing: null,
    notes: null,
    human_file_size: '1 B',
    download_count: 0,
    genai_job_id: null,
    genai_status: 'parsed',
    parsed_data: null,
    uploader: null,
    employment_entity: null,
    account: null,
    account_links: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('ScheduleDPreview detail navigation', () => {
  it('renders detail buttons for Schedule D source rows and opens the associated tax document', () => {
    const onOpenDoc = jest.fn()
    const k1Doc = makeTaxDocument({
      id: 10,
      form_type: 'k1',
      original_filename: 'k1.pdf',
      parsed_data: {
        schemaVersion: '2026.1',
        formType: '1065',
        fields: {
          B: { value: 'Source Partnership' },
          '8': { value: '1200' },
        },
        codes: {
          '11': [{ code: 'S', value: '2500', notes: 'Net long-term capital gain' }],
        },
      },
    })
    const divDoc = makeTaxDocument({
      id: 11,
      form_type: '1099_div',
      original_filename: 'div.pdf',
      parsed_data: {
        payer_name: 'Dividend Broker',
        box2a_cap_gain: 400,
      },
    })

    render(
      <ScheduleDPreview
        reviewedK1Docs={[k1Doc]}
        reviewed1099Docs={[divDoc]}
        selectedYear={2025}
        onOpenDoc={onOpenDoc}
      />,
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Open K-1 detail' })[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Open 1099-DIV detail' }))

    expect(onOpenDoc).toHaveBeenNthCalledWith(1, 10)
    expect(onOpenDoc).toHaveBeenNthCalledWith(2, 11)
  })

  it('shows pulled prior-year capital loss carryovers and links line 21 back to Form 1040 line 7', () => {
    const onGoToForm1040 = jest.fn()
    const brokerDoc = makeTaxDocument({
      id: 12,
      form_type: '1099_b',
      original_filename: 'broker.pdf',
      parsed_data: {
        payer_name: 'Current Broker',
      },
    })

    render(
      <ScheduleDPreview
        reviewedK1Docs={[]}
        reviewed1099Docs={[brokerDoc]}
        selectedYear={2025}
        priorYearCapitalLossCarryover={{ shortTermCarryover: 7000, longTermCarryover: 2000 }}
        onGoToForm1040={onGoToForm1040}
      />,
    )

    expect(screen.getByText('2024 short-term capital loss carryover')).toBeInTheDocument()
    expect(screen.getByText('2024 long-term capital loss carryover')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Form 1040 line 7' }))

    expect(onGoToForm1040).toHaveBeenCalledTimes(1)
  })

  it('opens Schedule D line 5 supporting details with per-source navigation', () => {
    const onOpenDoc = jest.fn()
    const k1Doc = makeTaxDocument({
      id: 20,
      form_type: 'k1',
      original_filename: 'k1.pdf',
      parsed_data: {
        schemaVersion: '2026.1',
        formType: '1065',
        fields: {
          B: { value: 'TAX AWARE HEDGE FUND FUND, LLC' },
          '8': { value: '1200' },
        },
        codes: {
          '11': [{ code: 'S', value: '-500', notes: 'Net short-term capital loss' }],
        },
      },
    })

    render(
      <ScheduleDPreview
        reviewedK1Docs={[k1Doc]}
        reviewed1099Docs={[]}
        selectedYear={2025}
        onOpenDoc={onOpenDoc}
      />,
    )

    fireEvent.click(screen.getByText('Line 5 total — short-term gain or (loss) from partnerships'))

    expect(screen.getByText('Schedule D Line 5 Supporting Details')).toBeInTheDocument()
    expect(screen.getAllByText('TAX AWARE HEDGE FUND FUND, LLC — K-1 Box 8').length).toBeGreaterThan(1)
    expect(screen.getAllByText('TAX AWARE HEDGE FUND FUND, LLC — K-1 Box 11S (S/T non-portfolio)').length).toBeGreaterThan(1)

    fireEvent.click(screen.getAllByRole('button', { name: 'Go to K-1' })[0]!)

    expect(onOpenDoc).toHaveBeenCalledWith(20)
  })
})
