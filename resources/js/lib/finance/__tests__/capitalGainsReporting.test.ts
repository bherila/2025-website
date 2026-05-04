import {
  buildCapitalGainsReportFrom1099ExportDocs,
  buildCapitalGainsReportFromTaxDocuments,
  defaultReportingMode,
  effectiveReportingMode,
  scheduleDSummaryEligibility,
} from '@/lib/finance/capitalGainsReporting'
import type { TaxDocument } from '@/types/finance/tax-document'
import type { Doc1099ExportEntry } from '@/types/finance/tax-return'

function makeTaxDocument(overrides: Partial<TaxDocument> = {}): TaxDocument {
  return {
    id: 100,
    user_id: 1,
    tax_year: 2025,
    form_type: '1099_b',
    employment_entity_id: null,
    account_id: 10,
    original_filename: '1099-b.pdf',
    stored_filename: null,
    s3_path: null,
    mime_type: 'application/pdf',
    file_size_bytes: 1,
    file_hash: 'hash',
    is_reviewed: true,
    misc_routing: null,
    notes: null,
    human_file_size: '1 B',
    download_count: 0,
    genai_job_id: null,
    genai_status: 'parsed',
    parsed_data: { transactions: [] },
    uploader: null,
    employment_entity: null,
    account: { acct_id: 10, acct_name: 'Taxable', acct_number: '99991234' },
    account_links: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('capital gains 1099-B reporting modes', () => {
  it('defaults covered Box A/D transactions to direct Schedule D summary', () => {
    const parsedData = {
      transactions: [
        { symbol: 'AAPL', proceeds: 1000, cost_basis: 900, realized_gain_loss: 100, is_short_term: true, is_covered: true, form_8949_box: 'A' },
        { symbol: 'MSFT', proceeds: 2000, cost_basis: 1500, realized_gain_loss: 500, is_short_term: false, is_covered: true, form_8949_box: 'D' },
      ],
    }

    expect(scheduleDSummaryEligibility(parsedData).eligible).toBe(true)
    expect(defaultReportingMode(parsedData)).toBe('schedule_d_summary')

    const report = buildCapitalGainsReportFromTaxDocuments([makeTaxDocument({ parsed_data: parsedData })])

    expect(report.scheduleDLineAmounts['1a']).toBe(100)
    expect(report.scheduleDLineAmounts['8a']).toBe(500)
    expect(report.form8949Lots).toHaveLength(0)
  })

  it('falls back to individual Form 8949 transactions when wash sale adjustments exist', () => {
    const parsedData = {
      transactions: [
        {
          symbol: 'NVDA',
          proceeds: 1000,
          cost_basis: 1500,
          realized_gain_loss: -500,
          wash_sale_disallowed: 200,
          is_short_term: true,
          is_covered: true,
          form_8949_box: 'A',
        },
      ],
    }

    expect(scheduleDSummaryEligibility(parsedData).eligible).toBe(false)
    expect(effectiveReportingMode(parsedData, 'schedule_d_summary')).toBe('form_8949_transactions')

    const report = buildCapitalGainsReportFromTaxDocuments([makeTaxDocument({ parsed_data: parsedData })])

    expect(report.scheduleDLineAmounts['1b']).toBe(-300)
    expect(report.form8949Lots).toHaveLength(1)
    expect(report.form8949Lots[0]!.wash_sale_disallowed).toBe(200)
  })

  it('builds one summary Form 8949 lot per box when summary mode is selected', () => {
    const parsedData = {
      transactions: [
        { symbol: 'NVDA', proceeds: 1000, cost_basis: 1500, realized_gain_loss: -500, wash_sale_disallowed: 200, is_short_term: true, is_covered: true, form_8949_box: 'A' },
        { symbol: 'TSLA', proceeds: 500, cost_basis: 300, realized_gain_loss: 200, is_short_term: true, is_covered: true, form_8949_box: 'A' },
      ],
    }
    const doc = makeTaxDocument({
      parsed_data: parsedData,
      account_links: [{
        id: 50,
        tax_document_id: 100,
        account_id: 10,
        form_type: '1099_b',
        tax_year: 2025,
        ai_identifier: null,
        ai_account_name: null,
        is_reviewed: true,
        notes: null,
        reporting_mode: 'form_8949_summary',
        account: { acct_id: 10, acct_name: 'Taxable', acct_number: '99991234' },
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }],
    })

    const report = buildCapitalGainsReportFromTaxDocuments([doc])

    expect(report.scheduleDLineAmounts['1b']).toBe(-100)
    expect(report.form8949Lots).toHaveLength(1)
    expect(report.form8949Lots[0]!.description).toBe('Taxable summary')
    expect(report.form8949Lots[0]!.adjustment_code).toBe('M,W')
    expect(report.form8949Lots[0]!.form_8949_box).toBe('A')
  })

  it('applies reporting modes per account on consolidated broker 1099 exports', () => {
    const exportDoc: Doc1099ExportEntry = {
      formType: 'broker_1099',
      payerName: 'Broker',
      parsedData: [
        {
          account_identifier: 'acct-1111',
          account_name: 'Wealthfront',
          form_type: '1099_b',
          tax_year: 2025,
          parsed_data: {
            transactions: [
              { symbol: 'VOO', proceeds: 1000, cost_basis: 900, realized_gain_loss: 100, is_short_term: true, is_covered: true, form_8949_box: 'A' },
            ],
          },
        },
        {
          account_identifier: 'acct-2222',
          account_name: 'E*TRADE',
          form_type: '1099_b',
          tax_year: 2025,
          parsed_data: {
            transactions: [
              { symbol: 'NVDA', proceeds: 1000, cost_basis: 1500, realized_gain_loss: -500, wash_sale_disallowed: 200, is_short_term: true, is_covered: true, form_8949_box: 'A' },
            ],
          },
        },
      ],
      accountLinks: [
        {
          id: 1,
          account_id: 101,
          form_type: '1099_b',
          reporting_mode: 'schedule_d_summary',
          ai_identifier: 'acct-1111',
          ai_account_name: 'Wealthfront',
          account: { acct_id: 101, acct_name: 'Wealthfront', acct_number: '1111' },
        },
        {
          id: 2,
          account_id: 202,
          form_type: '1099_b',
          reporting_mode: 'form_8949_transactions',
          ai_identifier: 'acct-2222',
          ai_account_name: 'E*TRADE',
          account: { acct_id: 202, acct_name: 'E*TRADE', acct_number: '2222' },
        },
      ],
    }

    const report = buildCapitalGainsReportFrom1099ExportDocs([exportDoc])

    expect(report.scheduleDLineAmounts['1a']).toBe(100)
    expect(report.scheduleDLineAmounts['1b']).toBe(-300)
    expect(report.form8949Lots).toHaveLength(1)
    expect(report.form8949Lots[0]!.account_last4).toBe('2222')
  })
})
