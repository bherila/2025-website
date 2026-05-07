import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

import type { TaxDocument } from '@/types/finance/tax-document'
import type { Form1040Facts, TaxFactSource } from '@/types/generated/tax-preview-facts'

import Form1040Preview, { compute1099RDistributionSummary, form1040FactsToLines } from '../Form1040Preview'

jest.mock('lucide-react', () => ({
  ChevronRight: () => <svg data-testid="chevron-right" />,
}))

jest.mock('@/components/ui/table', () => ({
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableCell: ({ children, ...p }: React.ComponentProps<'td'>) => <td {...p}>{children}</td>,
  TableHead: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableRow: ({ children, ...p }: React.ComponentProps<'tr'>) => <tr {...p}>{children}</tr>,
}))

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
}))

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

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

function renderForm1040(facts: Form1040Facts = makeFacts(), onNavigate?: (tab: string) => void) {
  return render(<Form1040Preview facts={facts} selectedYear={2025} onNavigate={onNavigate} />)
}

describe('Form1040Preview', () => {
  it('renders backend Form 1040 facts as line items', () => {
    renderForm1040()

    expect(screen.getByText('Wages, salaries, tips')).toBeInTheDocument()
    expect(screen.getByText('Total tax')).toBeInTheDocument()
    expect(screen.getByText('$100,000.00')).toBeInTheDocument()
    expect(screen.getByText('$18,000.00')).toBeInTheDocument()
  })

  it('maps facts to workbook-compatible line items', () => {
    const lines = form1040FactsToLines(makeFacts())

    expect(lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ line: '1z', value: 100_000 }),
      expect.objectContaining({ line: '24', value: 18_000 }),
      expect.objectContaining({ line: '37', value: 1_300 }),
    ]))
  })

  it('calls onNavigate for Schedule B, Schedule D, Schedule 3, and Schedule 1 rows', () => {
    const onNavigate = jest.fn()
    renderForm1040(makeFacts(), onNavigate)

    fireEvent.click(screen.getByText('Taxable interest').closest('tr')!)
    fireEvent.click(screen.getByText('Capital gain or loss').closest('tr')!)
    fireEvent.click(screen.getByText('Nonrefundable credits from Schedule 3').closest('tr')!)
    fireEvent.click(screen.getByText('Additional income from Schedule 1').closest('tr')!)

    expect(onNavigate).toHaveBeenNthCalledWith(1, 'schedules')
    expect(onNavigate).toHaveBeenNthCalledWith(2, 'capital-gains')
    expect(onNavigate).toHaveBeenNthCalledWith(3, 'schedule-3')
    expect(onNavigate).toHaveBeenNthCalledWith(4, 'schedule-1')
  })

  it('does not navigate when an amount source button is clicked', () => {
    const onNavigate = jest.fn()
    renderForm1040(makeFacts(), onNavigate)

    fireEvent.click(screen.getAllByTitle('View data sources')[0]!)

    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('shows navigation chevrons only when navigation is provided', () => {
    const { rerender } = render(<Form1040Preview facts={makeFacts()} selectedYear={2025} />)
    expect(screen.queryAllByTestId('chevron-right')).toHaveLength(0)

    rerender(<Form1040Preview facts={makeFacts()} selectedYear={2025} onNavigate={jest.fn()} />)
    expect(screen.getAllByTestId('chevron-right').length).toBeGreaterThanOrEqual(4)
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
