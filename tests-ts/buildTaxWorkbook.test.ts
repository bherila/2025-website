import { buildTaxWorkbook } from '../resources/js/lib/finance/buildTaxWorkbook'
import type { TaxReturn1040 } from '../resources/js/types/finance/tax-return'

describe('buildTaxWorkbook', () => {
  it('Box 20 Code Z carries Form 8995 routing note (TY 2023+ QBI code)', () => {
    const workbook = buildTaxWorkbook({
      year: 2024,
      k1Docs: [{
        entityName: 'Acme LP',
        fields: {},
        codes: { '20': [{ code: 'Z', value: '50000' }] },
      }],
    })
    const k1Sheet = workbook.sheets.find(s => s.name === 'K-1 Acme LP')
    expect(k1Sheet).toBeDefined()
    const zRow = k1Sheet!.rows.find(r => r.line === '20Z')
    expect(zRow).toBeDefined()
    expect(zRow!.note).toMatch(/Form 8995/)
    expect(zRow!.note).toMatch(/QBI/)
  })

  it('Box 20 Code S has no Form 8995 routing note (pre-2023 code no longer routed)', () => {
    const workbook = buildTaxWorkbook({
      year: 2024,
      k1Docs: [{
        entityName: 'Old LP',
        fields: {},
        codes: { '20': [{ code: 'S', value: '99999' }] },
      }],
    })
    const k1Sheet = workbook.sheets.find(s => s.name === 'K-1 Old LP')
    expect(k1Sheet).toBeDefined()
    const sRow = k1Sheet!.rows.find(r => r.line === '20S')
    expect(sRow).toBeDefined()
    // S no longer has a routing note; the note should be undefined or not reference Form 8995
    expect(sRow!.note ?? '').not.toMatch(/Form 8995/)
  })

  it('Box 20 Code V has no UBIA routing note (pre-2023 code no longer routed)', () => {
    const workbook = buildTaxWorkbook({
      year: 2024,
      k1Docs: [{
        entityName: 'Old LP',
        fields: {},
        codes: { '20': [{ code: 'V', value: '200000' }] },
      }],
    })
    const k1Sheet = workbook.sheets.find(s => s.name === 'K-1 Old LP')
    expect(k1Sheet).toBeDefined()
    const vRow = k1Sheet!.rows.find(r => r.line === '20V')
    expect(vRow).toBeDefined()
    expect(vRow!.note ?? '').not.toMatch(/UBIA/)
  })

  it('normalizes lowercase K-1 code rows when exporting workbook sheets', () => {
    const workbook = buildTaxWorkbook({
      year: 2025,
      k1Docs: [{
        entityName: 'Lowercase LP',
        fields: {},
        codes: { '11': [{ code: 's', value: '-100', character: 'short' }] },
      }],
    })

    const k1Sheet = workbook.sheets.find(s => s.name === 'K-1 Lowercase LP')
    expect(k1Sheet).toBeDefined()
    const row = k1Sheet!.rows.find(r => r.line === '11S')
    expect(row).toBeDefined()
    expect(row!.note).toMatch(/Character: short-term/)
    expect(row!.note).toMatch(/Sch D line 5/)
  })

  it('emits only Schedule B when only scheduleB is populated', () => {
    const workbook = buildTaxWorkbook({
      year: 2025,
      scheduleB: {
        interestTotal: 100,
        dividendTotal: 50,
        qualifiedDivTotal: 30,
        interestLines: [{ label: 'Bank A', amount: 100 }],
        dividendLines: [{ label: 'Fund A', amount: 50 }],
        qualifiedDividendLines: [{ label: 'Fund A', amount: 30 }],
      },
    })

    expect(workbook.sheets).toHaveLength(1)
    expect(workbook.sheets[0]?.name).toBe('Schedule B')
  })

  it('keeps sheets in canonical order when populated', () => {
    const taxReturn: TaxReturn1040 = {
      year: 2025,
      form1040: [{ line: '1a', label: 'Wages, salaries, tips (W-2, box 1)', value: 100000 }],
      scheduleA: { invIntSources: [], totalInvIntExpense: 20, saltPaid: 0, saltDeduction: 0, mortgageInterest: 0, charitable: 0, otherDeductions: 0, otherItemizedSources: [], totalOtherItemized: 0, userDeductions: [], totalItemizedDeductions: 20, standardDeduction: 15_000, shouldItemize: false },
      scheduleB: {
        interestTotal: 100,
        dividendTotal: 50,
        qualifiedDivTotal: 30,
        interestLines: [{ label: 'Bank A', amount: 100 }],
        dividendLines: [{ label: 'Fund A', amount: 50 }],
        qualifiedDividendLines: [{ label: 'Fund A', amount: 30 }],
      },
      scheduleC: { total: 5000, byQuarter: { q1: 1000, q2: 2000, q3: 3000, q4: 5000 } },
      scheduleD: {
        schD_line1a_proceeds: 0,
        schD_line1a_cost: 0,
        schD_line1a_adjustments: 0,
        schD_line1a_gain_loss: 0,
        schD_line1b_proceeds: 0,
        schD_line1b_cost: 0,
        schD_line1b_adjustments: 0,
        schD_line1b_gain_loss: 0,
        schD_line2_proceeds: 0,
        schD_line2_cost: 0,
        schD_line2_adjustments: 0,
        schD_line2_gain_loss: 0,
        schD_line3_proceeds: 0,
        schD_line3_cost: 0,
        schD_line3_adjustments: 0,
        schD_line3_gain_loss: 0,
        schD_line4: 0,
        schD_line5: 0,
        schD_line6: 0,
        schD_line7: 0,
        schD_line8a_proceeds: 0,
        schD_line8a_cost: 0,
        schD_line8a_adjustments: 0,
        schD_line8a_gain_loss: 0,
        schD_line8b_proceeds: 0,
        schD_line8b_cost: 0,
        schD_line8b_adjustments: 0,
        schD_line8b_gain_loss: 0,
        schD_line9_proceeds: 0,
        schD_line9_cost: 0,
        schD_line9_adjustments: 0,
        schD_line9_gain_loss: 0,
        schD_line10_proceeds: 0,
        schD_line10_cost: 0,
        schD_line10_adjustments: 0,
        schD_line10_gain_loss: 0,
        schD_line11: 0,
        schD_line12: 0,
        schD_line13: 0,
        schD_line14: 0,
        schD_line15: 0,
        schD_line16: 100,
        schD_line21: 100,
        totalBusinessCapGains: 0,
        totalPersonalCapGains: 0,
        limitedBusinessCapGains: 0,
        limitedPersonalCapGains: 0,
      },
      scheduleE: { grandTotal: 100, totalPassive: 60, totalNonpassive: 40, totalTraderNii: 0 },
      scheduleSE: {
        entries: [{ label: 'Blue Harbor — Box 14A', amount: 10_000, sourceType: 'k1_box14_a' }],
        netEarningsFromSE: 10_000,
        seTaxableEarnings: 9_235,
        socialSecurityWageBase: 176_100,
        socialSecurityWages: 0,
        remainingSocialSecurityWageBase: 176_100,
        socialSecurityTaxableEarnings: 9_235,
        socialSecurityTax: 1_145.14,
        medicareWages: 0,
        medicareTaxableEarnings: 9_235,
        medicareTax: 267.82,
        additionalMedicareThreshold: 200_000,
        additionalMedicareTaxableEarnings: 0,
        additionalMedicareTax: 0,
        seTax: 1_412.96,
        deductibleSeTax: 706.48,
      },
      form1116: {
        incomeSources: [],
        taxSources: [],
        totalPassiveIncome: 100,
        totalForeignTaxes: 15,
        generalIncomeSources: [],
        totalGeneralIncome: 0,
        line4bApportionment: [],
        totalLine4b: 0,
        creditVsDeduction: null,
        turboTaxAlert: false,
      },
      form4952: {
        invIntSources: [],
        totalInvIntExpense: 10,
        scheduleEDeductibleInvestmentInterestExpense: 0,
        invExpSources: [],
        totalInvExp: 0,
        niiBefore: 200,
        totalQualDiv: 0,
        deductibleInvestmentInterestExpense: 10,
        disallowedCarryforward: 0,
      },
      k1Docs: [{ entityName: 'Blue Harbor', fields: { '1': 100 }, codes: {} }],
      k3Docs: [{ entityName: 'Blue Harbor', sections: [{ sectionId: 'part2', title: 'Part II', data: { rows: [] } }] }],
      docs1099: [{ formType: '1099_div', payerName: 'Fidelity SMA', parsedData: { box1a_ordinary: 123 } }],
    }

    const workbook = buildTaxWorkbook(taxReturn)
    // K-3 sheets contain only notes, which are now treated as exportable content.
    expect(workbook.sheets.map(s => s.name)).toEqual([
      'Form 1040',
      'Schedule A',
      'Schedule B',
      'Schedule C',
      'Schedule D',
      'Schedule E',
      'Schedule SE',
      'Form 1116',
      'Form 4952',
      'K-1 Blue Harbor',
      'K-3 Blue Harbor',
      '1099-DIV Fidelity SMA',
    ])
  })

  it('adds a Schedule SE worksheet when self-employment tax data is present', () => {
    const scheduleSEFixture = {
      entries: [{ label: 'Acme LP — Box 14A', amount: 100_000, sourceType: 'k1_box14_a' as const }],
      netEarningsFromSE: 100_000,
      seTaxableEarnings: 92_350,
      socialSecurityWageBase: 168_600,
      socialSecurityWages: 0,
      remainingSocialSecurityWageBase: 168_600,
      socialSecurityTaxableEarnings: 92_350,
      socialSecurityTax: 11_451.4,
      medicareWages: 0,
      medicareTaxableEarnings: 92_350,
      medicareTax: 2_677.15,
      additionalMedicareThreshold: 200_000,
      additionalMedicareTaxableEarnings: 0,
      additionalMedicareTax: 0,
      seTax: 14_128.55,
      deductibleSeTax: 7_064.28,
    }
    const workbook = buildTaxWorkbook({
      year: 2025,
      scheduleSE: scheduleSEFixture,
    })

    const scheduleSE = workbook.sheets.find(s => s.name === 'Schedule SE')
    expect(scheduleSE).toBeDefined()
    expect(scheduleSE?.rows.some(r => r.description === 'Line 12 — Self-employment tax → Schedule 2 Line 4' && r.amount === scheduleSEFixture.seTax)).toBe(true)
    expect(scheduleSE?.rows.some(r => r.description === 'Line 13 — Deductible half of self-employment tax → Schedule 1 Line 15')).toBe(true)
  })

  it('omits undefined schedule fields', () => {
    const workbook = buildTaxWorkbook({
      year: 2025,
      scheduleB: {
        interestTotal: 10,
        dividendTotal: 0,
        qualifiedDivTotal: 0,
        interestLines: [{ label: 'Bank A', amount: 10 }],
        dividendLines: [],
        qualifiedDividendLines: [],
      },
    })

    expect(workbook.sheets.some(s => s.name === 'Schedule A')).toBe(false)
    expect(workbook.sheets.some(s => s.name === 'Schedule B')).toBe(true)
  })

  it('keeps not-yet-wired amounts undefined instead of zero', () => {
    const workbook = buildTaxWorkbook({
      year: 2025,
      form1040: [{ line: '1a', label: 'Wages, salaries, tips (W-2, box 1)', value: 100000 }],
    })
    const form1040 = workbook.sheets.find(s => s.name === 'Form 1040')
    const line20 = form1040?.rows.find(r => r.line === '20')
    expect(line20?.amount).toBeUndefined()
  })

  it('includes complete Schedule A deduction rows in workbook export', () => {
    const workbook = buildTaxWorkbook({
      year: 2025,
      scheduleA: {
        invIntSources: [],
        totalInvIntExpense: 1200,
        saltPaid: 9000,
        saltDeduction: 10_000,
        mortgageInterest: 6000,
        charitable: 2500,
        otherDeductions: 300,
        otherItemizedSources: [],
        totalOtherItemized: 0,
        userDeductions: [],
        totalItemizedDeductions: 20_000,
        standardDeduction: 15_000,
        shouldItemize: true,
      },
    })

    const scheduleASheet = workbook.sheets.find(s => s.name === 'Schedule A')
    expect(scheduleASheet).toBeDefined()
    expect(scheduleASheet?.rows.some(r => r.line === '8' && r.amount === 6000)).toBe(true)
    expect(scheduleASheet?.rows.some(r => r.line === '10' && r.amount === 7200)).toBe(true) // mortgage 6000 + inv int 1200
    expect(scheduleASheet?.rows.some(r => r.line === '11' && r.amount === 2500)).toBe(true)
    expect(scheduleASheet?.rows.some(r => r.line === '16' && r.amount === 300)).toBe(true)
    expect(scheduleASheet?.rows.some(r => r.line === '7' && r.note?.includes('sales tax'))).toBe(true)

    // Row order must follow IRS Schedule A: 7 → 8 → 9 → 10 → 11 → 16 → 17
    const lineOrder = scheduleASheet!.rows
      .map(r => r.line)
      .filter((l): l is string => typeof l === 'string' && /^\d+$/.test(l))
    expect(lineOrder).toEqual(['7', '8', '9', '10', '11', '16', '17'])
  })
})
