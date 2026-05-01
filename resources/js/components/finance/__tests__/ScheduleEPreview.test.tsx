import { render, screen } from '@testing-library/react'
import React from 'react'

import type { TaxDocument } from '@/types/finance/tax-document'

import ScheduleEPreview, { computeScheduleELines } from '../ScheduleEPreview'

function makeMiscDoc(overrides: Partial<TaxDocument> = {}): TaxDocument {
  return {
    id: 1,
    user_id: 1,
    tax_year: 2025,
    form_type: '1099_misc',
    employment_entity_id: null,
    account_id: null,
    original_filename: 'misc.pdf',
    stored_filename: null,
    s3_path: null,
    mime_type: 'application/pdf',
    file_size_bytes: 1,
    file_hash: 'misc',
    is_reviewed: true,
    misc_routing: null,
    notes: null,
    human_file_size: '1 B',
    download_count: 0,
    genai_job_id: null,
    genai_status: 'parsed',
    parsed_data: { payer_name: 'Tenant Co', box1_rents: 1500 },
    uploader: null,
    employment_entity: null,
    account: null,
    account_links: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('ScheduleEPreview', () => {
  it('renders 1099-MISC rental income before any K-1 rows', () => {
    render(<ScheduleEPreview reviewedK1Docs={[]} reviewed1099Docs={[makeMiscDoc()]} selectedYear={2025} />)

    expect(screen.getByText('Part I — 1099-MISC Rental & Royalty Income')).toBeInTheDocument()
    expect(screen.getByText('Tenant Co — 1099-MISC')).toBeInTheDocument()
    expect(screen.getByText('1099-MISC rental & royalty income subtotal')).toBeInTheDocument()
    expect(screen.getAllByText('$1,500')).not.toHaveLength(0)
  })

  it('adds 1099-MISC rental income into the Schedule E grand total', () => {
    const lines = computeScheduleELines([], [makeMiscDoc({ parsed_data: { payer_name: 'Tenant Co', box2_royalties: 900 } })])

    expect(lines.miscIncomeTotal).toBe(900)
    expect(lines.grandTotal).toBe(900)
  })

  it('routes Box 11ZZ ordinary income/loss and Box 13ZZ deductions to Part II nonpassive', () => {
    const k1Doc: TaxDocument = {
      id: 99,
      user_id: 1,
      tax_year: 2025,
      form_type: 'k1',
      employment_entity_id: null,
      account_id: null,
      original_filename: 'aqr-delphi.pdf',
      stored_filename: null,
      s3_path: null,
      mime_type: 'application/pdf',
      file_size_bytes: 1,
      file_hash: 'aqr',
      is_reviewed: true,
      misc_routing: null,
      notes: null,
      human_file_size: '1 B',
      download_count: 0,
      genai_job_id: null,
      genai_status: 'parsed',
      parsed_data: {
        schemaVersion: '2026.1',
        formType: '1065',
        fields: { B: { value: 'AQR TA DELPHI PLUS FUND, LLC' } },
        codes: {
          '11': [
            { code: ' zz ', value: '(23,167)', notes: 'Section 988 FX loss' },
            { code: 'ZZ', value: '-54,237', notes: 'Swap loss' },
            { code: 'ZZ', value: '3,198', notes: 'PFIC MTM income' },
          ],
          '13': [
            { code: 'zz', value: '8,893', notes: 'Trader deductions' },
            { code: 'ZZ', value: '(258)', notes: 'Administrative expenses' },
          ],
        },
      },
      uploader: null,
      employment_entity: null,
      account: null,
      account_links: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }

    const lines = computeScheduleELines([k1Doc], [])

    expect(lines.totalBox11ZZ).toBeCloseTo(-74206)
    expect(lines.totalBox13ZZ).toBeCloseTo(9151)
    expect(lines.totalNonpassive).toBeCloseTo(-83357)
    expect(lines.grandTotal).toBeCloseTo(-83357)
    expect(lines.totalTraderNii).toBeCloseTo(-83357)
  })

  it('subtracts only the Form 4952-allowed Box 13H amount when routed to Schedule E', () => {
    const k1Doc: TaxDocument = {
      id: 101,
      user_id: 1,
      tax_year: 2025,
      form_type: 'k1',
      employment_entity_id: null,
      account_id: null,
      original_filename: 'aqr-delphi.pdf',
      stored_filename: null,
      s3_path: null,
      mime_type: 'application/pdf',
      file_size_bytes: 1,
      file_hash: 'aqr-13h',
      is_reviewed: true,
      misc_routing: null,
      notes: null,
      human_file_size: '1 B',
      download_count: 0,
      genai_job_id: null,
      genai_status: 'parsed',
      parsed_data: {
        schemaVersion: '2026.1',
        formType: '1065',
        fields: { B: { value: 'AQR TA DELPHI PLUS FUND, LLC' } },
        codes: {
          '13': [
            { code: 'H', value: '10000', notes: 'Investment interest from trading activities. Deductible portion flows to Schedule E Part II as nonpassive.' },
          ],
        },
      },
      uploader: null,
      employment_entity: null,
      account: null,
      account_links: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }

    const lines = computeScheduleELines([k1Doc], [], {
      invIntSources: [{
        label: 'AQR — Box 13H',
        amount: -10000,
        docId: 101,
        box: '13',
        code: 'H',
        scheduleEDeductionEligible: true,
        allowedAmount: 2500,
      }],
      totalInvIntExpense: 10000,
      scheduleEDeductibleInvestmentInterestExpense: 2500,
      invExpSources: [],
      totalInvExp: 0,
      niiBefore: 2500,
      totalQualDiv: 0,
      deductibleInvestmentInterestExpense: 2500,
      disallowedCarryforward: 7500,
    })

    expect(lines.totalBox13HInvestmentInterestDeduction).toBe(2500)
    expect(lines.totalNonpassive).toBe(-2500)
    expect(lines.totalTraderNii).toBe(-2500)
  })
})
