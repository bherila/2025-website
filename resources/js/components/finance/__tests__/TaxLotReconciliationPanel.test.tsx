import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { fetchWrapper } from '@/fetchWrapper'

import TaxLotReconciliationPanel from '../TaxLotReconciliationPanel'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    post: jest.fn(),
  },
}))

jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    info: jest.fn(),
    success: jest.fn(),
  },
}))

const mockGet = fetchWrapper.get as jest.Mock
const mockPost = fetchWrapper.post as jest.Mock

function lot(id: number, overrides: Record<string, unknown> = {}) {
  return {
    lot_id: id,
    acct_id: 10,
    symbol: 'AAPL',
    description: 'Apple Inc.',
    quantity: 10,
    purchase_date: '2024-01-02',
    sale_date: '2025-02-03',
    proceeds: 1250,
    cost_basis: 1000,
    realized_gain_loss: 250,
    is_short_term: false,
    lot_source: '1099b',
    statement_id: null,
    close_t_id: null,
    tax_document_id: null,
    superseded_by_lot_id: null,
    reconciliation_status: null,
    reconciliation_notes: null,
    tax_document_filename: null,
    ...overrides,
  }
}

const response = {
  tax_year: 2025,
  summary: {
    matched: 1,
    variance: 0,
    missing_account: 0,
    missing_1099b: 0,
    duplicates: 0,
    unresolved_account_links: 1,
  },
  accounts: [
    {
      account_id: 10,
      account_name: 'Brokerage',
      summary: {
        matched: 1,
        variance: 0,
        missing_account: 0,
        missing_1099b: 0,
        duplicates: 0,
        unresolved_account_links: 0,
      },
      rows: [
        {
          status: 'matched',
          reported_lot: lot(101),
          account_lot: lot(202, { lot_source: 'analyzer', tax_document_id: null }),
          candidate_lots: [lot(202, { lot_source: 'analyzer', tax_document_id: null })],
          deltas: {
            quantity: 0,
            proceeds: 0,
            cost_basis: 0,
            realized_gain_loss: 0,
            sale_date_days: 0,
          },
        },
      ],
    },
  ],
  unresolved_account_links: [
    {
      id: 55,
      tax_document_id: 77,
      filename: 'consolidated.pdf',
      form_type: '1099_b',
      tax_year: 2025,
      ai_identifier: '1234',
      ai_account_name: 'Unmatched Brokerage',
    },
  ],
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('TaxLotReconciliationPanel', () => {
  it('renders summary counts, account rows, and unresolved account links', async () => {
    mockGet.mockResolvedValue(response)

    render(<TaxLotReconciliationPanel selectedYear={2025} />)

    await waitFor(() => expect(screen.getByText('Brokerage')).toBeInTheDocument())
    expect(screen.getByText(/consolidated\.pdf/)).toBeInTheDocument()
    expect(screen.getByText(/Unmatched Brokerage/)).toBeInTheDocument()
    expect(screen.getAllByText('AAPL').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Matched').length).toBeGreaterThanOrEqual(1)
  })

  it('posts supersede payload when accepting exact matches', async () => {
    mockGet.mockResolvedValue(response)
    mockPost.mockResolvedValue({ success: true })

    render(<TaxLotReconciliationPanel selectedYear={2025} />)

    await waitFor(() => expect(screen.getByText('Brokerage')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /accept matches/i }))

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/api/finance/10/lots/reconciliation/apply', {
        supersede: [{ keep_lot_id: 101, drop_lot_id: 202 }],
      })
    })
    expect(mockGet).toHaveBeenCalledTimes(2)
  })
})
