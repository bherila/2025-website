import '@testing-library/jest-dom'

import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'

import { fetchWrapper } from '@/fetchWrapper'
import type { LotWorkspaceResponse, NormalizedLot } from '@/types/finance/normalized-lot'

import FinanceAccountLotsPage from '../FinanceAccountLotsPage'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    post: jest.fn(),
  },
}))

// Mock heavy child components to keep this a focused page-level test.
jest.mock('../lots/ImportLotsPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="import-lots-panel" />,
}))

jest.mock('../lots/LotAnalyzer', () => ({
  __esModule: true,
  default: () => <div data-testid="lot-analyzer" />,
}))

jest.mock('../lots/shared', () => ({
  __esModule: true,
  // Mirror real LotFilters output enough for the page to render.
  LotFilters: () => <div data-testid="lot-filters" />,
  LotWorkspaceTable: ({ lots }: { lots: NormalizedLot[] }) => (
    <div data-testid="lot-table">{lots.length} lots</div>
  ),
  // Render labels that the page-level test can assert on.
  LotSummaryCards: ({
    summary,
    showTermBreakdown,
  }: {
    summary: { count: number; term_breakdown?: { short: { count: number }; long: { count: number } } }
    showTermBreakdown?: boolean
  }) => (
    <div data-testid="lot-summary-cards" data-show-term-breakdown={showTermBreakdown ? 'true' : 'false'}>
      <span>count={summary.count}</span>
      {showTermBreakdown && (
        <>
          <span>st={summary.term_breakdown?.short.count ?? 0}</span>
          <span>lt={summary.term_breakdown?.long.count ?? 0}</span>
        </>
      )}
    </div>
  ),
}))

jest.mock('../ShortDividendDetailModal', () => ({
  __esModule: true,
  ShortDividendSummaryCard: () => <div data-testid="short-div-card" />,
}))

const mockGet = fetchWrapper.get as jest.Mock

function mkLot(overrides: Partial<NormalizedLot> = {}): NormalizedLot {
  return {
    id: 1,
    source: 'broker_1099b',
    lot_origin: '1099b_disposition',
    document_id: null,
    statement_id: null,
    open_transaction_id: null,
    close_transaction_id: null,
    account_id: 7,
    account_name: 'Brokerage',
    account_number: '****1234',
    symbol: 'AAPL',
    cusip: null,
    description: null,
    quantity: '10.00',
    acquired_date: '2024-01-02',
    sold_date: '2025-03-04',
    basis: '900.00',
    proceeds: '1000.00',
    wash_sale_disallowed: '0.00',
    realized_gain: '100.00',
    is_short_term: true,
    form_8949_box: 'A',
    is_covered: true,
    accrued_market_discount: null,
    reconciliation_state: 'accepted_broker',
    link_id: 5,
    superseded_by: null,
    lot_source: '1099b',
    capabilities: [],
    created_at: null,
    updated_at: null,
    ...overrides,
  }
}

function mkResponse(overrides: Partial<LotWorkspaceResponse> = {}): LotWorkspaceResponse {
  return {
    data: [],
    summary: {
      total_proceeds: 0,
      total_basis: 0,
      total_wash_sale: 0,
      total_realized_gain: 0,
      count: 0,
      counts_by_source: {},
      counts_by_state: {},
      term_breakdown: {
        short: { proceeds: 0, basis: 0, realized_gain: 0, count: 0 },
        long: { proceeds: 0, basis: 0, realized_gain: 0, count: 0 },
      },
    },
    closed_years: [],
    meta: { current_page: 1, last_page: 1, per_page: 200, total: 0 },
    ...overrides,
  }
}

beforeEach(() => {
  mockGet.mockReset()
})

describe('FinanceAccountLotsPage', () => {
  it('renders the missing-link banner when any lot is broker_only or account_only', async () => {
    mockGet.mockResolvedValueOnce(
      mkResponse({
        data: [
          mkLot({ id: 1, reconciliation_state: 'broker_only' }),
          mkLot({ id: 2, reconciliation_state: 'account_only' }),
          mkLot({ id: 3, reconciliation_state: 'accepted_broker' }),
        ],
        summary: {
          total_proceeds: 3000,
          total_basis: 2700,
          total_wash_sale: 0,
          total_realized_gain: 300,
          count: 3,
          counts_by_source: {},
          counts_by_state: {},
          term_breakdown: {
            short: { proceeds: 0, basis: 0, realized_gain: 0, count: 0 },
            long: { proceeds: 0, basis: 0, realized_gain: 0, count: 0 },
          },
        },
      }),
    )

    render(<FinanceAccountLotsPage id={7} />)

    await waitFor(() => expect(mockGet).toHaveBeenCalled())
    expect(await screen.findByText('Missing reconciliation link')).toBeInTheDocument()
    // 2 lots flagged
    expect(
      screen.getByText(/2 lots are flagged as broker-only or account-only/i),
    ).toBeInTheDocument()
  })

  it('does not render the missing-link banner when no lots are unmatched', async () => {
    mockGet.mockResolvedValueOnce(
      mkResponse({
        data: [mkLot({ id: 1, reconciliation_state: 'accepted_broker' })],
      }),
    )

    render(<FinanceAccountLotsPage id={7} />)

    await waitFor(() => expect(mockGet).toHaveBeenCalled())
    await screen.findByTestId('lot-summary-cards')
    expect(screen.queryByText('Missing reconciliation link')).not.toBeInTheDocument()
  })

  it('renders the LotSummaryCards in aggregate mode on the Open Lots tab (default)', async () => {
    mockGet.mockResolvedValueOnce(mkResponse({ data: [mkLot()] }))

    render(<FinanceAccountLotsPage id={7} />)

    const card = await screen.findByTestId('lot-summary-cards')
    expect(card.getAttribute('data-show-term-breakdown')).toBe('false')
  })
})
