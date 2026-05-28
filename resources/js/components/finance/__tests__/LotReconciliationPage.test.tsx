import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type React from 'react'

import { fetchWrapper } from '@/fetchWrapper'
import type { LotReconciliationLink, LotReconciliationLot } from '@/types/finance/document-lot-reconciliation'

import LotReconciliationHealthWidget from '../LotReconciliationHealthWidget'
import LotReconciliationPage, { ReconciliationLotRow } from '../LotReconciliationPage'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    post: jest.fn(),
  },
}))

jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}))

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    disabled,
    onClick,
  }: {
    children: React.ReactNode
    disabled?: boolean
    onClick?: () => void
  }) => <button disabled={disabled} onClick={onClick}>{children}</button>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const mockedFetchWrapper = fetchWrapper as jest.Mocked<typeof fetchWrapper>

const lot = {
  lot_id: 101,
  acct_id: 10,
  account_name: 'Brokerage',
  symbol: 'AAPL',
  description: 'Apple Inc.',
  cusip: '037833100',
  quantity: 10,
  purchase_date: '2024-01-02',
  sale_date: '2025-03-15',
  proceeds: 15000,
  cost_basis: 14200,
  wash_sale_disallowed: 25,
  realized_gain_loss: 825,
  is_short_term: false,
  form_8949_box: 'D',
  is_covered: true,
  source: 'broker_1099b',
  lot_source: '1099b',
  reconciliation_status: 'needs_review',
  superseded_by_lot_id: null,
} satisfies LotReconciliationLot

const accountLot = {
  ...lot,
  lot_id: 202,
  source: 'account_derived',
  lot_source: 'analyzer',
  cost_basis: 14500,
  realized_gain_loss: 525,
} satisfies LotReconciliationLot

const link = {
  id: 55,
  tax_document_id: 12,
  broker_lot_id: 101,
  account_lot_id: 202,
  state: 'needs_review',
  match_reason: {
    reason_code: 'basis_delta',
    score: 0.91,
    deltas: {
      proceeds: 0,
      basis: 300,
      wash: 0,
      qty: 0,
      date_days: 0,
    },
    notes: null,
  },
  accepted_by_user_id: null,
  accepted_at: null,
  broker_lot: lot,
  account_lot: accountLot,
} satisfies LotReconciliationLink

const counts = {
  auto_matched: 0,
  needs_review: 1,
  accepted_broker: 0,
  accepted_account_override: 0,
  ignored_duplicate: 0,
  unlinked: 0,
  broker_only: 0,
  account_only: 0,
}

const reportResponse = {
  tax_document_id: 12,
  broker: 'Synthetic Broker',
  tax_year: 2025,
  form_type: 'broker_1099',
  last_matched_at: '2026-05-10T17:00:00.000Z',
  status: 'ok',
  dashboard_status: 'needs_review',
  link_state_counts: counts,
  summary: {
    status: 'ok',
    entry_count: 1,
    expected_lot_count: 1,
    broker_lot_count: 1,
    diagnostics_count: 0,
    max_delta: 300,
  },
  diagnostics: [],
  entries: [],
}

const linksResponse = {
  document: {
    id: 12,
    document_id: 120,
    broker: 'Synthetic Broker',
    tax_year: 2025,
    form_type: 'broker_1099',
    original_filename: 'broker.pdf',
    last_matched_at: '2026-05-10T17:00:00.000Z',
    account_links: [],
  },
  summary: {
    total: 1,
    link_state_counts: counts,
  },
  links: [link],
  relink_candidates: [accountLot],
}

const yearResponse = {
  user_id: 1,
  tax_year: 2025,
  summary: {
    status: 'warning',
    dashboard_status: 'needs_review',
    document_count: 1,
    documents_by_status: {
      in_sync: 0,
      needs_review: 1,
      drift: 0,
    },
    diagnostics_count: 0,
    max_delta: 300,
  },
  documents: [{
    tax_document_id: 12,
    broker: 'Synthetic Broker',
    tax_year: 2025,
    form_type: 'broker_1099',
    last_matched_at: '2026-05-10T17:00:00.000Z',
    status: 'ok',
    dashboard_status: 'needs_review',
    link_state_counts: counts,
    summary: {
      diagnostics_count: 0,
      max_delta: 300,
    },
  }],
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('LotReconciliationPage', () => {
  it('renders lot rows with state, Form 8949, and wash-sale badges', () => {
    render(
      <ReconciliationLotRow
        link={link}
        candidates={[accountLot]}
        onAction={jest.fn()}
        onRelink={jest.fn()}
      />,
    )

    expect(screen.getByText('Needs review')).toBeInTheDocument()
    expect(screen.getAllByText('D').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Wash: unknown').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/basis_delta/)).toBeInTheDocument()
  })

  it('posts the expected endpoint for an accept-broker row action', async () => {
    mockedFetchWrapper.get.mockImplementation((url: string) => Promise.resolve(
      url.includes('lot-reconciliation-links') ? linksResponse : reportResponse,
    ))
    mockedFetchWrapper.post.mockResolvedValue({})

    render(<LotReconciliationPage taxDocumentId={12} />)

    await waitFor(() => expect(screen.getByText(/Synthetic Broker/)).toBeInTheDocument())
    expect(screen.getByText(/Matcher last ran/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /accept broker/i }))

    await waitFor(() => {
      expect(mockedFetchWrapper.post).toHaveBeenCalledWith('/api/finance/lot-reconciliation-links/55/accept-broker', {})
    })
  })
})

describe('LotReconciliationHealthWidget', () => {
  it('renders document health and re-runs all reviewed documents', async () => {
    mockedFetchWrapper.get.mockResolvedValue(yearResponse)
    mockedFetchWrapper.post.mockResolvedValue({})

    render(<LotReconciliationHealthWidget selectedYear={2025} />)

    await waitFor(() => expect(screen.getByText('Synthetic Broker')).toBeInTheDocument())
    expect(screen.getByText('Needs review')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /re-run all/i }))

    await waitFor(() => {
      expect(mockedFetchWrapper.post).toHaveBeenCalledWith('/api/finance/tax-years/2025/lots-match', {})
    })
  })
})
