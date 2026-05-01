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
          { code: 'F', value: '15' },
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
    expect(k1Sheet?.rows.some((row) => row.description === 'Schedule SE sheet')).toBe(true)
  })

  it('multi-destination rows carry amount only on the first destination', () => {
    // Box 20Z routes to both Form 8995 AND Form 1040 Line 13 (two >> markers)
    const workbook = buildTaxWorkbook({
      year: 2025,
      k1Docs: [{
        entityName: 'Test LP',
        fields: {},
        codes: { '20': [{ code: 'Z', value: '50000' }] },
      }],
    })
    const k1Sheet = workbook.sheets.find((s) => s.name.startsWith('K-1'))
    const destSection = k1Sheet?.rows.findIndex((r) => r.description === '5. Destination Summary — Where each line flows') ?? -1
    const destRows = k1Sheet?.rows.slice(destSection + 1).filter((r) => r.description === 'Box 20Z') ?? []
    expect(destRows.length).toBe(2)
    expect(destRows[0]?.amount).toBe(50000)
    expect(destRows[1]?.amount).toBeUndefined()
  })

  it('renders passiveActivities as Box 11 S section in K-1 sheet', () => {
    const workbook = buildTaxWorkbook({
      year: 2025,
      k1Docs: [{
        entityName: 'Multi-Activity Fund',
        ein: '85-0000000',
        fields: {},
        codes: {},
        passiveActivities: [
          { name: 'Section 1256 activity', currentIncome: 32_545, currentLoss: 0 },
          { name: 'Other passive activity', currentIncome: 0, currentLoss: -38_825 },
        ],
      }],
    })
    const k1Sheet = workbook.sheets.find((s) => s.name.startsWith('K-1'))
    expect(k1Sheet).toBeDefined()
    const descriptions = (k1Sheet?.rows ?? []).map((r) => r.description)
    expect(descriptions.some((d) => d.includes('Box 11 S'))).toBe(true)
    expect(descriptions.some((d) => d.includes('Section 1256 activity'))).toBe(true)
    expect(descriptions.some((d) => d.includes('Other passive activity'))).toBe(true)
    const incomeRow = k1Sheet?.rows.find((r) => r.description.includes('Section 1256 activity'))
    expect(incomeRow?.amount).toBe(32_545)
    const lossRow = k1Sheet?.rows.find((r) => r.description.includes('Other passive activity'))
    expect(lossRow?.amount).toBe(-38_825)
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

describe('buildTaxWorkbook — Form 1040 sheet formulas', () => {
  function makeForm1040Return(overrides: Partial<TaxReturn1040> = {}): TaxReturn1040 {
    return {
      year: 2025,
      scheduleC: { total: 5000, byQuarter: { q1: 0, q2: 0, q3: 0, q4: 0 } },
      scheduleE: { grandTotal: 1200, totalPassive: 0, totalNonpassive: 1200 },
      schedule1: {
        partI: {
          line1a_taxableRefunds: null, line2a_alimonyReceived: null,
          line3_business: 5000, line4_otherGains: null,
          line5_rentalPartnerships: 1200, line6_farmIncome: null,
          line7_unemploymentCompensation: null,
          line8b_gambling: null, line8h_juryDuty: null, line8i_prizes: null,
          line8z_otherIncome: 750,
          line9_totalOther: 750, line10_total: 6950,
        },
        partII: {
          line13_hsaDeduction: null, line15_deductibleSeTax: 706,
          line17_selfEmployedHealthInsurance: null, line20_iraDeduction: null,
          line21_studentLoanInterest: null, line26_totalAdjustments: 706,
        },
      },
      form1040: [
        { line: '1a', label: 'Wages', value: 100_000 },
        { line: '2b', label: 'Taxable interest', value: 0 },
        { line: '3b', label: 'Ordinary dividends', value: 0 },
        { line: '7', label: 'Capital gain or loss', value: 0 },
        { line: '8', label: 'Schedule 1', value: 6_950 }, // 5000 C + 1200 E + 750 other
        { line: '9', label: 'Total income', value: 106_950 },
        { line: '10', label: 'Adjustments', value: 706 },
        { line: '11', label: 'AGI', value: 106_244 },
      ],
      ...overrides,
    }
  }

  function getForm1040Row(workbook: ReturnType<typeof buildTaxWorkbook>, line: string) {
    const sheet = workbook.sheets.find((s) => s.name === 'Form 1040')
    expect(sheet).toBeDefined()
    return sheet!.rows.find((r) => r.line === line)
  }

  it('line 8 formula includes the Schedule 1 other-income residual when present (#306)', () => {
    const workbook = buildTaxWorkbook(makeForm1040Return())
    const line8 = getForm1040Row(workbook, '8')
    expect(line8?.amount).toBe(6_950)
    // 6950 amount minus (5000 C + 1200 E) = 750 residual added as a literal addend
    expect(line8?.formula).toContain('+750')
    expect(line8?.formula).toMatch(/Schedule C.*\+.*Schedule E.*\+750$/)
    expect(line8?.note).toBe('→ Schedule C / E + Schedule 1 other income')
  })

  it('line 8 formula keeps the Schedule C / E only note when there is no other-income residual', () => {
    const workbook = buildTaxWorkbook(makeForm1040Return({
      // 5000 + 1200 = 6200 — line 8 amount matches schedule C+E, no residual
      form1040: [
        { line: '1a', label: 'Wages', value: 100_000 },
        { line: '8', label: 'Schedule 1', value: 6_200 },
        { line: '9', label: 'Total income', value: 106_200 },
      ],
    }))
    const line8 = getForm1040Row(workbook, '8')
    expect(line8?.amount).toBe(6_200)
    expect(line8?.formula).not.toMatch(/\+\d/)
    expect(line8?.note).toBe('→ Schedule C / E')
  })

  it('line 9 emits a SUM formula referencing the constituent income rows (#307)', () => {
    const workbook = buildTaxWorkbook(makeForm1040Return())
    const line9 = getForm1040Row(workbook, '9')
    expect(line9?.amount).toBe(106_950)
    // Self-references within Form 1040 are bare cell refs joined with '+'
    expect(line9?.formula).toMatch(/^=C\d+(\+C\d+)+$/)
    // Should reference at least 1a, 8 (and any other rows present)
    const sheet = workbook.sheets.find((s) => s.name === 'Form 1040')!
    const rowOf = (line: string) => sheet.rows.findIndex((r) => r.line === line) + 2
    expect(line9?.formula).toContain(`C${rowOf('1a')}`)
    expect(line9?.formula).toContain(`C${rowOf('8')}`)
    // Must NOT include 4a/5a (gross retirement) — only 4b/5b (taxable) belong in line 9
    expect(line9?.formula).not.toContain(`C${rowOf('4a')}`)
    expect(line9?.formula).not.toContain(`C${rowOf('5a')}`)
  })

  it('line 11 emits a subtraction formula = line 9 − line 10 (#307)', () => {
    const workbook = buildTaxWorkbook(makeForm1040Return())
    const line11 = getForm1040Row(workbook, '11')
    expect(line11?.amount).toBe(106_244)
    const sheet = workbook.sheets.find((s) => s.name === 'Form 1040')!
    const rowOf = (line: string) => sheet.rows.findIndex((r) => r.line === line) + 2
    expect(line11?.formula).toBe(`=C${rowOf('9')}-C${rowOf('10')}`)
  })

  it('emits no Form 1040 sheet at all when taxReturn.form1040 is absent', () => {
    const workbook = buildTaxWorkbook({ year: 2025 })
    expect(workbook.sheets.find((s) => s.name === 'Form 1040')).toBeUndefined()
  })
})
