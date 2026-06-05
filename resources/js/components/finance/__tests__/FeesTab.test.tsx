import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

import { fetchWrapper } from '@/fetchWrapper'

import type { FeesTabData } from '../FeesTab'
import FeesTab from '../FeesTab'

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

jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: React.PropsWithChildren) => <div data-testid="responsive-container">{children}</div>,
  LineChart: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  Line: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
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
      gross_return: 0,
      net_return: 0,
      fees: 0,
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
