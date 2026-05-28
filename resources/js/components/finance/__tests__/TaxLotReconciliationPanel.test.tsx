import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type React from 'react'

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
    success: jest.fn(),
  },
}))

jest.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const mockGet = fetchWrapper.get as jest.Mock
const mockPostRaw = fetchWrapper.postRaw as jest.Mock

const linkCounts = {
  auto_matched: 0,
  needs_review: 1,
  accepted_broker: 0,
  accepted_account_override: 0,
  ignored_duplicate: 0,
  unlinked: 0,
  broker_only: 0,
  account_only: 0,
}

const summaryResponse = {
  user_id: 1,
  tax_year: 2025,
  summary: {
    document_count: 1,
    unresolved_account_links: 1,
    link_state_counts: linkCounts,
    documents_by_health: {
      ok: 0,
      drift: 1,
      blocked: 0,
    },
    problem_bucket_counts: {
      missing_accounts: 1,
      mismatches: 1,
      broker_only: 0,
      account_only: 0,
      duplicates: 0,
      auto_matched: 0,
    },
  },
  documents: [{
    tax_document_id: 12,
    document_id: 120,
    broker: 'Synthetic Broker',
    form_type: 'broker_1099',
    original_filename: 'broker.pdf',
    tax_year: 2025,
    health: 'drift',
    last_matched_at: '2026-05-10T17:00:00.000Z',
    unresolved_account_links: 1,
    link_state_counts: linkCounts,
    problem_bucket_counts: {
      missing_accounts: 1,
      mismatches: 1,
      broker_only: 0,
      account_only: 0,
      duplicates: 0,
      auto_matched: 0,
    },
    latest_match_run: {
      id: 9,
      document_id: 120,
      user_id: 1,
      status: 'succeeded',
      mode: 'preserve',
      started_at: '2026-05-10T17:00:00.000Z',
      finished_at: '2026-05-10T17:01:00.000Z',
      result_summary: { counts: { needs_review: 1 } },
      error: null,
      created_at: '2026-05-10T17:00:00.000Z',
      updated_at: '2026-05-10T17:01:00.000Z',
    },
  }],
  unresolved_account_links: [{
    id: 55,
    document_id: 120,
    tax_document_id: 12,
    account_id: null,
    form_type: '1099_b',
    tax_year: 2025,
    account_section_label: null,
    ai_identifier: '1234',
    ai_account_name: 'Unmatched Brokerage',
    is_reviewed: false,
    source_filename: 'broker.pdf',
    account: null,
  }],
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
    account_links: summaryResponse.unresolved_account_links,
  },
  summary: {
    total: 1,
    link_state_counts: linkCounts,
  },
  links: [{
    id: 77,
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
    broker_lot: {
      lot_id: 101,
      acct_id: 10,
      account_name: 'Brokerage',
      symbol: 'AAPL',
      description: 'Apple Inc.',
      cusip: '037833100',
      quantity: 10,
      purchase_date: '2024-01-02',
      sale_date: '2025-02-03',
      proceeds: 1250,
      cost_basis: 1000,
      wash_sale_disallowed: 0,
      realized_gain_loss: 250,
      is_short_term: false,
      form_8949_box: 'D',
      is_covered: true,
      source: 'broker_1099b',
      lot_source: '1099b',
      reconciliation_status: 'needs_review',
      superseded_by_lot_id: null,
    },
    account_lot: {
      lot_id: 202,
      acct_id: 10,
      account_name: 'Brokerage',
      symbol: 'AAPL',
      description: 'Apple Inc.',
      cusip: '037833100',
      quantity: 10,
      purchase_date: '2024-01-02',
      sale_date: '2025-02-03',
      proceeds: 1250,
      cost_basis: 1300,
      wash_sale_disallowed: 0,
      realized_gain_loss: -50,
      is_short_term: false,
      form_8949_box: 'D',
      is_covered: true,
      source: 'account_derived',
      lot_source: 'analyzer',
      reconciliation_status: 'needs_review',
      superseded_by_lot_id: null,
    },
  }],
  relink_candidates: [],
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('TaxLotReconciliationPanel', () => {
  it('loads the summary endpoint first and does not eagerly load bucket rows', async () => {
    mockGet.mockResolvedValue(summaryResponse)

    render(<TaxLotReconciliationPanel selectedYear={2025} />)

    await waitFor(() => expect(screen.getByText('Synthetic Broker')).toBeInTheDocument())
    expect(mockGet).toHaveBeenCalledWith('/api/finance/tax-years/2025/reconciliation-summary')
    expect(mockGet).not.toHaveBeenCalledWith('/api/finance/lots/reconciliation?tax_year=2025')
    expect(mockGet).not.toHaveBeenCalledWith('/api/finance/tax-documents/12/lot-reconciliation-links')
    expect(screen.getByText('Unmatched Brokerage')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /resolve account/i })).toBeInTheDocument()
  })

  it('lazy-loads document problem buckets', async () => {
    mockGet.mockImplementation((url: string) => Promise.resolve(
      url.includes('lot-reconciliation-links') ? linksResponse : summaryResponse,
    ))

    render(<TaxLotReconciliationPanel selectedYear={2025} />)

    await waitFor(() => expect(screen.getByText('Synthetic Broker')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /buckets/i }))

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/finance/tax-documents/12/lot-reconciliation-links')
    })
    expect(screen.getByText('Mismatches')).toBeInTheDocument()
    expect(screen.getByText('AAPL')).toBeInTheDocument()
    expect(screen.getByText('$300.00')).toBeInTheDocument()
  })

  it('exports all 1099-B lots from the summary view', async () => {
    mockGet.mockResolvedValue(summaryResponse)
    mockPostRaw.mockResolvedValue({
      ok: true,
      blob: jest.fn().mockResolvedValue(new Blob(['txf'])),
      headers: { get: jest.fn().mockReturnValue('attachment; filename="lots.txf"') },
    })
    Object.defineProperty(URL, 'createObjectURL', { writable: true, value: jest.fn(() => 'blob:txf') })
    Object.defineProperty(URL, 'revokeObjectURL', { writable: true, value: jest.fn() })

    render(<TaxLotReconciliationPanel selectedYear={2025} />)

    await waitFor(() => expect(screen.getByText('Synthetic Broker')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /export txf/i }))

    await waitFor(() => {
      expect(mockPostRaw).toHaveBeenCalledWith('/api/finance/lots/export-txf', {
        source: 'database',
        scope: 'all',
        tax_year: 2025,
      })
    })
  })
})
