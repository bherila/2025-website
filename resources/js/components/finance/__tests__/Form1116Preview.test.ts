import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'

import { computeForm1116Lines } from '../Form1116Preview'

// ── Fixture helpers ────────────────────────────────────────────────────────────

function makeK1Data(overrides: Partial<FK1StructuredData> = {}): FK1StructuredData {
  return {
    schemaVersion: '2026.1',
    formType: 'K-1-1065',
    fields: {},
    codes: {},
    ...overrides,
  }
}

function makeK1Doc(data: FK1StructuredData, partnerName = 'Test Partnership'): TaxDocument {
  return {
    id: 1,
    user_id: 1,
    tax_year: 2024,
    form_type: 'k1',
    employment_entity_id: null,
    account_id: null,
    original_filename: null,
    stored_filename: null,
    s3_path: null,
    mime_type: 'application/pdf',
    file_size_bytes: 0,
    file_hash: 'abc',
    is_reviewed: true,
    notes: null,
    human_file_size: '0 B',
    download_count: 0,
    genai_job_id: null,
    genai_status: null,
    parsed_data: data,
    uploader: null,
    employment_entity: { id: 1, display_name: partnerName },
    account: null,
    account_links: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }
}

function makeBroker1099Doc(parsedData: Record<string, unknown>, isReviewed = true): TaxDocument {
  return {
    id: 2,
    user_id: 1,
    tax_year: 2024,
    form_type: 'broker_1099',
    employment_entity_id: null,
    account_id: null,
    original_filename: null,
    stored_filename: null,
    s3_path: null,
    mime_type: 'application/pdf',
    file_size_bytes: 0,
    file_hash: 'def',
    is_reviewed: isReviewed,
    notes: null,
    human_file_size: '0 B',
    download_count: 0,
    genai_job_id: null,
    genai_status: null,
    parsed_data: parsedData as never,
    uploader: null,
    employment_entity: { id: 2, display_name: 'Broker Co' },
    account: null,
    account_links: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }
}

function toolSection(sectionId: string, rows: Record<string, unknown>[]) {
  return { sectionId, title: sectionId, data: { rows } }
}

// ── computeForm1116Lines — sbpElections ───────────────────────────────────────

describe('computeForm1116Lines — sbpElections', () => {
  it('includes K-1 in sbpElections with active=false when col-f is non-zero and election is inactive', () => {
    const data = makeK1Data({
      codes: { '16': [{ code: 'I', value: '1000' }] },
      k3: {
        sections: [
          toolSection('part2_section1', [
            { country: 'DE', col_c_passive: 800, col_d_general: 0, col_f_sourced_by_partner: 250 },
          ]),
        ],
      },
      k3Elections: { sourcedByPartnerAsUSSource: false },
    })
    const result = computeForm1116Lines({ reviewedK1Docs: [makeK1Doc(data)], reviewed1099Docs: [] })
    expect(result.sbpElections).toHaveLength(1)
    expect(result.sbpElections![0]!.active).toBe(false)
    expect(result.sbpElections![0]!.sourcedByPartner).toBe(250)
  })

  it('includes K-1 in sbpElections with active=true when election is active', () => {
    const data = makeK1Data({
      codes: { '16': [{ code: 'I', value: '1000' }] },
      k3: {
        sections: [
          toolSection('part2_section1', [
            { country: 'DE', col_c_passive: 800, col_d_general: 0, col_f_sourced_by_partner: 300 },
          ]),
        ],
      },
      k3Elections: { sourcedByPartnerAsUSSource: true },
    })
    const result = computeForm1116Lines({ reviewedK1Docs: [makeK1Doc(data)], reviewed1099Docs: [] })
    expect(result.sbpElections).toHaveLength(1)
    expect(result.sbpElections![0]!.active).toBe(true)
    expect(result.sbpElections![0]!.sourcedByPartner).toBe(300)
  })

  it('produces empty sbpElections when col-f is zero', () => {
    const data = makeK1Data({
      codes: { '21': [{ code: '', value: '500' }] },
      k3: {
        sections: [
          toolSection('part2_section1', [
            { country: 'DE', col_c_passive: 500, col_d_general: 0, col_f_sourced_by_partner: 0 },
          ]),
        ],
      },
    })
    const result = computeForm1116Lines({ reviewedK1Docs: [makeK1Doc(data)], reviewed1099Docs: [] })
    expect(result.sbpElections ?? []).toHaveLength(0)
  })

  it('produces empty sbpElections when K-1 has no K-3 at all', () => {
    const data = makeK1Data({
      fields: { '21': { value: '400' } },
    })
    const result = computeForm1116Lines({ reviewedK1Docs: [makeK1Doc(data)], reviewed1099Docs: [] })
    expect(result.sbpElections ?? []).toHaveLength(0)
  })
})

