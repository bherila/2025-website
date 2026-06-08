import { fireEvent, render, screen, within } from '@testing-library/react'

import type { TaxDocument } from '@/types/finance/tax-document'
import type { Form1040Facts, TaxFactSource } from '@/types/generated/tax-preview-facts'

import Form1040Preview, { compute1099RDistributionSummary, form1040FactsToLines } from '../Form1040Preview'

function makeSource(label: string, amount: number, notes?: string): TaxFactSource {
  return {
    id: `${label}-${amount}`,
    label,
    amount,
    sourceType: 'test',
    routing: null,
    taxDocumentId: null,
    taxDocumentAccountId: null,
    accountId: null,
    formType: null,
    box: null,
    code: null,
    routingReason: null,
    notes: notes ?? null,
    isReviewed: true,
    reviewStatus: 'reviewed',
    reviewAction: null,
  }
}

function makeFacts(overrides: Partial<Form1040Facts> = {}): Form1040Facts {
  return {
    filingStatus: 'single',
    line1zSources: [makeSource('Employer A', 100_000, 'W-2 box 1')],
    line1z: 100_000,
    line2aSources: [],
    line2a: 0,
    line2bSources: [makeSource('Bank', 500, '1099-INT box 1')],
    line2b: 500,
    line3aSources: [makeSource('Broker qualified dividends', 400, '1099-DIV box 1b')],
    line3a: 400,
    line3bSources: [makeSource('Broker ordinary dividends', 1_200, '1099-DIV box 1a')],
    line3b: 1_200,
    line4aSources: [makeSource('IRA Custodian', 10_000, '1099-R box 1')],
    line4a: 10_000,
    line4bSources: [makeSource('IRA Custodian', 8_000, '1099-R box 2a')],
    line4b: 8_000,
    line5aSources: [],
    line5a: 0,
    line5bSources: [],
    line5b: 0,
    line6aSources: [],
    line6a: 0,
    line6bSources: [],
    line6b: 0,
    line7Sources: [makeSource('Schedule D capital gain', 250)],
    line7: 250,
    line8Sources: [makeSource('Schedule C net profit', 5_000)],
    line8: 5_000,
    line9: 114_950,
    line10Sources: [makeSource('Deductible half SE tax', 700)],
    line10: 700,
    line11: 114_250,
    line12Source: 'standard_deduction',
    line12Sources: [makeSource('Standard deduction', 15_750)],
    line12: 15_750,
    line13Sources: [makeSource('Form 8995 deduction', 1_000)],
    line13: 1_000,
    line14: 16_750,
    line15: 97_500,
    line16TaxComputation: 'qualified_dividends_capital_gain',
    line16Sources: [makeSource('Federal regular tax', 16_000)],
    line16: 16_000,
    line17Sources: [makeSource('AMT', 500)],
    line17: 500,
    line18: 16_500,
    line19: 0,
    line20Sources: [makeSource('Foreign tax credit', 300)],
    line20: 300,
    line21: 300,
    line22: 16_200,
    line23Sources: [makeSource('Schedule SE self-employment tax', 1_800)],
    line23: 1_800,
    line24: 18_000,
    line25aSources: [makeSource('Employer A', 15_000, 'W-2 box 2')],
    line25a: 15_000,
    line25bSources: [makeSource('IRA Custodian withholding', 1_200, '1099-R box 4')],
    line25b: 1_200,
    line25cSources: [],
    line25c: 0,
    line25d: 16_200,
    line26Sources: [],
    line26: 0,
    line31Sources: [makeSource('Extension payment', 500)],
    line31: 500,
    line32: 500,
    line33: 16_700,
    line34: 0,
    line35a: 0,
    line36: 0,
    line37: 1_300,
    line38: 0,
    ...overrides,
  }
}

interface RenderForm1040Options {
  onNavigate?: (tab: string) => void
  onOpenDetail?: (instanceKey: string) => void
}

function renderForm1040(facts: Form1040Facts = makeFacts(), options: RenderForm1040Options = {}) {
  return render(
    <Form1040Preview
      facts={facts}
      selectedYear={2025}
      onNavigate={options.onNavigate}
      onOpenDetail={options.onOpenDetail}
    />,
  )
}

function getLineRow(label: string): HTMLElement {
  const row = screen.getByText(label).closest('div.grid')

  if (!(row instanceof HTMLElement)) {
    throw new Error(`Could not find Form 1040 line row for ${label}`)
  }

  return row
}

