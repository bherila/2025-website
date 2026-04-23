import type { TaxDocument, TaxDocumentAccountLink } from '@/types/finance/tax-document'

import { getDocAmounts, getPayerName } from '../taxDocumentUtils'

function makeDoc(overrides: Partial<TaxDocument> = {}): TaxDocument {
  return {
    id: 1,
    tax_year: 2025,
    form_type: '1099_int',
    genai_status: 'parsed',
    is_reviewed: true,
    parsed_data: null,
    original_filename: null,
    account_id: null,
    account_links: [],
    ...overrides,
  } as TaxDocument
}

function makeLink(overrides: Partial<TaxDocumentAccountLink> = {}): TaxDocumentAccountLink {
  return {
    id: 100,
    tax_document_id: 1,
    account_id: 10,
    form_type: '1099_int',
    is_reviewed: true,
    ai_identifier: null,
    ...overrides,
  } as TaxDocumentAccountLink
}

describe('getPayerName', () => {
  it('returns null when parsed_data is missing', () => {
    expect(getPayerName(makeDoc())).toBeNull()
  })

  it('returns payer_name for a standard 1099', () => {
    const doc = makeDoc({ form_type: '1099_div', parsed_data: { payer_name: 'Acme Brokerage' } as never })
    expect(getPayerName(doc)).toBe('Acme Brokerage')
  })

  it('extracts the first line of K-1 field B as payer name', () => {
    const doc = makeDoc({
      form_type: 'k1',
      parsed_data: {
        schemaVersion: '2026.1',
        formType: 'K-1-1065',
        fields: { B: { value: 'Acme Partners LP\n123 Main St' } },
        codes: {},
      } as never,
    })
    expect(getPayerName(doc)).toBe('Acme Partners LP')
  })

  it('returns null for a multi-account array broker_1099 when no link is provided', () => {
    const doc = makeDoc({
      form_type: 'broker_1099',
      parsed_data: [
        {
          account_identifier: 'A1',
          account_name: 'Acct 1',
          form_type: '1099_div',
          tax_year: 2025,
          parsed_data: { payer_name: 'Fidelity' },
        },
      ] as never,
    })
    expect(getPayerName(doc)).toBeNull()
  })

  it('extracts payer_name from the matching entry in a multi-account array broker_1099', () => {
    const link = makeLink({ form_type: '1099_div', ai_identifier: 'A1' })
    const doc = makeDoc({
      form_type: 'broker_1099',
      account_links: [link],
      parsed_data: [
        {
          account_identifier: 'A1',
          account_name: 'Acct 1',
          form_type: '1099_div',
          tax_year: 2025,
          parsed_data: { payer_name: 'Fidelity' },
        },
      ] as never,
    })
    expect(getPayerName(doc, link)).toBe('Fidelity')
  })
})

