import { render, screen } from '@testing-library/react'

import type { TaxDocument } from '@/types/finance/tax-document'

import ScheduleSEPreview, { computeScheduleSE } from '../ScheduleSEPreview'

function makeK1Doc(code: string, value: string): TaxDocument {
  return {
    id: 1,
    tax_year: 2025,
    form_type: 'k1',
    genai_status: 'parsed',
    is_reviewed: true,
    parsed_data: {
      schemaVersion: '2026.1',
      formType: 'K-1-1065',
      fields: {
        B: { value: 'Farm LP' },
      },
      codes: {
        '14': [{ code, value }],
      },
    },
  } as unknown as TaxDocument
}

describe('ScheduleSEPreview', () => {
  it('extracts Box 14C farm income into Schedule SE inputs', () => {
    const computed = computeScheduleSE({
      reviewedK1Docs: [makeK1Doc('C', '12000')],
      scheduleCNetIncome: 0,
      selectedYear: 2024,
    })

    expect(computed.entries).toEqual([
      expect.objectContaining({
        label: 'Farm LP — Box 14C farm income',
        amount: 12_000,
        sourceType: 'k1_box14_c',
      }),
    ])
  })

  it('renders self-employment tax and the deductible half', () => {
    render(
      <ScheduleSEPreview
        reviewedK1Docs={[makeK1Doc('A', '100000')]}
        scheduleCNetIncome={0}
        selectedYear={2024}
      />,
    )

    expect(screen.getByText(/Schedule SE — Self-Employment Tax/i)).toBeInTheDocument()
    expect(screen.getByText(/Self-employment tax — Schedule 2 Line 4/i)).toBeInTheDocument()
    expect(screen.getByText(/Deductible half of SE tax — Schedule 1 adjustment/i)).toBeInTheDocument()
  })
})
