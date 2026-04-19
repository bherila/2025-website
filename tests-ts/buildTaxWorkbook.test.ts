import { buildTaxWorkbook } from '../resources/js/lib/finance/buildTaxWorkbook'
import type { TaxReturn1040 } from '../resources/js/types/finance/tax-return'

describe('buildTaxWorkbook', () => {
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
      scheduleA: { invIntSources: [], totalInvIntExpense: 20 },
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
      scheduleE: { grandTotal: 100, totalPassive: 60, totalNonpassive: 40 },
      form1116: {
        incomeSources: [],
        taxSources: [],
        totalPassiveIncome: 100,
        totalForeignTaxes: 15,
        generalIncomeSources: [],
        totalGeneralIncome: 0,
        line4bApportionment: [],
        totalLine4b: 0,
        niit: null,
        creditVsDeduction: null,
        turboTaxAlert: false,
      },
      form4952: {
        invIntSources: [],
        totalInvIntExpense: 10,
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
      'Form 1116',
      'Form 4952',
      'K-1 Blue Harbor',
      'K-3 Blue Harbor',
      '1099-DIV Fidelity SMA',
    ])
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
})
