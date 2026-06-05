import '@testing-library/jest-dom'

import { act, render, screen, waitFor } from '@testing-library/react'

import { fetchWrapper } from '@/fetchWrapper'
import { YEAR_CHANGED_EVENT } from '@/lib/financeRouteBuilder'

import SummaryClient from '../SummaryClient'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}))

const mockedFetchWrapper = fetchWrapper as jest.Mocked<typeof fetchWrapper>

interface SummaryResponse {
  totals: {
    total_volume: number
    total_commission: number
    total_fee: number
  }
  symbolSummary: Array<{
    t_symbol: string
    total_amount: number
  }>
  monthSummary: Array<{
    month: string
    total_amount: number
  }>
}

function makeSummaryResponse(overrides: Partial<SummaryResponse> = {}): SummaryResponse {
  return {
    totals: {
      total_volume: 12_345.67,
      total_commission: 8.9,
      total_fee: 100,
      ...(overrides.totals ?? {}),
    },
    symbolSummary: overrides.symbolSummary ?? [
      { t_symbol: 'AAPL', total_amount: 500 },
    ],
    monthSummary: overrides.monthSummary ?? [
      { month: '2025-02', total_amount: 500 },
    ],
  }
}

function setTestLocation(path: string): void {
  window.history.pushState({}, '', path)
}

describe('SummaryClient', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    window.sessionStorage.clear()
    setTestLocation('/finance/account/7/summary')
  })

  it('renders total volume, commissions, and fees from the summary payload', async () => {
    mockedFetchWrapper.get.mockResolvedValue(makeSummaryResponse())

    render(<SummaryClient id={7} />)

    expect(await screen.findByTestId('summary-total-volume')).toHaveTextContent('$12,345.67')
    expect(screen.getByTestId('summary-total-commission')).toHaveTextContent('$8.90')
    expect(screen.getByTestId('summary-total-fee')).toHaveTextContent('$100.00')
    expect(screen.getByText('AAPL')).toBeInTheDocument()
    expect(screen.getByText('2025-02')).toBeInTheDocument()
    expect(mockedFetchWrapper.get).toHaveBeenCalledWith('/api/finance/7/summary')
  })

  it('renders zero totals and negative net fees', async () => {
    mockedFetchWrapper.get.mockResolvedValue(makeSummaryResponse({
      totals: {
        total_volume: 0,
        total_commission: 0,
        total_fee: -25,
      },
      symbolSummary: [],
      monthSummary: [],
    }))

    render(<SummaryClient id={7} />)

    expect(await screen.findByTestId('summary-total-volume')).toHaveTextContent('$0.00')
    expect(screen.getByTestId('summary-total-commission')).toHaveTextContent('$0.00')
    expect(screen.getByTestId('summary-total-fee')).toHaveTextContent('-$25.00')
    expect(screen.getByText('No symbol activity for this period.')).toBeInTheDocument()
    expect(screen.getByText('No monthly activity for this period.')).toBeInTheDocument()
  })

  it('refetches when the account year selection changes', async () => {
    mockedFetchWrapper.get
      .mockResolvedValueOnce(makeSummaryResponse({ totals: { total_volume: 1, total_commission: 0, total_fee: 1 } }))
      .mockResolvedValueOnce(makeSummaryResponse({ totals: { total_volume: 2, total_commission: 0, total_fee: 2 } }))

    render(<SummaryClient id={7} />)

    await waitFor(() => {
      expect(mockedFetchWrapper.get).toHaveBeenCalledWith('/api/finance/7/summary')
    })

    act(() => {
      window.dispatchEvent(new CustomEvent(YEAR_CHANGED_EVENT, {
        detail: {
          accountId: 7,
          year: 2025,
        },
      }))
    })

    await waitFor(() => {
      expect(mockedFetchWrapper.get).toHaveBeenCalledWith('/api/finance/7/summary?year=2025')
      expect(screen.getByTestId('summary-total-fee')).toHaveTextContent('$2.00')
    })
  })
})
