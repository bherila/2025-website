import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { fetchWrapper } from '@/fetchWrapper'

import TaxLotReconciliationPanel from '../TaxLotReconciliationPanel'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    post: jest.fn(),
    postRaw: jest.fn(),
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
const mockPostRaw = fetchWrapper.postRaw as jest.Mock

function lot(id: number, overrides: Record<string, unknown> = {}) {
  return {
    lot_id: id,
    acct_id: 10,
    symbol: 'AAPL',
    description: 'Apple Inc.',
    cusip: '037833100',
    quantity: 10,
    purchase_date: '2024-01-02',
    sale_date: '2025-02-03',
    proceeds: 1250,
    cost_basis: 1000,
    realized_gain_loss: 250,
    is_short_term: false,
    lot_source: '1099b',
    form_8949_box: 'D',
    is_covered: true,
    accrued_market_discount: 0,
    wash_sale_disallowed: 0,
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
    matched_open_transactions: 1,
    matched_close_transactions: 1,
    missing_open_transactions: 0,
    missing_close_transactions: 0,
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
        matched_open_transactions: 1,
        matched_close_transactions: 1,
        missing_open_transactions: 0,
        missing_close_transactions: 0,
      },
      rows: [
        {
          status: 'matched',
          reported_lot: lot(101),
          account_lot: lot(202, { lot_source: 'analyzer', tax_document_id: null }),
          candidate_lots: [lot(202, { lot_source: 'analyzer', tax_document_id: null })],
          transaction_match: {
            opening: {
              status: 'matched',
              transaction: {
                t_id: 301,
                t_date: '2024-01-02',
                t_type: 'Buy',
                t_amt: -1000,
                t_symbol: 'AAPL',
                t_cusip: '037833100',
                t_qty: 10,
                t_price: 100,
                t_description: 'BUY AAPL',
                t_source: 'import',
              },
            },
            closing: {
              status: 'matched',
              transaction: {
                t_id: 302,
                t_date: '2025-02-03',
                t_type: 'Sell',
                t_amt: 1250,
                t_symbol: 'AAPL',
                t_cusip: '037833100',
                t_qty: -10,
                t_price: 125,
                t_description: 'SELL AAPL',
                t_source: 'import',
              },
            },
          },
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
    expect(screen.getByRole('button', { name: /export txf/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /export olt xlsx/i })).toBeInTheDocument()
  })

  it('exports all 1099-B lots from the dock reconciliation view', async () => {
    mockGet.mockResolvedValue(response)
    mockPostRaw.mockResolvedValue({
      ok: true,
      blob: jest.fn().mockResolvedValue(new Blob(['txf'])),
      headers: { get: jest.fn().mockReturnValue('attachment; filename="lots.txf"') },
    })
    Object.defineProperty(URL, 'createObjectURL', { writable: true, value: jest.fn(() => 'blob:txf') })
    Object.defineProperty(URL, 'revokeObjectURL', { writable: true, value: jest.fn() })

    render(<TaxLotReconciliationPanel selectedYear={2025} />)

    await waitFor(() => expect(screen.getByText('Brokerage')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /export txf/i }))

    await waitFor(() => {
      expect(mockPostRaw).toHaveBeenCalledWith('/api/finance/lots/export-txf', {
        source: 'database',
        scope: 'all',
        tax_year: 2025,
      })
    })

    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:txf')
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

  it('renders applied state for rows that were already superseded', async () => {
    mockGet.mockResolvedValue({
      ...response,
      accounts: [{
        ...response.accounts[0]!,
        rows: [{
          ...response.accounts[0]!.rows[0]!,
          account_lot: lot(202, {
            lot_source: 'analyzer',
            superseded_by_lot_id: 101,
            reconciliation_status: 'accepted',
          }),
          candidate_lots: [lot(202, {
            lot_source: 'analyzer',
            superseded_by_lot_id: 101,
            reconciliation_status: 'accepted',
          })],
        }],
      }],
    })

    render(<TaxLotReconciliationPanel selectedYear={2025} />)

    await waitFor(() => expect(screen.getByText('Applied')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /use 1099-b/i })).not.toBeInTheDocument()
  })

  it('renders accepted state for accepted account-only lots', async () => {
    mockGet.mockResolvedValue({
      ...response,
      accounts: [{
        ...response.accounts[0]!,
        rows: [{
          status: 'missing_1099b',
          reported_lot: null,
          account_lot: lot(303, {
            lot_source: 'analyzer',
            reconciliation_status: 'accepted',
          }),
          candidate_lots: [lot(303, {
            lot_source: 'analyzer',
            reconciliation_status: 'accepted',
          })],
          transaction_match: null,
          deltas: {
            quantity: null,
            proceeds: null,
            cost_basis: null,
            realized_gain_loss: null,
            sale_date_days: null,
          },
        }],
      }],
    })

    render(<TaxLotReconciliationPanel selectedYear={2025} />)

    await waitFor(() => expect(screen.getAllByText('Accepted').length).toBeGreaterThanOrEqual(2))
    expect(screen.queryByRole('button', { name: /^accept$/i })).not.toBeInTheDocument()
  })
})
