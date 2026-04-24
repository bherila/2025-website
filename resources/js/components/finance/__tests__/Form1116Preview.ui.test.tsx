import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { fetchWrapper } from '@/fetchWrapper'
import { collectForeignTaxSummaries, computeForm1116Lines } from '@/finance/1116'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'

import Form1116Preview from '../Form1116Preview'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: { get: jest.fn() },
}))

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

function toolSection(sectionId: string, rows: Record<string, unknown>[]) {
  return { sectionId, title: sectionId, data: { rows } }
}

function renderForm1116(
  reviewedK1Docs: TaxDocument[],
  reviewed1099Docs: TaxDocument[],
  extras: Partial<React.ComponentProps<typeof Form1116Preview>> = {},
) {
  const foreignTaxSummaries = collectForeignTaxSummaries([...reviewedK1Docs, ...reviewed1099Docs])
  const form1116 = computeForm1116Lines({ reviewedK1Docs, reviewed1099Docs, foreignTaxSummaries })
  return render(
    <Form1116Preview
      form1116={form1116}
      foreignTaxSummaries={foreignTaxSummaries}
      allK1Docs={reviewedK1Docs}
      {...extras}
    />,
  )
}

describe('Form1116Preview UI helpers', () => {
  beforeEach(() => {
    ;(fetchWrapper.get as jest.Mock).mockResolvedValue({ lots: [] })
  })

  it('shows unreviewed relevant banner with review link', () => {
    const reviewed = makeK1Doc(makeK1Data({
      k3: {
        sections: [
          toolSection('part2_section1', [
            { country: 'DE', col_c_passive: 800, col_f_sourced_by_partner: 100 },
          ]),
        ],
      },
      k3Elections: { sourcedByPartnerAsUSSource: false },
      fields: { '21': { value: '100' } },
    }))

    const unreviewed = {
      ...makeK1Doc(makeK1Data({
        fields: {
          B: { value: 'Unreviewed Partner' },
          '21': { value: '50' },
        },
      })),
      id: 99,
      is_reviewed: false,
    }

    const onReviewNow = jest.fn()
    renderForm1116([reviewed], [], {
      allK1Docs: [reviewed, unreviewed],
      onReviewNow,
    })

    expect(screen.getByText(/excluded from Form 1116 totals/i)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Review now'))
    expect(onReviewNow).toHaveBeenCalledWith(99)
  })

  it('runs bulk sbp toggle for all displayed elections', async () => {
    const k1a = makeK1Doc(makeK1Data({
      k3: { sections: [toolSection('part2_section1', [{ country: 'DE', col_f_sourced_by_partner: 100 }])] },
      k3Elections: { sourcedByPartnerAsUSSource: false },
      fields: { '21': { value: '100' } },
    }), 'Partner A')
    const k1b = { ...makeK1Doc(makeK1Data({
      k3: { sections: [toolSection('part2_section1', [{ country: 'FR', col_f_sourced_by_partner: 120 }])] },
      k3Elections: { sourcedByPartnerAsUSSource: false },
      fields: { '21': { value: '120' } },
    }), 'Partner B'), id: 2 }

    const onBulkSetSbpElection = jest.fn().mockResolvedValue([])

    renderForm1116([k1a, k1b], [], {
      onBulkSetSbpElection,
    })

    fireEvent.click(screen.getByText('Elect all'))

    await waitFor(() => {
      expect(onBulkSetSbpElection).toHaveBeenCalledWith(true, [1, 2])
    })
  })

  it('shows the worksheet trigger inside the Form 1116 tab header', () => {
    const reviewed = makeK1Doc(makeK1Data({
      fields: { '21': { value: '100' } },
    }))

    renderForm1116([reviewed], [], { selectedYear: 2024 })

    expect(screen.getByRole('button', { name: /1116 worksheet/i })).toBeInTheDocument()
  })
})