describe('getDocAmounts', () => {
  it('returns all nulls when document is not reviewed', () => {
    const doc = makeDoc({ is_reviewed: false, parsed_data: { box1_interest: 100 } as never })
    expect(getDocAmounts(doc)).toEqual({ interest: null, dividend: null, other: null, foreignTax: null })
  })

  it('extracts box1_interest and box6_foreign_tax from a 1099-INT', () => {
    const doc = makeDoc({ form_type: '1099_int', parsed_data: { box1_interest: 250, box6_foreign_tax: 5 } as never })
    expect(getDocAmounts(doc)).toEqual({ interest: 250, dividend: null, other: null, foreignTax: 5 })
  })

  it('extracts box1a_ordinary and box7_foreign_tax from a 1099-DIV', () => {
    const doc = makeDoc({ form_type: '1099_div', parsed_data: { box1a_ordinary: 800, box7_foreign_tax: 12 } as never })
    expect(getDocAmounts(doc)).toEqual({ interest: null, dividend: 800, other: null, foreignTax: 12 })
  })

  it('extracts 1099-MISC income into the "other" column', () => {
    const doc = makeDoc({ form_type: '1099_misc', parsed_data: { box3_other_income: 400 } as never })
    expect(getDocAmounts(doc)).toEqual({ interest: null, dividend: null, other: 400, foreignTax: null })
  })

  it('ignores zero values (treated as "no data")', () => {
    const doc = makeDoc({ form_type: '1099_int', parsed_data: { box1_interest: 0 } as never })
    expect(getDocAmounts(doc).interest).toBeNull()
  })

  it('attributes broker_1099 amounts to the matching link form_type (1099-INT link)', () => {
    const doc = makeDoc({
      form_type: 'broker_1099',
      parsed_data: {
        int_1_interest_income: 150,
        int_6_foreign_tax_paid: 3,
        div_1a_total_ordinary: 900,
        div_7_foreign_tax_paid: 20,
      } as never,
    })
    const link = makeLink({ form_type: '1099_int' })
    expect(getDocAmounts(doc, link)).toEqual({ interest: 150, dividend: null, other: null, foreignTax: 3 })
  })

  it('attributes broker_1099 amounts to the matching link form_type (1099-DIV link)', () => {
    const doc = makeDoc({
      form_type: 'broker_1099',
      parsed_data: {
        int_1_interest_income: 150,
        int_6_foreign_tax_paid: 3,
        div_1a_total_ordinary: 900,
        div_7_foreign_tax_paid: 20,
      } as never,
    })
    const link = makeLink({ form_type: '1099_div' })
    expect(getDocAmounts(doc, link)).toEqual({ interest: null, dividend: 900, other: null, foreignTax: 20 })
  })

  it('returns no amounts for broker_1099 1099-B links (reported on Schedule D, not here)', () => {
    const doc = makeDoc({
      form_type: 'broker_1099',
      parsed_data: { int_1_interest_income: 150, div_1a_total_ordinary: 900 } as never,
    })
    const link = makeLink({ form_type: '1099_b' })
    expect(getDocAmounts(doc, link)).toEqual({ interest: null, dividend: null, other: null, foreignTax: null })
  })

  it('respects per-link is_reviewed (returns nulls when the link is unreviewed)', () => {
    const doc = makeDoc({
      form_type: 'broker_1099',
      is_reviewed: false,
      parsed_data: { int_1_interest_income: 150 } as never,
    })
    const link = makeLink({ form_type: '1099_int', is_reviewed: false })
    expect(getDocAmounts(doc, link)).toEqual({ interest: null, dividend: null, other: null, foreignTax: null })
  })

  it('extracts amounts from the matching entry in a multi-account array broker_1099 (1099-INT link)', () => {
    const link = makeLink({ form_type: '1099_int', ai_identifier: 'A1' })
    const doc = makeDoc({
      form_type: 'broker_1099',
      account_links: [link],
      parsed_data: [
        {
          account_identifier: 'A1',
          account_name: 'Acct 1',
          form_type: '1099_int',
          tax_year: 2025,
          parsed_data: { box1_interest: 150, box6_foreign_tax: 3 },
        },
      ] as never,
    })
    expect(getDocAmounts(doc, link)).toEqual({ interest: 150, dividend: null, other: null, foreignTax: 3 })
  })

  it('extracts amounts from the matching entry in a multi-account array broker_1099 (1099-DIV link)', () => {
    const divLink = makeLink({ id: 201, form_type: '1099_div', ai_identifier: 'A1' })
    const intLink = makeLink({ id: 200, form_type: '1099_int', ai_identifier: 'A1' })
    const doc = makeDoc({
      form_type: 'broker_1099',
      account_links: [intLink, divLink],
      parsed_data: [
        {
          account_identifier: 'A1',
          account_name: 'Acct 1',
          form_type: '1099_int',
          tax_year: 2025,
          parsed_data: { box1_interest: 150 },
        },
        {
          account_identifier: 'A1',
          account_name: 'Acct 1',
          form_type: '1099_div',
          tax_year: 2025,
          parsed_data: { box1a_ordinary: 900, box7_foreign_tax: 20 },
        },
      ] as never,
    })
    expect(getDocAmounts(doc, divLink)).toEqual({ interest: null, dividend: 900, other: null, foreignTax: 20 })
  })

  it('returns nulls for multi-account array broker_1099 when no link is provided', () => {
    const doc = makeDoc({
      form_type: 'broker_1099',
      parsed_data: [
        {
          account_identifier: 'A1',
          account_name: 'Acct 1',
          form_type: '1099_int',
          tax_year: 2025,
          parsed_data: { box1_interest: 150 },
        },
      ] as never,
    })
    expect(getDocAmounts(doc)).toEqual({ interest: null, dividend: null, other: null, foreignTax: null })
  })
})
