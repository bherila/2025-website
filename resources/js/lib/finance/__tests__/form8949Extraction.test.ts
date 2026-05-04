import type { Form8949Lot } from '@/components/finance/Form8949Preview'
import type { TaxDocument } from '@/types/finance/tax-document'

import {
  accountLast4FromValue,
  form8949LotsFromTaxDocuments,
  form8949LotSignature,
  mergeForm8949Lots,
} from '../form8949Extraction'

function makeLot(overrides: Partial<Form8949Lot>): Form8949Lot {
  return {
    symbol: 'AAPL',
    description: null,
    quantity: null,
    purchase_date: '2025-01-01',
    sale_date: '2025-03-01',
    proceeds: 200,
    cost_basis: 150,
    realized_gain_loss: 50,
    is_short_term: true,
    lot_source: '1099b',
    form_8949_box: 'A',
    is_covered: true,
    accrued_market_discount: null,
    wash_sale_disallowed: null,
    tax_document_id: 100,
    acct_id: 7,
    account_name: null,
    account_last4: null,
    account_link_id: null,
    ...overrides,
  }
}

function makeDoc(overrides: Partial<TaxDocument> = {}): TaxDocument {
  return {
    id: 1,
    user_id: 1,
    tax_year: 2025,
    form_type: '1099_b',
    employment_entity_id: null,
    account_id: null,
    original_filename: 'doc.pdf',
    stored_filename: null,
    s3_path: null,
    mime_type: 'application/pdf',
    file_size_bytes: 1,
    file_hash: 'h',
    is_reviewed: true,
    notes: null,
    human_file_size: '1 B',
    download_count: 0,
    genai_job_id: null,
    genai_status: 'parsed',
    parsed_data: null,
    uploader: null,
    employment_entity: null,
    account: null,
    account_links: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as TaxDocument
}

describe('accountLast4FromValue', () => {
  it('extracts trailing four digits from messy account strings', () => {
    expect(accountLast4FromValue('Brokerage 1234')).toBe('1234')
    expect(accountLast4FromValue('367 671847 209')).toBe('7209')
    expect(accountLast4FromValue(123456789)).toBe('6789')
  })

  it('returns null when fewer than four digits are present', () => {
    expect(accountLast4FromValue('abc')).toBeNull()
    expect(accountLast4FromValue(null)).toBeNull()
    expect(accountLast4FromValue(undefined)).toBeNull()
    expect(accountLast4FromValue(12)).toBeNull()
  })
})

describe('form8949LotSignature', () => {
  it('produces a stable signature when tax_document_id is set', () => {
    const sig = form8949LotSignature({
      tax_document_id: 12,
      acct_id: 1,
      symbol: 'nvda',
      sale_date: '2025-02-14',
      proceeds: 1000.001, // float jitter rounds to cents
      cost_basis: 1500,
    })
    expect(sig).toBe('12|1|NVDA|2025-02-14|100000|150000')
  })

  it('returns null when tax_document_id is missing (no anchor for dedup)', () => {
    expect(form8949LotSignature({ tax_document_id: null, symbol: 'X', sale_date: '2025-01-01', proceeds: 1, cost_basis: 1 })).toBeNull()
    expect(form8949LotSignature({ symbol: 'X', sale_date: '2025-01-01', proceeds: 1, cost_basis: 1 })).toBeNull()
  })

  it('matches across float-jitter inputs but distinguishes real differences', () => {
    const a = form8949LotSignature({ tax_document_id: 1, symbol: 'NVDA', sale_date: '2025-02-14', proceeds: 1000, cost_basis: 1500 })
    const b = form8949LotSignature({ tax_document_id: 1, symbol: 'NVDA', sale_date: '2025-02-14', proceeds: 1000.0001, cost_basis: 1500 })
    const c = form8949LotSignature({ tax_document_id: 1, symbol: 'NVDA', sale_date: '2025-02-14', proceeds: 1000.01, cost_basis: 1500 })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})

describe('mergeForm8949Lots', () => {
  it('drops imported lots whose signature exactly matches a persisted lot', () => {
    const persisted = [makeLot({ symbol: 'AAPL', sale_date: '2025-03-01', proceeds: 200, cost_basis: 150 })]
    const imported = [
      makeLot({ symbol: 'AAPL', sale_date: '2025-03-01', proceeds: 200, cost_basis: 150 }),
      makeLot({ symbol: 'NVDA', sale_date: '2025-04-01', proceeds: 1000, cost_basis: 500 }),
    ]

    const merged = mergeForm8949Lots(persisted, imported)
    expect(merged).toHaveLength(2)
    expect(merged.map((l) => l.symbol)).toEqual(['AAPL', 'NVDA'])
  })

  it('keeps imported transactions for partially reconciled documents (Codex P1 regression)', () => {
    // Persisted lot represents the one share-level reconciliation that's been done;
    // the other two transactions from the same 1099-B should still appear in Form 8949.
    const persisted = [makeLot({ symbol: 'AAPL', sale_date: '2025-03-01', proceeds: 200, cost_basis: 150 })]
    const imported = [
      makeLot({ symbol: 'AAPL', sale_date: '2025-03-01', proceeds: 200, cost_basis: 150 }), // reconciled, drop
      makeLot({ symbol: 'NVDA', sale_date: '2025-04-01', proceeds: 1000, cost_basis: 500 }),
      makeLot({ symbol: 'TSLA', sale_date: '2025-05-01', proceeds: 800, cost_basis: 1200 }),
    ]

    const merged = mergeForm8949Lots(persisted, imported)
    expect(merged).toHaveLength(3)
    expect(merged.map((l) => l.symbol).sort()).toEqual(['AAPL', 'NVDA', 'TSLA'])
  })

  it('keeps imported lots without a tax_document_id since there is no anchor for dedup', () => {
    const persisted = [makeLot({ symbol: 'AAPL' })]
    const imported = [makeLot({ symbol: 'AAPL', tax_document_id: null })]
    expect(mergeForm8949Lots(persisted, imported)).toHaveLength(2)
  })
})

describe('form8949LotsFromTaxDocuments — account_links fallback', () => {
  it('matches a 1099-B doc to the requested account via account_links when doc.account_id is null', () => {
    const doc = makeDoc({
      id: 21,
      form_type: '1099_b',
      account_id: null,
      parsed_data: {
        account_number: '****1234',
        transactions: [{
          symbol: 'AAPL',
          purchase_date: '2025-01-01',
          sale_date: '2025-03-01',
          proceeds: 200,
          cost_basis: 150,
          realized_gain_loss: 50,
          is_short_term: true,
          form_8949_box: 'A',
          is_covered: true,
        }],
      },
      account: null,
      account_links: [{
        id: 99,
        tax_document_id: 21,
        account_id: 7,
        form_type: '1099_b',
        tax_year: 2025,
        ai_identifier: '****1234',
        ai_account_name: 'Schwab Brokerage',
        is_reviewed: true,
        notes: null,
        account: { acct_id: 7, acct_name: 'schwab taxable', acct_number: 'XX1234' },
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }],
    })

    const lotsForLinkedAccount = form8949LotsFromTaxDocuments([doc], 7)
    expect(lotsForLinkedAccount).toHaveLength(1)
    expect(lotsForLinkedAccount[0]!.acct_id).toBe(7)
    expect(lotsForLinkedAccount[0]!.account_link_id).toBe(99)
    expect(lotsForLinkedAccount[0]!.account_last4).toBe('1234')

    expect(form8949LotsFromTaxDocuments([doc], 99)).toHaveLength(0)
  })

  it('matches a broker_1099 entry to a link by account_name when ai_identifier is missing', () => {
    const doc = makeDoc({
      id: 31,
      form_type: 'broker_1099',
      parsed_data: [
        {
          account_identifier: null,
          account_name: 'E*TRADE from Morgan Stanley',
          form_type: '1099_b',
          tax_year: 2025,
          parsed_data: {
            transactions: [{
              symbol: 'TSLA',
              sale_date: '2025-04-01',
              proceeds: 500,
              cost_basis: 400,
              realized_gain_loss: 100,
              is_short_term: true,
              form_8949_box: 'A',
              is_covered: true,
            }],
          },
        },
      ] as never,
      account_links: [{
        id: 41,
        tax_document_id: 31,
        account_id: 9,
        form_type: '1099_b',
        tax_year: 2025,
        ai_identifier: null,
        ai_account_name: 'E*TRADE from Morgan Stanley',
        is_reviewed: true,
        notes: null,
        account: { acct_id: 9, acct_name: 'etrade', acct_number: '5550009999' },
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }],
    })

    const lots = form8949LotsFromTaxDocuments([doc], 9)
    expect(lots).toHaveLength(1)
    expect(lots[0]!.account_link_id).toBe(41)
    expect(lots[0]!.account_last4).toBe('9999')
  })
})
