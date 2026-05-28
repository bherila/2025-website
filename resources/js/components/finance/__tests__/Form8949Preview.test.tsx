import { render, screen, waitFor } from '@testing-library/react'

import { fetchWrapper } from '@/fetchWrapper'
import type { TaxDocument } from '@/types/finance/tax-document'

import {
  classifyBox,
  computeForm8949,
  default as Form8949Preview,
  type Form8949Lot,
  form8949LotsFromTaxDocuments,
  formatForm8949Date,
} from '../Form8949Preview'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
  },
}))

const mockGet = fetchWrapper.get as jest.Mock

beforeEach(() => {
  mockGet.mockReset()
})

function mkLot(overrides: Partial<Form8949Lot> = {}): Form8949Lot {
  return {
    symbol: 'AAPL',
    description: '100 sh. AAPL',
    quantity: 100,
    purchase_date: '2023-03-15',
    cost_basis: 10000,
    sale_date: '2025-06-20',
    proceeds: 12000,
    realized_gain_loss: 2000,
    is_short_term: 0,
    lot_source: '1099b',
    // Default to covered to avoid the dev-only is_covered=null warning;
    // tests that exercise the null/non-covered code paths pass it explicitly.
    is_covered: true,
    ...overrides,
  }
}

describe('classifyBox', () => {
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('routes 1099b-sourced short-term lots to box A (covered defaulted)', () => {
    expect(classifyBox(mkLot({ is_short_term: 1, lot_source: '1099b', is_covered: true }))).toBe('A')
  })

  it('routes 1099b-sourced long-term lots to box D (covered defaulted)', () => {
    expect(classifyBox(mkLot({ is_short_term: 0, lot_source: '1099b', is_covered: true }))).toBe('D')
  })

  it('routes broker-statement short-term lots to box B', () => {
    expect(classifyBox(mkLot({ is_short_term: 1, lot_source: 'broker_statement' }))).toBe('B')
  })

  it('routes manual-entry short-term lots to box C (not on a 1099-B)', () => {
    expect(classifyBox(mkLot({ is_short_term: 1, lot_source: 'manual' }))).toBe('C')
  })

  it('routes manual-entry long-term lots to box F', () => {
    expect(classifyBox(mkLot({ is_short_term: 0, lot_source: 'manual' }))).toBe('F')
  })

  it('prefers an imported Form 8949 box when present', () => {
    expect(classifyBox(mkLot({ is_short_term: 1, lot_source: '1099b', form_8949_box: 'B' }))).toBe('B')
    expect(classifyBox(mkLot({ is_short_term: 0, lot_source: '1099b', form_8949_box: 'E' }))).toBe('E')
  })

  // Tests for canonical `source` field
  it('routes canonical broker_1099b source short-term + covered to box A', () => {
    expect(classifyBox(mkLot({ is_short_term: 1, source: 'broker_1099b', lot_source: null, is_covered: true }))).toBe('A')
  })

  it('routes canonical broker_1099b source long-term + covered to box D', () => {
    expect(classifyBox(mkLot({ is_short_term: 0, source: 'broker_1099b', lot_source: null, is_covered: true }))).toBe('D')
  })

  it('routes canonical broker_1099b source short-term + non-covered to box B', () => {
    expect(classifyBox(mkLot({ is_short_term: 1, source: 'broker_1099b', lot_source: null, is_covered: false }))).toBe('B')
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('routes canonical broker_1099b source long-term + non-covered to box E', () => {
    expect(classifyBox(mkLot({ is_short_term: 0, source: 'broker_1099b', lot_source: null, is_covered: false }))).toBe('E')
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('defaults broker_1099b with is_covered=null to A/D and emits a dev warning', () => {
    expect(classifyBox(mkLot({ is_short_term: 1, source: 'broker_1099b', lot_source: null, is_covered: null }))).toBe('A')
    expect(classifyBox(mkLot({ is_short_term: 0, source: 'broker_1099b', lot_source: null, is_covered: null }))).toBe('D')
    expect(warnSpy).toHaveBeenCalledTimes(2)
    expect(warnSpy.mock.calls[0]![0]).toMatch(/is_covered=null/)
  })

  it('routes canonical account_derived source short-term to box C', () => {
    expect(classifyBox(mkLot({ is_short_term: 1, source: 'account_derived', lot_source: null }))).toBe('C')
  })

  it('routes canonical account_derived source long-term to box F', () => {
    expect(classifyBox(mkLot({ is_short_term: 0, source: 'account_derived', lot_source: null }))).toBe('F')
  })

  it('routes canonical manual source short-term to box C', () => {
    expect(classifyBox(mkLot({ is_short_term: 1, source: 'manual', lot_source: null }))).toBe('C')
  })

  it('routes canonical manual source long-term to box F', () => {
    expect(classifyBox(mkLot({ is_short_term: 0, source: 'manual', lot_source: null }))).toBe('F')
  })

  it('routes canonical synthetic_adjustment source short-term to box C', () => {
    expect(classifyBox(mkLot({ is_short_term: 1, source: 'synthetic_adjustment', lot_source: null }))).toBe('C')
  })

  it('routes canonical synthetic_adjustment source long-term to box F', () => {
    expect(classifyBox(mkLot({ is_short_term: 0, source: 'synthetic_adjustment', lot_source: null }))).toBe('F')
  })

  it('canonical source takes priority over legacy lot_source', () => {
    expect(classifyBox(mkLot({ is_short_term: 1, source: 'broker_1099b', lot_source: 'manual', is_covered: true }))).toBe('A')
  })

  it('falls back to lot_source when source is absent', () => {
    expect(classifyBox(mkLot({ is_short_term: 1, source: null, lot_source: '1099b', is_covered: true }))).toBe('A')
    expect(classifyBox(mkLot({ is_short_term: 1, source: null, lot_source: 'broker_statement' }))).toBe('B')
  })

  it('respects is_covered on legacy lot_source=1099b rows', () => {
    expect(classifyBox(mkLot({ is_short_term: 1, source: null, lot_source: '1099b', is_covered: false }))).toBe('B')
    expect(classifyBox(mkLot({ is_short_term: 0, source: null, lot_source: '1099b', is_covered: false }))).toBe('E')
  })
})

describe('Form8949Preview', () => {
  it('loads closed lots from the normalized lot workspace endpoint with account scope', async () => {
    mockGet.mockResolvedValueOnce({
      data: [{
        id: 44,
        source: 'broker_1099b',
        lot_origin: '1099b_disposition',
        document_id: 12,
        statement_id: null,
        open_transaction_id: null,
        close_transaction_id: null,
        account_id: 7,
        account_name: 'Brokerage',
        account_number: 'Acct 1234',
        symbol: 'AAPL',
        cusip: null,
        description: 'Apple Inc.',
        quantity: '10.00000000',
        acquired_date: '2024-01-02',
        sold_date: '2025-02-03',
        basis: '900.0000',
        proceeds: '1000.0000',
        wash_sale_disallowed: '0.0000',
        realized_gain: '100.0000',
        is_short_term: false,
        form_8949_box: 'D',
        is_covered: true,
        accrued_market_discount: null,
        reconciliation_state: 'accepted_broker',
        link_id: 3,
        superseded_by: null,
        lot_source: '1099b',
        capabilities: ['view_source_document', 'open_reconciliation'],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }],
      summary: {
        total_proceeds: 1000,
        total_basis: 900,
        total_wash_sale: 0,
        total_realized_gain: 100,
        count: 1,
        counts_by_source: { broker_1099b: 1 },
        counts_by_state: { accepted_broker: 1 },
      },
      closed_years: [2025],
      meta: {
        current_page: 1,
        last_page: 1,
        per_page: 200,
        total: 1,
      },
    })

    render(<Form8949Preview selectedYear={2025} accountId={7} />)

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/finance/lot-workspace?status=closed&year=2025&per_page=200&page=1&account_ids=7'))
    expect(await screen.findByText('AAPL • 1234')).toBeInTheDocument()
  })
})

describe('computeForm8949', () => {
  it('returns empty sections when no lots are provided', () => {
    const data = computeForm8949([])
    expect(data.shortTerm).toHaveLength(0)
    expect(data.longTerm).toHaveLength(0)
    expect(data.partITotals.gain).toBe(0)
    expect(data.partIITotals.gain).toBe(0)
  })

  it('aggregates totals per section (proceeds, basis, gain)', () => {
    const lots: Form8949Lot[] = [
      mkLot({ is_short_term: 1, proceeds: 1000, cost_basis: 800, realized_gain_loss: 200 }),
      mkLot({ is_short_term: 1, proceeds: 500, cost_basis: 600, realized_gain_loss: -100 }),
    ]
    const data = computeForm8949(lots)
    expect(data.shortTerm).toHaveLength(1)
    const sec = data.shortTerm[0]!
    expect(sec.box).toBe('A')
    expect(sec.totals.proceeds).toBe(1500)
    expect(sec.totals.basis).toBe(1400)
    expect(sec.totals.gain).toBe(100)
    expect(data.partITotals.gain).toBe(100)
  })

  it('splits lots across boxes A/B/C and D/E/F by lot_source + holding period', () => {
    const lots: Form8949Lot[] = [
      mkLot({ is_short_term: 1, lot_source: '1099b' }), // A
      mkLot({ is_short_term: 1, lot_source: 'manual' }), // C
      mkLot({ is_short_term: 0, lot_source: '1099b' }), // D
      mkLot({ is_short_term: 0, lot_source: 'broker_statement' }), // E
    ]
    const data = computeForm8949(lots)
    expect(data.shortTerm.map((s) => s.box)).toEqual(['A', 'C'])
    expect(data.longTerm.map((s) => s.box)).toEqual(['D', 'E'])
  })

  it('marks rows with a wash-sale code W when proceeds − basis ≠ gain (i.e. adjustment applied)', () => {
    const lots: Form8949Lot[] = [
      mkLot({
        is_short_term: 1,
        proceeds: 1000,
        cost_basis: 1500,
        // realized_gain_loss is 0 instead of -500 → the engine disallowed the loss
        realized_gain_loss: 0,
      }),
    ]
    const data = computeForm8949(lots)
    const row = data.shortTerm[0]!.rows[0]!
    expect(row.code).toBe('W')
    // Adjustment = realized gain − unadjusted gain → 0 − (1000 − 1500) = 500.
    expect(row.adjustment).toBe(500)
  })

  it('uses explicit imported wash-sale amounts when 1099-B reports unadjusted gain/loss separately', () => {
    const data = computeForm8949([
      mkLot({
        is_short_term: 1,
        proceeds: 1000,
        cost_basis: 1500,
        realized_gain_loss: -500,
        wash_sale_disallowed: 200,
      }),
    ])

    const row = data.shortTerm[0]!.rows[0]!
    expect(row.code).toBe('W')
    expect(row.adjustment).toBe(200)
    expect(row.gain).toBe(-300)
  })

  it('leaves the code blank when proceeds − basis already equals gain (no adjustment)', () => {
    const lots: Form8949Lot[] = [
      mkLot({ is_short_term: 1, proceeds: 1000, cost_basis: 800, realized_gain_loss: 200 }),
    ]
    const data = computeForm8949(lots)
    const row = data.shortTerm[0]!.rows[0]!
    expect(row.code).toBe('')
    expect(row.adjustment).toBe(0)
  })
})

describe('formatForm8949Date', () => {
  it('formats date-only values compactly without constructing timezone-sensitive Dates', () => {
    expect(formatForm8949Date('2025-01-09T00:00:00.000000Z')).toBe('1/9/25')
    expect(formatForm8949Date('2025-12-31 13:45:00')).toBe('12/31/25')
    expect(formatForm8949Date('various')).toBe('Various')
  })
})

describe('form8949LotsFromTaxDocuments', () => {
  it('extracts broker 1099-B lots for the selected account with compact account last4 descriptions', () => {
    const doc = {
      id: 12,
      user_id: 1,
      tax_year: 2025,
      form_type: 'broker_1099',
      employment_entity_id: null,
      account_id: null,
      original_filename: 'broker.pdf',
      stored_filename: null,
      s3_path: null,
      mime_type: 'application/pdf',
      file_size_bytes: 1,
      file_hash: 'broker',
      is_reviewed: true,
      notes: null,
      human_file_size: '1 B',
      download_count: 0,
      genai_job_id: null,
      genai_status: 'parsed',
      parsed_data: [{
        account_identifier: '367 671847 209',
        account_name: 'E*TRADE from Morgan Stanley',
        form_type: '1099_b',
        tax_year: 2025,
        parsed_data: {
          transactions: [
            {
              symbol: 'NVDA',
              description: 'NVIDIA CORP',
              purchase_date: '2025-01-09T00:00:00Z',
              sale_date: '2025-02-14T00:00:00Z',
              proceeds: 1000,
              cost_basis: 1500,
              realized_gain_loss: -500,
              wash_sale_disallowed: 200,
              is_short_term: true,
              form_8949_box: 'A',
              is_covered: true,
            },
          ],
        },
      }],
      uploader: null,
      employment_entity: null,
      account: null,
      account_links: [{
        id: 10,
        tax_document_id: 12,
        account_id: 1,
        form_type: '1099_b',
        tax_year: 2025,
        ai_identifier: '367 671847 209',
        ai_account_name: 'E*TRADE from Morgan Stanley',
        is_reviewed: true,
        notes: null,
        account: { acct_id: 1, acct_name: 'ben e-trade', acct_number: null },
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    } satisfies TaxDocument

    const lots = form8949LotsFromTaxDocuments([doc], 1)
    const rows = computeForm8949(lots).shortTerm[0]!.rows

    expect(lots).toHaveLength(1)
    expect(lots[0]!.account_last4).toBe('7209')
    expect(form8949LotsFromTaxDocuments([doc], 2)).toHaveLength(0)
    expect(rows[0]!.description).toBe('NVDA • 7209')
  })
})
