import type { TaxReturn1040 } from '@/types/finance/tax-return'

import { buildTaxWorkbook } from '../buildTaxWorkbook'

function makeTaxReturn(): TaxReturn1040 {
  return {
    year: 2025,
    k1Docs: [{
      entityName: 'Example Partner',
      ein: '12-3456789',
      fields: {
        A: '12-3456789',
        B: 'Example Partner\nAddress',
        F: 'Taxpayer Name',
        '1': 1000,
        '5': 250,
        '21': 40,
      },
      codes: {
        '13': [
          { code: 'K', value: '30' },
          { code: 'ZZ', value: '15' },
        ],
        '14': [
          { code: 'A', value: '150' },
          { code: 'Z', value: '10' },
        ],
        '17': [
          { code: 'E', value: '20' },
        ],
        '20': [
          { code: 'A', value: '5' },
        ],
      },
      k3Sections: [
        {
          sectionId: 'part2_section1',
          title: 'Part II Section 1',
          data: {
            rows: [
              { line: '6', country: 'DE', col_a_us_source: 10, col_c_passive: 20, col_f_sourced_by_partner: 5, col_g_total: 35 },
            ],
          },
        },
      ],
    }],
    k3Docs: [{
      entityName: 'Example Partner',
      sections: [
        {
          sectionId: 'part3_section4',
          title: 'Part III Section 4',
          data: {
            rows: [
              { line: '1', country: 'DE', amount_usd: 40 },
            ],
          },
        },
      ],
    }],
  }
}

describe('buildTaxWorkbook — K-1/K-3 sheets', () => {
  it('builds worksheet-style per-K1 sections and routing statuses', () => {
    const workbook = buildTaxWorkbook(makeTaxReturn())
    const k1Sheet = workbook.sheets.find((sheet) => sheet.name.startsWith('K-1'))
    expect(k1Sheet).toBeDefined()

    const descriptions = (k1Sheet?.rows ?? []).map((row) => row.description)
    expect(descriptions).toContain('1. Partner Info')
    expect(descriptions).toContain('2. Part III — Raw K-1 Values (boxes 1–21)')
    expect(descriptions).toContain('3. Part III — Coded Items')
    expect(descriptions).toContain('4. K-3 Summary')
    expect(descriptions).toContain('5. Destination Summary — Where each line flows')
    expect(descriptions).toContain('6. Cross-references')

    expect(k1Sheet?.rows.some((row) => row.description.includes('Box 14 A'))).toBe(true)
    expect(k1Sheet?.rows.some((row) => row.note?.includes('Schedule SE'))).toBe(true)
    expect(k1Sheet?.rows.some((row) => row.note?.includes('Form 6251'))).toBe(true)
    expect(k1Sheet?.rows.some((row) => row.note?.includes('Status: Suspended'))).toBe(true)
    expect(k1Sheet?.rows.some((row) => row.note?.includes('Status: User action'))).toBe(true)
    expect(k1Sheet?.rows.some((row) => row.note?.includes('Status: Unrouted'))).toBe(true)
  })

  it('renders structured K-3 sheet rows instead of JSON dumps', () => {
    const workbook = buildTaxWorkbook(makeTaxReturn())
    const k3Sheet = workbook.sheets.find((sheet) => sheet.name.startsWith('K-3'))
    expect(k3Sheet).toBeDefined()
    expect(k3Sheet?.rows.some((row) => (row.note ?? '').includes('{"'))).toBe(false)
    expect(k3Sheet?.rows.some((row) => row.description.includes('part3_section4'))).toBe(true)
    expect(k3Sheet?.rows.some((row) => (row.note ?? '').includes('Country: DE'))).toBe(true)
  })
})