// ── computeForm1116Lines — flat-dict broker_1099 ──────────────────────────────

describe('computeForm1116Lines — flat-dict broker_1099 foreign tax', () => {
  it('includes div_7_foreign_tax_paid from reviewed flat-dict broker_1099 in taxSources', () => {
    const doc = makeBroker1099Doc({
      payer_name: 'My Broker',
      div_7_foreign_tax_paid: 120,
    })
    const result = computeForm1116Lines({ reviewedK1Docs: [], reviewed1099Docs: [doc] })
    expect(result.totalForeignTaxes).toBe(120)
    const taxEntry = result.taxSources.find((s) => s.label.includes('My Broker'))
    expect(taxEntry).toBeDefined()
    expect(taxEntry!.amount).toBe(120)
  })

  it('estimates income source from div_7_foreign_tax_paid at 15% implied rate', () => {
    const doc = makeBroker1099Doc({ div_7_foreign_tax_paid: 150 })
    const result = computeForm1116Lines({ reviewedK1Docs: [], reviewed1099Docs: [doc] })
    expect(result.totalPassiveIncome).toBeCloseTo(1000)
  })

  it('skips unreviewed flat-dict broker_1099 docs', () => {
    const doc = makeBroker1099Doc({ div_7_foreign_tax_paid: 200 }, false)
    const result = computeForm1116Lines({ reviewedK1Docs: [], reviewed1099Docs: [doc] })
    expect(result.totalForeignTaxes).toBe(0)
  })

  it('skips array-format broker_1099 docs (handled by separate path)', () => {
    const arrayDoc = makeBroker1099Doc([{ form_type: '1099_div', parsed_data: { box7_foreign_tax: 500 } }] as never)
    const result = computeForm1116Lines({ reviewedK1Docs: [], reviewed1099Docs: [arrayDoc] })
    expect(result.totalForeignTaxes).toBe(0)
  })

  it('skips flat-dict broker_1099 with zero div_7_foreign_tax_paid', () => {
    const doc = makeBroker1099Doc({ div_7_foreign_tax_paid: 0 })
    const result = computeForm1116Lines({ reviewedK1Docs: [], reviewed1099Docs: [doc] })
    expect(result.totalForeignTaxes).toBe(0)
  })
})

// ── Issue 4: flat-dict broker_1099 INT Box 6 ──────────────────────────────────

describe('computeForm1116Lines — flat-dict broker_1099 INT foreign tax (Issue 4)', () => {
  it('includes int_6_foreign_tax_paid from reviewed flat-dict broker_1099 in taxSources', () => {
    const doc = makeBroker1099Doc({
      payer_name: 'My Broker INT',
      int_6_foreign_tax_paid: 85,
    })
    const result = computeForm1116Lines({ reviewedK1Docs: [], reviewed1099Docs: [doc] })
    expect(result.totalForeignTaxes).toBe(85)
    const taxEntry = result.taxSources.find((s) => s.label.includes('INT Box 6'))
    expect(taxEntry).toBeDefined()
    expect(taxEntry!.amount).toBe(85)
  })

  it('skips unreviewed flat-dict broker_1099 for int_6_foreign_tax_paid', () => {
    const doc = makeBroker1099Doc({ int_6_foreign_tax_paid: 200 }, false)
    const result = computeForm1116Lines({ reviewedK1Docs: [], reviewed1099Docs: [doc] })
    expect(result.totalForeignTaxes).toBe(0)
  })

  it('skips array-format broker_1099 for int_6_foreign_tax_paid', () => {
    const arrayDoc = makeBroker1099Doc([{ form_type: '1099_int', parsed_data: { box6_foreign_tax: 500 } }] as never)
    const result = computeForm1116Lines({ reviewedK1Docs: [], reviewed1099Docs: [arrayDoc] })
    expect(result.totalForeignTaxes).toBe(0)
  })

  it('includes both div_7 and int_6 when both present', () => {
    const doc = makeBroker1099Doc({
      payer_name: 'Full Broker',
      div_7_foreign_tax_paid: 120,
      int_6_foreign_tax_paid: 80,
    })
    const result = computeForm1116Lines({ reviewedK1Docs: [], reviewed1099Docs: [doc] })
    expect(result.totalForeignTaxes).toBe(200)
  })
})
