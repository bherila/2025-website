import { fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'

import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'

import K1MultiYearView from '../K1MultiYearView'

jest.mock('../K1K3SourceValueModal', () => ({
  __esModule: true,
  default: ({ value, onGoToSource }: { value: { title: string } | null; onGoToSource: () => void }) => value
    ? <button type="button" onClick={onGoToSource}>Go to source</button>
    : null,
}))

function k1Data(fields: Record<string, string>): FK1StructuredData {
  return {
    schemaVersion: '2026.1',
    formType: 'K-1-1065',
    fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, { value }])),
    codes: {},
  }
}

function k1Doc(id: number, taxYear: number, fields: Record<string, string>, reviewed = true): TaxDocument {
  return {
    id,
    user_id: 1,
    tax_year: taxYear,
    form_type: 'k1',
    employment_entity_id: null,
    account_id: 42,
    original_filename: `k1-${taxYear}.pdf`,
    stored_filename: null,
    s3_path: null,
    mime_type: 'application/pdf',
    file_size_bytes: 1,
    file_hash: String(id),
    is_reviewed: reviewed,
    notes: null,
    human_file_size: '1 B',
    download_count: 0,
    genai_job_id: null,
    genai_status: 'parsed',
    parsed_data: k1Data({ A: '12-3456789', B: 'Partnership', ...fields }),
    uploader: null,
    employment_entity: null,
    account: { acct_id: 42, acct_name: 'Partnership Account' },
    account_links: [],
    created_at: `${taxYear}-01-01T00:00:00Z`,
    updated_at: `${taxYear}-01-01T00:00:00Z`,
  }
}

describe('K1MultiYearView', () => {
  it('renders all available years oldest to newest with blanks for missing documents', () => {
    render(
      <K1MultiYearView
        k1Docs={[k1Doc(1, 2023, { 1: '100' }), k1Doc(2, 2025, { 1: '300' })]}
        availableYears={[2025, 2024, 2023]}
        onReviewDoc={jest.fn()}
        onSaveParsedData={jest.fn()}
      />,
    )

    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent?.trim())
    expect(headers).toEqual(['Line', 'Description', '2023', '2024', '2025'])

    const ordinaryIncomeRow = screen.getByText('Ordinary income').closest('tr')
    expect(ordinaryIncomeRow).not.toBeNull()
    const row = within(ordinaryIncomeRow!)
    expect(row.getByText('$100')).toBeInTheDocument()
    expect(row.getByText('$300')).toBeInTheDocument()
  })

  it('opens the matching prior-year document source without changing the page-level year', () => {
    const onReviewDoc = jest.fn()
    render(
      <K1MultiYearView
        k1Docs={[k1Doc(1, 2023, { 1: '100' }), k1Doc(2, 2025, { 1: '300' })]}
        availableYears={[2025, 2024, 2023]}
        onReviewDoc={onReviewDoc}
        onSaveParsedData={jest.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '$100' }))
    fireEvent.click(screen.getByRole('button', { name: 'Go to source' }))

    expect(onReviewDoc).toHaveBeenCalledWith(1, 'k1-field-1')
  })
})
