import { render, screen } from '@testing-library/react'

import type { NormalizedLot } from '@/types/finance/normalized-lot'

import { LotSourceDocumentLink } from '../LotSourceDocumentLink'

function mkLot(overrides: Partial<NormalizedLot> = {}): NormalizedLot {
  return {
    id: 1,
    source: 'account_derived',
    lot_origin: 'analyzer',
    document_id: null,
    tax_document_id: null,
    statement_id: 42,
    open_transaction_id: null,
    close_transaction_id: null,
    account_id: 7,
    account_name: 'Brokerage',
    account_number: '****1234',
    symbol: 'AAPL',
    cusip: null,
    description: 'Apple Inc.',
    quantity: '10',
    acquired_date: '2024-01-02',
    sold_date: '2025-02-03',
    basis: '900',
    proceeds: '1000',
    wash_sale_disallowed: '0',
    realized_gain: '100',
    is_short_term: false,
    form_8949_box: null,
    is_covered: null,
    accrued_market_discount: null,
    reconciliation_state: null,
    link_id: null,
    superseded_by: null,
    lot_source: null,
    capabilities: ['view_statement'],
    created_at: null,
    updated_at: null,
    ...overrides,
  }
}

describe('LotSourceDocumentLink', () => {
  it('uses the canonical /finance/account/{id}/statements path so statement_id survives the redirect', () => {
    const lot = mkLot({ statement_id: 42 })
    render(<LotSourceDocumentLink lot={lot} />)

    const link = screen.getByText('Statement #42').closest('a') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/finance/account/7/statements?statement_id=42')
    // The legacy redirect target /finance/{id}/statements strips the query
    // string, so guard against accidentally regressing to it.
    expect(link.getAttribute('href')).not.toMatch(/^\/finance\/7\/statements/)
  })
})