describe('Form1040Preview', () => {
  it('renders backend Form 1040 facts as line items', () => {
    const { container } = renderForm1040()

    expect(screen.getByText('Wages, salaries, tips')).toBeInTheDocument()
    expect(screen.getByText('1z.')).toBeInTheDocument()
    expect(screen.getByText('Total tax')).toBeInTheDocument()
    expect(screen.getByText('$100,000')).toBeInTheDocument()
    expect(screen.getByText('$18,000')).toBeInTheDocument()
    expect(container.querySelector('table')).not.toBeInTheDocument()
    expect(screen.getByText('1z.').parentElement?.className).toContain('grid-cols-[2.5rem_minmax(0,1fr)_minmax(5.75rem,7rem)_2rem]')
  })

  it('maps facts to workbook-compatible line items', () => {
    const lines = form1040FactsToLines(makeFacts())

    expect(lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ line: '1z', value: 100_000 }),
      expect.objectContaining({ line: '24', value: 18_000 }),
      expect.objectContaining({ line: '37', value: 1_300 }),
    ]))
  })

  it('calls onNavigate from destination buttons for linked schedule lines', () => {
    const onNavigate = jest.fn()
    renderForm1040(makeFacts(), { onNavigate })

    fireEvent.click(within(getLineRow('Taxable interest')).getByRole('button', { name: 'Open Schedule B' }))
    fireEvent.click(within(getLineRow('Capital gain or loss')).getByRole('button', { name: 'Open Schedule D' }))
    fireEvent.click(within(getLineRow('Nonrefundable credits from Schedule 3')).getByRole('button', { name: 'Open Schedule 3' }))
    fireEvent.click(within(getLineRow('Additional income from Schedule 1')).getByRole('button', { name: 'Open Schedule 1' }))
    fireEvent.click(within(getLineRow('Standard deduction or itemized deductions')).getByRole('button', { name: 'Open Schedule A' }))

    expect(onNavigate).toHaveBeenNthCalledWith(1, 'schedules')
    expect(onNavigate).toHaveBeenNthCalledWith(2, 'capital-gains')
    expect(onNavigate).toHaveBeenNthCalledWith(3, 'schedule-3')
    expect(onNavigate).toHaveBeenNthCalledWith(4, 'schedule-1')
    expect(onNavigate).toHaveBeenNthCalledWith(5, 'schedule-a')
  })

  it('opens Miller-column source details without navigating when a source button is clicked', () => {
    const onNavigate = jest.fn()
    const onOpenDetail = jest.fn()
    renderForm1040(makeFacts(), { onNavigate, onOpenDetail })

    fireEvent.click(screen.getByRole('button', { name: 'Form 1040 Line 1z Supporting Details' }))

    expect(onOpenDetail).toHaveBeenCalledWith('form-1040:line-1z')
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('renders destination drill buttons only when navigation is provided', () => {
    const { rerender } = render(<Form1040Preview facts={makeFacts()} selectedYear={2025} />)
    expect(screen.queryByRole('button', { name: 'Open Schedule B' })).not.toBeInTheDocument()

    rerender(<Form1040Preview facts={makeFacts()} selectedYear={2025} onNavigate={jest.fn()} />)
    expect(screen.getAllByRole('button', { name: 'Open Schedule B' })).toHaveLength(3)
  })

  it('splits 1099-R IRA and pension distributions for remaining frontend consumers', () => {
    const summary = compute1099RDistributionSummary([
      {
        id: 1,
        form_type: '1099_r',
        is_reviewed: true,
        parsed_data: {
          payer_name: 'IRA Custodian',
          box1_gross_distribution: 10_000,
          box2a_taxable_amount: 8_000,
          box4_fed_tax: 1_200,
          box7_ira_sep_simple: true,
        },
      },
      {
        id: 2,
        form_type: '1099_r',
        is_reviewed: true,
        parsed_data: {
          payer_name: 'Pension Plan',
          box1_gross_distribution: 7_000,
          box2a_taxable_amount: 6_500,
          box4_fed_tax: 700,
          box7_ira_sep_simple: false,
        },
      },
    ] as unknown as TaxDocument[])

    expect(summary.ira.gross).toBe(10_000)
    expect(summary.ira.taxable).toBe(8_000)
    expect(summary.pension.gross).toBe(7_000)
    expect(summary.pension.taxable).toBe(6_500)
    expect(summary.federalWithholding).toBe(1_900)
  })
})
