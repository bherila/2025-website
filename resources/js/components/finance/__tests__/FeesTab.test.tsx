import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

import { fetchWrapper } from '@/fetchWrapper'

import type { FeesTabData } from '../FeesTab'
import FeesTab, { feeDragChartData, FeeDragLineChart } from '../FeesTab'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    post: jest.fn(),
  },
}))

const mockedFetchWrapper = fetchWrapper as jest.Mocked<typeof fetchWrapper>

jest.mock('../TransactionDetailsModal', () => ({
  __esModule: true,
  default: () => <div data-testid="transaction-details-modal" />,
}))

interface MockLineProps {
  connectNulls?: boolean
  dataKey: string
  strokeDasharray?: string
}

interface MockTooltipProps {
  formatter?: (value: number, name: string) => [React.ReactNode, React.ReactNode]
}

interface MockYAxisProps {
  tickFormatter?: (value: number) => string
}

jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: React.PropsWithChildren) => <div data-testid="responsive-container">{children}</div>,
  LineChart: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  Line: ({ connectNulls, dataKey, strokeDasharray }: MockLineProps) => (
    <div
      data-testid={`line-${dataKey}`}
      data-connect-nulls={String(connectNulls)}
      data-stroke-dasharray={strokeDasharray ?? ''}
    />
  ),
  CartesianGrid: () => <div />,
  Tooltip: ({ formatter }: MockTooltipProps) => {
    const formatted = formatter?.(7.2, 'Gross return') ?? ['', '']

    return <div data-testid="chart-tooltip" data-name={String(formatted[1])} data-value={String(formatted[0])} />
  },
  XAxis: () => <div />,
  YAxis: ({ tickFormatter }: MockYAxisProps) => (
    <div data-testid="chart-y-axis" data-sample-tick={tickFormatter?.(7.2) ?? ''} />
  ),
}))

function makeFeesData(overrides: Partial<FeesTabData> = {}): FeesTabData {
  const base: FeesTabData = {
    year: 2025,
    account: {
      acct_id: 1,
      acct_name: 'Brokerage',
      acct_last_balance: 10000,
      expected_fee_pct: null,
      expected_fee_flat: null,
      expected_fee_notes: null,
    },
    actual: {
      total: 0,
      by_characteristic: {
        fee_schE: 0,
        fee_irc67g: 0,
        untagged: 0,
      },
      line_items: [],
    },
    expected: {
      total: 0,
      has_expectation: false,
    },
    delta: 0,
    status: null,
    monthly_fee_drag: Array.from({ length: 12 }, (_, index) => ({
      month: `2025-${String(index + 1).padStart(2, '0')}`,
      gross_return_pct: 0,
      net_return_pct: 0,
      fees: 0,
      is_projected: false,
    })),
    reconciliation: [],
    constants: {
      mismatch_threshold_usd: 1,
      on_target_tolerance: 0.1,
    },
  }

  return {
    ...base,
    ...overrides,
    account: { ...base.account, ...(overrides.account ?? {}) },
    actual: { ...base.actual, ...(overrides.actual ?? {}) },
    expected: { ...base.expected, ...(overrides.expected ?? {}) },
    constants: { ...base.constants, ...(overrides.constants ?? {}) },
  }
}

function chartPointAt(points: ReturnType<typeof feeDragChartData>, index: number) {
  const point = points[index]
  if (!point) {
    throw new Error(`Missing fee-drag chart point at index ${index}`)
  }

  return point
}

