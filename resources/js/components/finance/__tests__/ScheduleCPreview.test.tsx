import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'

import { fetchWrapper } from '@/fetchWrapper'

// --- Mocks ----------------------------------------------------------------

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}))

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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

jest.mock('@/components/ui/switch', () => ({
  Switch: ({
    onCheckedChange,
    ...props
  }: React.ComponentProps<'button'> & { onCheckedChange?: (checked: boolean) => void }) => {
    const [checked, setChecked] = React.useState(false)
    const { onClick, ...rest } = props as React.ComponentProps<'button'> & { onClick?: React.MouseEventHandler<HTMLButtonElement> }

    const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
      const nextChecked = !checked
      setChecked(nextChecked)
      onCheckedChange?.(nextChecked)
      onClick?.(event)
    }

    return (
      <button
        role="switch"
        aria-checked={checked}
        {...rest}
        onClick={handleClick}
      />
    )
  },
}))

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }: React.ComponentProps<'label'>) => (
    <label {...props}>{children}</label>
  ),
}))

jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}))

jest.mock('@/lib/financeRouteBuilder', () => ({
  transactionsUrl: (acctId: number) => `/finance/account/${acctId}/transactions`,
}))

// --- Helpers ---------------------------------------------------------------

/** Response with numeric years matching real API behavior (PHP krsort coerces string keys to ints) */
const MOCK_RESPONSE_NUMERIC_YEARS = {
  available_years: ['2026', '2025'],
  years: [
    {
      year: 2026,
      entities: [
        {
          entity_id: 1,
          entity_name: 'Test Business SchC',
          schedule_c_income: [],
          schedule_c_expense: [],
          schedule_c_home_office: {
            scho_rent: {
              label: 'Rent',
              total: 7200,
              transactions: [
                { t_id: 100, t_date: '2026-02-02', t_description: 'Monthly rent', t_amt: -3600, t_account: 9 },
                { t_id: 101, t_date: '2026-03-02', t_description: 'Monthly rent', t_amt: -3600, t_account: 9 },
              ],
            },
          },
          ordinary_income: [],
          w2_income: [],
        },
      ],
    },
    {
      year: 2025,
      entities: [
        {
          entity_id: 1,
          entity_name: 'Test Business SchC',
          schedule_c_income: {
            business_income: {
              label: 'Gross receipts or sales (Business Income)',
              total: 77,
              transactions: [
                { t_id: 200, t_date: '2025-01-15', t_description: 'Square Inc', t_amt: 77, t_account: 8 },
              ],
            },
          },
          schedule_c_expense: [],
          schedule_c_home_office: {
            scho_rent: {
              label: 'Rent',
              total: 43200,
              transactions: [
                { t_id: 300, t_date: '2025-01-28', t_description: 'Monthly rent', t_amt: -3600, t_account: 9 },
              ],
            },
          },
          ordinary_income: [],
          w2_income: [],
        },
      ],
    },
  ],
  entities: [{ id: 1, display_name: 'Test Business SchC', type: 'sch_c' }],
}

const MOCK_RESPONSE_EMPTY = {
  available_years: [],
  years: [],
  entities: [],
}

// --- Tests -----------------------------------------------------------------

let ScheduleCPreview: React.ComponentType<{
  selectedYear: number | 'all'
  onAvailableYearsChange: (years: number[], isLoading: boolean) => void
}>

const mockOnAvailableYearsChange = jest.fn()

beforeAll(async () => {
  const mod = await import('../ScheduleCPreview')
  ScheduleCPreview = mod.default
})

beforeEach(() => {
  jest.clearAllMocks()
})

