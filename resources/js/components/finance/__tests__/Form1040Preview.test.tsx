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
  schedule1OtherIncome?: number
  scheduleEGrandTotal?: number
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

  it('renders one unified Line 8 row and routes clicks to the Schedule 1 tab', () => {
    const onNavigate = jest.fn()
    render(
      <Form1040Preview
        {...defaultProps}
        scheduleCIncome={5000}
        schedule1OtherIncome={750}
        scheduleEGrandTotal={1200}
        onNavigate={onNavigate}
      />,
    )

    const row = screen.getByText('Additional income from Schedule 1, line 10').closest('tr')!
    fireEvent.click(row)

    expect(onNavigate).toHaveBeenCalledWith('schedule-1')
  })

  it('aggregates Schedule C, Schedule E, and Schedule 1 line 8 into a single Line 8 value', () => {
    render(
      <Form1040Preview
        {...defaultProps}
        scheduleCIncome={5000}
        schedule1OtherIncome={750}
        scheduleEGrandTotal={1200}
      />,
    )

    // Line 8 value should be 5000 + 1200 + 750 = 6950
    expect(screen.getByText('$6,950.00')).toBeInTheDocument()
    // Line 9 total income = 100000 + 500 + 1200 + 6950 = 108650
    expect(screen.getByText('$108,650.00')).toBeInTheDocument()
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
