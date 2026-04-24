import { fireEvent, render, screen } from '@testing-library/react'
import currency from 'currency.js'
import React from 'react'

// --- Mocks ----------------------------------------------------------------

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

// --- Helpers ---------------------------------------------------------------

const defaultProps = {
  w2Income: currency(100000),
  interestIncome: currency(500),
  dividendIncome: currency(1200),
  scheduleCIncome: 0,
  selectedYear: 2025,
}

let Form1040Preview: React.ComponentType<typeof defaultProps & {
  scheduleEIncome?: number
  schedule1OtherIncome?: number
  deductibleSeTaxAdjustment?: number
  capitalGainOrLoss?: number | null
  schedule2TotalAdditionalTaxes?: number | null
  foreignTaxCredit?: number | null
  scheduleB?: {
    interestTotal: number
    dividendTotal: number
    qualifiedDivTotal: number
    interestLines: Array<{ label: string; amount: number }>
    dividendLines: Array<{ label: string; amount: number }>
    qualifiedDividendLines: Array<{ label: string; amount: number }>
  }
  retirementDocuments?: object[]
  onNavigate?: (tab: string) => void
}>

beforeAll(async () => {
  const mod = await import('../Form1040Preview')
  Form1040Preview = mod.default as unknown as typeof Form1040Preview
})

beforeEach(() => {
  jest.clearAllMocks()
})

// --- Tests -----------------------------------------------------------------

describe('Form1040Preview navigation', () => {
  it('calls onNavigate with "schedules" when Line 2b row is clicked', () => {
    const onNavigate = jest.fn()
    render(<Form1040Preview {...defaultProps} onNavigate={onNavigate} />)

    const row = screen.getByText('Taxable interest').closest('tr')!
    fireEvent.click(row)

    expect(onNavigate).toHaveBeenCalledWith('schedules')
    expect(onNavigate).toHaveBeenCalledTimes(1)
  })

  it('calls onNavigate with "schedules" when Line 3b row is clicked', () => {
    const onNavigate = jest.fn()
    render(<Form1040Preview {...defaultProps} onNavigate={onNavigate} />)

    const row = screen.getByText('Ordinary dividends').closest('tr')!
    fireEvent.click(row)

    expect(onNavigate).toHaveBeenCalledWith('schedules')
  })

  it('calls onNavigate with "capital-gains" when Line 7 row is clicked', () => {
    const onNavigate = jest.fn()
    render(<Form1040Preview {...defaultProps} onNavigate={onNavigate} />)

    const row = screen.getByText('Capital gain or loss').closest('tr')!
    fireEvent.click(row)

    expect(onNavigate).toHaveBeenCalledWith('capital-gains')
  })

  it('calls onNavigate with "form-1116" when Line 20 row is clicked', () => {
    const onNavigate = jest.fn()
    render(<Form1040Preview {...defaultProps} onNavigate={onNavigate} />)

    const row = screen.getByText('Foreign tax credit').closest('tr')!
    fireEvent.click(row)

    expect(onNavigate).toHaveBeenCalledWith('form-1116')
  })

  it('calls onNavigate with "schedule-c" when Line 8 row is clicked', () => {
    const onNavigate = jest.fn()
    render(<Form1040Preview {...defaultProps} scheduleCIncome={5000} onNavigate={onNavigate} />)

    const row = screen.getByText('Additional income (Schedule 1)').closest('tr')!
    fireEvent.click(row)

    expect(onNavigate).toHaveBeenCalledWith('schedule-c')
  })

  it('renders Schedule 1 other income on Line 8 and includes it in total income', () => {
    render(<Form1040Preview {...defaultProps} schedule1OtherIncome={750} />)

    expect(screen.getByText('Additional income (Schedule 1)')).toBeInTheDocument()
    expect(screen.getAllByText('$102,450.00')).toHaveLength(2)
  })

  it('renders 1099-R lines and computes AGI from schedule totals and adjustments', () => {
    render(
      <Form1040Preview
        {...defaultProps}
        scheduleB={{
          interestTotal: 700,
          dividendTotal: 1500,
          qualifiedDivTotal: 0,
          interestLines: [{ label: 'Blue Harbor — K-1 Box 5', amount: 200 }, { label: 'Bank A — 1099-INT Box 1', amount: 500 }],
          dividendLines: [{ label: 'Blue Harbor — K-1 Box 6a', amount: 300 }, { label: 'Fund A — 1099-DIV Box 1a', amount: 1200 }],
          qualifiedDividendLines: [],
        }}
        scheduleCIncome={5000}
        scheduleEIncome={1000}
        deductibleSeTaxAdjustment={706.48}
        capitalGainOrLoss={250}
        retirementDocuments={[
          {
            id: 1,
            form_type: '1099_r',
            is_reviewed: true,
            parsed_data: {
              payer_name: 'IRA Custodian',
              box1_gross_distribution: 10000,
              box2a_taxable_amount: 8000,
              box4_fed_tax: 1200,
              box7_ira_sep_simple: true,
            },
          },
          {
            id: 2,
            form_type: '1099_r',
            is_reviewed: true,
            parsed_data: {
              payer_name: 'Pension Plan',
              box1_gross_distribution: 7000,
              box2a_taxable_amount: 6500,
              box4_fed_tax: 700,
              box7_ira_sep_simple: false,
            },
          },
        ]}
      />,
    )

    expect(screen.getByText('IRA distributions')).toBeInTheDocument()
    expect(screen.getByText('Pensions and annuities')).toBeInTheDocument()
    expect(screen.getByText('$122,950.00')).toBeInTheDocument()
    expect(screen.getByText('$122,243.52')).toBeInTheDocument()
  })

  it('does NOT call onNavigate when onNavigate prop is absent', () => {
    // Render without onNavigate — clicking should not throw
    render(<Form1040Preview {...defaultProps} />)

    const row = screen.getByText('Taxable interest').closest('tr')!
    expect(() => fireEvent.click(row)).not.toThrow()
  })

  it('does NOT call onNavigate when the amount button is clicked (stopPropagation)', () => {
    const onNavigate = jest.fn()
    render(<Form1040Preview {...defaultProps} onNavigate={onNavigate} />)

    // The interest income button (Line 2b) has the drill-down modal handler.
    // Clicking it should NOT propagate to the row's onNavigate handler.
    const amountButton = screen.getAllByTitle('View data sources')[0]!
    fireEvent.click(amountButton)

    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('shows ChevronRight icon on navigable rows when onNavigate is provided', () => {
    const onNavigate = jest.fn()
    render(<Form1040Preview {...defaultProps} onNavigate={onNavigate} />)

    // There should be multiple chevrons (Line 2b, 3b, 7, 20 at minimum)
    const chevrons = screen.getAllByTestId('chevron-right')
    expect(chevrons.length).toBeGreaterThanOrEqual(4)
  })

  it('does NOT show ChevronRight icons when onNavigate is absent', () => {
    render(<Form1040Preview {...defaultProps} />)

    expect(screen.queryAllByTestId('chevron-right')).toHaveLength(0)
  })
})