describe('ScheduleCPreview', () => {
  it('renders data when API returns numeric year values', async () => {
    (fetchWrapper.get as jest.Mock).mockResolvedValueOnce(MOCK_RESPONSE_NUMERIC_YEARS)

    render(<ScheduleCPreview selectedYear={2026} onAvailableYearsChange={mockOnAvailableYearsChange} />)

    await waitFor(() => {
      expect(screen.getByText('Rent')).toBeInTheDocument()
    })

    expect(screen.queryByText(/No tax data found/)).not.toBeInTheDocument()
  })

  it('renders all years when selectedYear is "all"', async () => {
    (fetchWrapper.get as jest.Mock).mockResolvedValueOnce(MOCK_RESPONSE_NUMERIC_YEARS)

    render(<ScheduleCPreview selectedYear="all" onAvailableYearsChange={mockOnAvailableYearsChange} />)

    await waitFor(() => {
      expect(screen.getByText('2026')).toBeInTheDocument()
    })
    expect(screen.getByText('2025')).toBeInTheDocument()
    expect(screen.queryByText(/No tax data found/)).not.toBeInTheDocument()
  })

  it('shows empty state when API returns no data', async () => {
    (fetchWrapper.get as jest.Mock).mockResolvedValueOnce(MOCK_RESPONSE_EMPTY)

    render(<ScheduleCPreview selectedYear={2026} onAvailableYearsChange={mockOnAvailableYearsChange} />)

    await waitFor(() => {
      expect(screen.getByText(/No tax data found/)).toBeInTheDocument()
    })
  })

  it('shows empty state when selectedYear does not match any returned years', async () => {
    (fetchWrapper.get as jest.Mock).mockResolvedValueOnce(MOCK_RESPONSE_NUMERIC_YEARS)

    render(<ScheduleCPreview selectedYear={2020} onAvailableYearsChange={mockOnAvailableYearsChange} />)

    await waitFor(() => {
      expect(screen.getByText(/No tax data found/)).toBeInTheDocument()
    })
  })

  it('renders Schedule C income when present', async () => {
    (fetchWrapper.get as jest.Mock).mockResolvedValueOnce(MOCK_RESPONSE_NUMERIC_YEARS)

    render(<ScheduleCPreview selectedYear={2025} onAvailableYearsChange={mockOnAvailableYearsChange} />)

    await waitFor(() => {
      expect(screen.getByText('Gross receipts or sales (Business Income)')).toBeInTheDocument()
    })
    expect(screen.queryByText(/No tax data found/)).not.toBeInTheDocument()
  })

  it('shows error message when API call fails', async () => {
    (fetchWrapper.get as jest.Mock).mockRejectedValueOnce(new Error('Network error'))

    render(<ScheduleCPreview selectedYear={2026} onAvailableYearsChange={mockOnAvailableYearsChange} />)

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })

  it('calls fetchWrapper.get with the correct URL', async () => {
    (fetchWrapper.get as jest.Mock).mockResolvedValueOnce(MOCK_RESPONSE_EMPTY)

    render(<ScheduleCPreview selectedYear={2026} onAvailableYearsChange={mockOnAvailableYearsChange} />)

    await waitFor(() => {
      expect(fetchWrapper.get).toHaveBeenCalledWith('/api/finance/schedule-c')
    })
    expect(fetchWrapper.get).toHaveBeenCalledTimes(1)
  })

  it('calls onAvailableYearsChange with parsed years after successful load', async () => {
    (fetchWrapper.get as jest.Mock).mockResolvedValueOnce(MOCK_RESPONSE_NUMERIC_YEARS)

    render(<ScheduleCPreview selectedYear={2026} onAvailableYearsChange={mockOnAvailableYearsChange} />)

    await waitFor(() => {
      expect(mockOnAvailableYearsChange).toHaveBeenCalledWith([2026, 2025], false)
    })
  })

  it('calls onAvailableYearsChange with empty array on error', async () => {
    (fetchWrapper.get as jest.Mock).mockRejectedValueOnce(new Error('Network error'))

    render(<ScheduleCPreview selectedYear={2026} onAvailableYearsChange={mockOnAvailableYearsChange} />)

    await waitFor(() => {
      expect(mockOnAvailableYearsChange).toHaveBeenCalledWith([], false)
    })
  })

  it('handles entities with empty arrays for income/expense but object for home office', async () => {
    const response = {
      available_years: ['2026'],
      years: [
        {
          year: 2026,
          entities: [
            {
              entity_id: 1,
              entity_name: 'Mixed Types Entity',
              schedule_c_income: [],
              schedule_c_expense: [],
              schedule_c_home_office: {
                scho_utilities: {
                  label: 'Utilities',
                  total: 500,
                  transactions: [
                    { t_id: 400, t_date: '2026-01-15', t_description: 'Electric bill', t_amt: -500, t_account: 3 },
                  ],
                },
              },
              ordinary_income: [],
              w2_income: [],
            },
          ],
        },
      ],
      entities: [{ id: 1, display_name: 'Mixed Types Entity', type: 'sch_c' }],
    };

    (fetchWrapper.get as jest.Mock).mockResolvedValueOnce(response)

    render(<ScheduleCPreview selectedYear={2026} onAvailableYearsChange={mockOnAvailableYearsChange} />)

    await waitFor(() => {
      expect(screen.getByText('Utilities')).toBeInTheDocument()
    })
    expect(screen.queryByText(/No tax data found/)).not.toBeInTheDocument()
  })
})
