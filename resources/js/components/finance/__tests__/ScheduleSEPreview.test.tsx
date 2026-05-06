import { render, screen } from '@testing-library/react'

import type { TaxDocument } from '@/types/finance/tax-document'
import type { ScheduleSEFacts } from '@/types/generated/tax-preview-facts'

import ScheduleSEPreview from '../ScheduleSEPreview'

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
  it('renders self-employment tax and the deductible half', () => {
    const taxFacts = {
      entries: [{
        id: 'k1-1-schedule-se-box-14A-0',
        label: 'Farm LP — K-1 Box 14A net earnings from self-employment',
        amount: 100_000,
        sourceType: 'schedule_se_k1_box_14a',
      }],
      netEarningsFromSE: 100_000,
      seTaxableEarnings: 92_350,
      socialSecurityWageBase: 168_600,
      socialSecurityWages: 0,
      remainingSocialSecurityWageBase: 168_600,
      socialSecurityTaxableEarnings: 92_350,
      socialSecurityTax: 11_451.4,
      medicareWages: 0,
      medicareTaxableEarnings: 92_350,
      medicareTax: 2678.15,
      additionalMedicareThreshold: 200_000,
      additionalMedicareTaxableEarnings: 0,
      additionalMedicareTax: 0,
      seTax: 14_129.55,
      deductibleSeTax: 7064.78,
      wageSources: [],
      scheduleFSources: [],
    } as unknown as ScheduleSEFacts

    render(
      <ScheduleSEPreview
        taxFacts={taxFacts}
        reviewedK1Docs={[makeK1Doc('A', '100000')]}
        selectedYear={2024}
      />,
    )

    expect(screen.getByText(/Schedule SE — Self-Employment Tax/i)).toBeInTheDocument()
    expect(screen.getByText(/Self-employment tax — Schedule 2 Line 4/i)).toBeInTheDocument()
    expect(screen.getByText(/Deductible half of SE tax — Schedule 1 adjustment/i)).toBeInTheDocument()
  })
})
