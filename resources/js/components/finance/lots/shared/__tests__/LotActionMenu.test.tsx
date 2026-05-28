import { fireEvent, render, screen } from '@testing-library/react'

import type { NormalizedLot } from '@/types/finance/normalized-lot'

import { LotActionMenu } from '../LotActionMenu'

function mkLot(overrides: Partial<NormalizedLot> = {}): NormalizedLot {
  return {
    id: 1,
    source: 'broker_1099b',
    lot_origin: '1099b_disposition',
    document_id: 100,
    tax_document_id: 500,
    statement_id: null,
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
    form_8949_box: 'D',
    is_covered: true,
    accrued_market_discount: null,
    reconciliation_state: 'accepted_broker',
    link_id: 3,
    superseded_by: null,
    lot_source: '1099b',
    capabilities: ['view_source_document', 'open_reconciliation'],
    created_at: null,
    updated_at: null,
    ...overrides,
  }
}

describe('LotActionMenu', () => {
  it('builds the reconciliation link from tax_document_id, not the unified document_id', () => {
    const lot = mkLot({ document_id: 100, tax_document_id: 500 })
    render(<LotActionMenu lot={lot} />)

    fireEvent.click(screen.getByLabelText('Actions for lot 1'))

    const link = screen.getByText('Open reconciliation').closest('a') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/finance/tax-documents/500/lot-reconciliation')
    expect(link.getAttribute('href')).not.toContain('/100/')
  })

  it('disables reconciliation when tax_document_id is null even if document_id is present', () => {
    const lot = mkLot({
      document_id: 100,
      tax_document_id: null,
      capabilities: ['view_source_document'],
    })
    render(<LotActionMenu lot={lot} />)

    fireEvent.click(screen.getByLabelText('Actions for lot 1'))
    expect(screen.queryByText('Open reconciliation')).not.toBeInTheDocument()
  })

  it('points the statement link at the canonical /finance/account/{id}/statements path so query params survive the redirect', () => {
    const lot = mkLot({
      statement_id: 42,
      capabilities: ['view_statement'],
    })
    render(<LotActionMenu lot={lot} />)

    fireEvent.click(screen.getByLabelText('Actions for lot 1'))
    const link = screen.getByText('Open statement').closest('a') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/finance/account/7/statements?statement_id=42')
  })
})