describe('FeesTab', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('hides the delta row when no expected-fees state exists', () => {
    render(<FeesTab accountId={1} initialData={makeFeesData()} />)

    expect(screen.queryByTestId('fee-delta-row')).not.toBeInTheDocument()
  })

  it('renders under, on-target, and over status pills at the threshold boundaries', () => {
    const under = render(<FeesTab accountId={1} initialData={makeFeesData({
      actual: { total: 89, by_characteristic: { fee_schE: 0, fee_irc67g: 0, untagged: 89 }, line_items: [] },
      expected: { total: 100, has_expectation: true },
    })} />)
    expect(screen.getByText('Under')).toBeInTheDocument()
    under.unmount()

    const onTarget = render(<FeesTab accountId={1} initialData={makeFeesData({
      actual: { total: 110, by_characteristic: { fee_schE: 0, fee_irc67g: 0, untagged: 110 }, line_items: [] },
      expected: { total: 100, has_expectation: true },
    })} />)
    expect(screen.getByText('On-target')).toBeInTheDocument()
    onTarget.unmount()

    render(<FeesTab accountId={1} initialData={makeFeesData({
      actual: { total: 111, by_characteristic: { fee_schE: 0, fee_irc67g: 0, untagged: 111 }, line_items: [] },
      expected: { total: 100, has_expectation: true },
    })} />)
    expect(screen.getByText('Over')).toBeInTheDocument()
  })

  it('renders negative net fee buckets and delta', () => {
    render(<FeesTab accountId={1} initialData={makeFeesData({
      actual: {
        total: -15,
        by_characteristic: { fee_schE: -12, fee_irc67g: 5, untagged: -8 },
        line_items: [],
      },
      expected: { total: 10, has_expectation: true },
    })} />)

    expect(screen.getByText('-$15.00')).toBeInTheDocument()
    expect(screen.getByText('-$12.00')).toBeInTheDocument()
    expect(screen.getByText('-$8.00')).toBeInTheDocument()
    expect(screen.getByTestId('fee-delta-row')).toHaveTextContent('-$25.00')
    expect(screen.getByText('Under')).toBeInTheDocument()
  })

  it('surfaces a review call-to-action for 13ZZ-unclassified reconciliation rows', () => {
    render(<FeesTab accountId={1} initialData={makeFeesData({
      reconciliation: [{
        entity_name: 'Example Fund LP',
        k1_fees_schE: 0,
        k1_fees_irc67g: 0,
        statement_fees_schE: 100,
        statement_fees_irc67g: 0,
        delta_schE: 100,
        delta_irc67g: 0,
        status: 'unclassified',
        tax_document_id: 5,
        account_id: 1,
      }],
    })} />)

    fireEvent.click(screen.getByRole('button', { name: /K-1 Reconciliation/i }))

    expect(screen.getByText('Review this K-1 to classify the 13ZZ fee subtotal.')).toBeInTheDocument()
  })

  it('builds drawable projected fee-drag segments while preserving historical gaps', () => {
    const chartData = feeDragChartData([
      {
        month: '2025-01',
        gross_return_pct: 7.2,
        net_return_pct: 0,
        fees: 6,
        is_projected: false,
      },
      {
        month: '2025-02',
        gross_return_pct: null,
        net_return_pct: null,
        fees: 0,
        is_projected: false,
      },
      {
        month: '2025-03',
        gross_return_pct: 8,
        net_return_pct: 2,
        fees: 0,
        is_projected: false,
      },
      {
        month: '2025-04',
        gross_return_pct: 8,
        net_return_pct: 2,
        fees: 0,
        is_projected: true,
      },
      {
        month: '2025-05',
        gross_return_pct: 8,
        net_return_pct: 2,
        fees: 0,
        is_projected: true,
      },
    ])

    const historicalGap = chartPointAt(chartData, 1)
    const projectionAnchor = chartPointAt(chartData, 2)
    const firstProjected = chartPointAt(chartData, 3)
    const secondProjected = chartPointAt(chartData, 4)

    expect(historicalGap.grossReturnPctActual).toBeNull()
    expect(historicalGap.grossReturnPctProjected).toBeNull()
    expect(projectionAnchor.grossReturnPctProjected).toBe(8)
    expect(firstProjected.grossReturnPctProjected).toBe(8)
    expect(secondProjected.grossReturnPctProjected).toBe(8)
    expect(firstProjected.netReturnPctProjected).toBe(2)
    expect(secondProjected.netReturnPctProjected).toBe(2)
    expect(firstProjected.grossReturnPctActual).toBeNull()
    expect(secondProjected.grossReturnPctActual).toBeNull()
  })

  it('draws projected fee-drag return percentages with dotted lines', () => {
    render(<FeeDragLineChart series={[
      {
        month: '2025-01',
        gross_return_pct: 7.2,
        net_return_pct: 0,
        fees: 6,
        is_projected: false,
      },
      {
        month: '2025-02',
        gross_return_pct: 7.2,
        net_return_pct: 0,
        fees: 0,
        is_projected: true,
      },
      {
        month: '2025-03',
        gross_return_pct: 7.2,
        net_return_pct: 0,
        fees: 0,
        is_projected: true,
      },
    ]} />)

    expect(screen.getByTestId('chart-y-axis')).toHaveAttribute('data-sample-tick', '7.20%')
    expect(screen.getByTestId('chart-tooltip')).toHaveAttribute('data-value', '7.20%')
    expect(screen.getByTestId('line-grossReturnPctActual')).toHaveAttribute('data-stroke-dasharray', '')
    expect(screen.getByTestId('line-netReturnPctActual')).toHaveAttribute('data-stroke-dasharray', '')
    expect(screen.getByTestId('line-grossReturnPctProjected')).toHaveAttribute('data-stroke-dasharray', '4 4')
    expect(screen.getByTestId('line-netReturnPctProjected')).toHaveAttribute('data-stroke-dasharray', '4 4')
    expect(screen.getByTestId('line-grossReturnPctActual')).toHaveAttribute('data-connect-nulls', 'false')
  })

  it('saves expected fees only from the save button', async () => {
    mockedFetchWrapper.post.mockResolvedValue({})
    mockedFetchWrapper.get.mockResolvedValue(makeFeesData({
      account: {
        acct_id: 1,
        acct_name: 'Brokerage',
        acct_last_balance: 10000,
        expected_fee_pct: 1,
        expected_fee_flat: null,
        expected_fee_notes: null,
      },
      expected: { total: 100, has_expectation: true },
    }))

    render(<FeesTab accountId={1} initialData={makeFeesData()} />)

    fireEvent.change(screen.getByLabelText('Annual AUM fee'), { target: { value: '1' } })
    fireEvent.blur(screen.getByLabelText('Annual AUM fee'))

    expect(mockedFetchWrapper.post).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Save/i }))

    await waitFor(() => expect(mockedFetchWrapper.post).toHaveBeenCalledTimes(1))
    expect(mockedFetchWrapper.post).toHaveBeenCalledWith('/api/finance/1/update-flags', {
      expectedFeePct: 1,
      expectedFeeFlat: null,
      expectedFeeNotes: null,
    })
  })
})
