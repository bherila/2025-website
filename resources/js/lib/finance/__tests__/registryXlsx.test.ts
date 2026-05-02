import type { TaxReturn1040 } from '@/types/finance/tax-return'
import type { XlsxSheet } from '@/types/finance/xlsx-export'

import {
  assembleRegistrySheets,
  buildEstimatedTaxSheet,
  buildForm1040Sheet,
  buildForm1116Sheet,
  buildOverviewSheet,
  buildScheduleASheet,
  buildScheduleBSheet,
  buildScheduleCSheet,
  buildScheduleDSheet,
  buildScheduleESheet,
} from '../buildTaxWorkbook'

type IndexedSheet = XlsxSheet & { rowIndex: Map<string, number> }

function indexed(sheet: XlsxSheet | null): IndexedSheet | null {
  if (!sheet) {
    return null
  }
  const rowIndex = new Map<string, number>()
  sheet.rows.forEach((row, i) => {
    if (row.description) {
      rowIndex.set(row.description, i + 2)
    }
  })
  return { ...sheet, rowIndex }
}

const baseReturn: TaxReturn1040 = {
  year: 2025,
  form1040: [],
  schedule1: { partI: { line1a_taxableRefunds: null, line2a_alimonyReceived: null, line3_businessIncome: null, line4_otherGains: null, line5_rentalRoyaltyIncome: null, line6_farmIncome: null, line7_unemployment: null, line8_otherIncome: 0, line8b_gambling: 0, line8h_juryDuty: 0, line8i_prizes: 0, line8z_otherIncome: 0, line9_total: 0 }, partII: { line11_educatorExpenses: null, line13_hsa: null, line15_seTaxDeduction: null, line17_seHealthInsurance: null, line20_iraDeduction: null, line21_studentLoanInterest: null, line26_total: 0 } } as never,
} as never

describe('XLSX registry integration', () => {
  describe('buildScheduleCSheet', () => {
    it('returns null when no Schedule C data', () => {
      expect(buildScheduleCSheet(baseReturn)).toBeNull()
    })

    it('builds a sheet when scheduleC is present', () => {
      const tr = { ...baseReturn, scheduleC: { total: 12345 } } as TaxReturn1040
      const sheet = buildScheduleCSheet(tr)
      expect(sheet?.name).toBe('Schedule C')
      expect(sheet?.rows).toEqual([
        { line: '31', description: 'Net income / (loss)', amount: 12345, isTotal: true },
      ])
    })
  })

  describe('buildScheduleDSheet', () => {
    it('returns null when no Schedule D data', () => {
      expect(buildScheduleDSheet(baseReturn)).toBeNull()
    })

    it('builds supporting detail rows and formulas for Schedule D lines', () => {
      const tr = {
        ...baseReturn,
        scheduleD: {
          schD_line1a_gain_loss: 120,
          schD_line1b_gain_loss: 0,
          schD_line2_gain_loss: 0,
          schD_line3_gain_loss: 40,
          schD_line4: 0,
          schD_line5: -80,
          schD_line6: 0,
          schD_line7: 80,
          schD_line8a_gain_loss: 200,
          schD_line8b_gain_loss: 0,
          schD_line9_gain_loss: 0,
          schD_line10_gain_loss: 60,
          schD_line11: 0,
          schD_line12: 300,
          schD_line13: 25,
          schD_line14: 0,
          schD_line15: 585,
          schD_line16: 665,
          schD_line21: 665,
        } as never,
        k1Docs: [{
          entityName: 'AQR Fund',
          fields: { '9a': 300 },
          codes: {
            '11': [
              { code: 'S', value: '-80', notes: 'Net short-term capital loss', character: 'short' },
              { code: 'C', value: '100', notes: 'Section 1256 contracts' },
            ],
          },
        }],
        docs1099: [
          { formType: 'broker_1099', payerName: 'Fidelity', parsedData: { b_st_reported_gain_loss: 120, b_lt_gain_loss: 200 } },
          { formType: '1099_div', payerName: 'Vanguard', parsedData: { box2a_cap_gain: 25 } },
        ],
      } as TaxReturn1040
      const sheet = buildScheduleDSheet(tr)
      const line7 = sheet?.rows.find((row) => row.line === '7')
      const line15 = sheet?.rows.find((row) => row.line === '15')
      const line16 = sheet?.rows.find((row) => row.line === '16')

      expect(sheet?.rows.some((row) => row.description === 'Fidelity — S/T 1099-B')).toBe(true)
      expect(sheet?.rows.some((row) => row.description === 'AQR Fund — K-1 Box 11S, S/T non-portfolio')).toBe(true)
      expect(sheet?.rows.some((row) => row.description === 'Vanguard — 1099-DIV capital gain distributions')).toBe(true)
      expect(sheet?.rows.find((row) => row.line === '1a')?.formula).toMatch(/^=SUM\(C\d+:C\d+\)$/)
      expect(sheet?.rows.find((row) => row.line === '5')?.formula).toMatch(/^=SUM\(C\d+:C\d+\)$/)
      expect(line7?.formula).toMatch(/^=C\d+(\+C\d+)+$/)
      expect(line15?.formula).toMatch(/^=C\d+(\+C\d+)+$/)
      expect(line16?.formula).toMatch(/^=C\d+\+C\d+$/)
    })

    it('omits line 21 when net is non-negative', () => {
      const tr = { ...baseReturn, scheduleD: { schD_line16: 5000, schD_line21: 0 } } as TaxReturn1040
      const sheet = buildScheduleDSheet(tr)
      expect(sheet?.rows.some((row) => row.line === '21')).toBe(false)
      expect(sheet?.rows.find((row) => row.line === '16')?.amount).toBe(5000)
    })

    it('includes line 21 when net is negative', () => {
      const tr = {
        ...baseReturn,
        year: 2025,
        scheduleD: { schD_line16: -3000, schD_line21: -3000 },
      } as TaxReturn1040
      const sheet = buildScheduleDSheet(tr)
      const line21 = sheet?.rows.find((row) => row.line === '21')
      expect(line21?.description).toContain('2025')
      expect(line21?.formula).toMatch(/^=MAX\(C\d+,-3000\)$/)
    })
  })

  describe('buildScheduleESheet', () => {
    it('returns null when no Schedule E data', () => {
      expect(buildScheduleESheet(baseReturn)).toBeNull()
    })

    it('builds a 3-line sheet with sum formula on line 3', () => {
      const tr = {
        ...baseReturn,
        scheduleE: { totalPassive: 100, totalNonpassive: 50, grandTotal: 150 },
      } as TaxReturn1040
      const sheet = buildScheduleESheet(tr)
      expect(sheet?.rows).toHaveLength(3)
      expect(sheet?.rows[2]?.formula).toBe('=C2+C3')
    })
  })

  describe('buildOverviewSheet', () => {
    it('returns null when there are no overview sections', () => {
      expect(buildOverviewSheet(baseReturn)).toBeNull()
    })

    it('returns null when overviewSections is an empty array', () => {
      const tr = { ...baseReturn, overviewSections: [] } as TaxReturn1040
      expect(buildOverviewSheet(tr)).toBeNull()
    })

    it('emits a header row per section and a data row per item', () => {
      const tr = {
        ...baseReturn,
        overviewSections: [
          { heading: 'Income', rows: [{ item: 'Wages', amount: 100, note: 'W-2 box 1' }] },
          { heading: 'Deductions', rows: [{ item: 'SALT', amount: -10 }] },
        ],
      } as TaxReturn1040
      const sheet = buildOverviewSheet(tr)
      expect(sheet?.name).toBe('Overview')
      expect(sheet?.rows).toHaveLength(4)
      expect(sheet?.rows[0]).toEqual({ isHeader: true, description: 'Income' })
      expect(sheet?.rows[1]?.amount).toBe(100)
      expect(sheet?.rows[1]?.note).toBe('W-2 box 1')
    })
  })

  describe('buildScheduleBSheet', () => {
    it('returns null when no Schedule B data', () => {
      expect(buildScheduleBSheet(baseReturn)).toBeNull()
    })

    it('emits SUM formulas over interest and dividend ranges', () => {
      const tr = {
        ...baseReturn,
        scheduleB: {
          interestLines: [
            { label: 'Bank A', amount: 100 },
            { label: 'Bank B', amount: 200 },
          ],
          interestTotal: 300,
          dividendLines: [{ label: 'Broker', amount: 50 }],
          dividendTotal: 50,
          qualifiedDivTotal: 30,
        },
      } as unknown as TaxReturn1040
      const sheet = buildScheduleBSheet(tr)
      const line4 = sheet?.rows.find((r) => r.line === '4')
      const line6 = sheet?.rows.find((r) => r.line === '6')
      expect(line4?.formula).toBe('=SUM(C3:C4)')
      // dividend detail row starts at int total (row 5) + 1 header = row 7
      expect(line6?.formula).toBe('=SUM(C7:C7)')
    })

    it('omits SUM formulas when detail arrays are empty', () => {
      const tr = {
        ...baseReturn,
        scheduleB: {
          interestLines: [],
          interestTotal: 0,
          dividendLines: [],
          dividendTotal: 0,
          qualifiedDivTotal: 0,
        },
      } as unknown as TaxReturn1040
      const sheet = buildScheduleBSheet(tr)
      expect(sheet?.rows.find((r) => r.line === '4')?.formula).toBeUndefined()
      expect(sheet?.rows.find((r) => r.line === '6')?.formula).toBeUndefined()
    })
  })

  describe('buildScheduleASheet', () => {
    it('returns null when no Schedule A data', () => {
      expect(buildScheduleASheet(baseReturn)).toBeNull()
    })

    it('adds a Form 4952 formula ref on line 9 when refs.form4952Sheet has the target row', () => {
      const form4952Sheet = indexed({
        name: 'Form 4952',
        rows: [
          {
            line: '8',
            description:
              'Line 8 — Investment interest expense deduction (smaller of Line 3 or Line 6)',
            amount: 500,
          },
        ],
      })
      const tr = {
        ...baseReturn,
        scheduleA: {
          saltDeduction: 10000,
          mortgageInterest: 0,
          totalInvIntExpense: 500,
          charitable: 0,
          otherDeductions: 0,
          totalOtherItemized: 0,
          totalItemizedDeductions: 10500,
          standardDeduction: 14000,
          shouldItemize: false,
        },
      } as TaxReturn1040
      const sheet = buildScheduleASheet(tr, { form4952Sheet })
      const line9 = sheet?.rows.find((r) => r.line === '9')
      expect(line9?.formula).toBe("='Form 4952'!C2")
    })

    it('omits the formula when refs are not supplied', () => {
      const tr = {
        ...baseReturn,
        scheduleA: {
          saltDeduction: 10000,
          mortgageInterest: 0,
          totalInvIntExpense: 500,
          charitable: 0,
          otherDeductions: 0,
          totalOtherItemized: 0,
          totalItemizedDeductions: 10500,
          standardDeduction: 14000,
          shouldItemize: false,
        },
      } as TaxReturn1040
      const sheet = buildScheduleASheet(tr)
      const line9 = sheet?.rows.find((r) => r.line === '9')
      expect(line9?.formula).toBeUndefined()
      expect(line9?.amount).toBe(500)
    })
  })

  describe('buildForm1116Sheet', () => {
    it('returns null when no Form 1116 data', () => {
      expect(buildForm1116Sheet(baseReturn)).toBeNull()
    })

    it('emits SUM formulas over the income and tax source ranges', () => {
      const tr = {
        ...baseReturn,
        form1116: {
          incomeSources: [{ label: 'Fund X — passive', amount: 1000 }],
          taxSources: [{ label: 'Fund X — foreign tax', amount: 150 }],
          generalIncomeSources: [],
          totalPassiveIncome: 1000,
          totalForeignTaxes: 150,
          totalGeneralIncome: 0,
          line4bApportionment: [],
          totalLine4b: 0,
        },
      } as unknown as TaxReturn1040
      const sheet = buildForm1116Sheet(tr)
      const line1 = sheet?.rows.find((r) => r.line === '1')
      const line2 = sheet?.rows.find((r) => r.line === '2')
      expect(line1?.formula).toBe('=SUM(C3:C3)')
      // tax detail row starts at inc total (row 4) + 2 = row 6
      expect(line2?.formula).toBe('=SUM(C6:C6)')
    })

    it('includes general category when generalIncomeSources is populated', () => {
      const tr = {
        ...baseReturn,
        form1116: {
          incomeSources: [{ label: 'P', amount: 1 }],
          taxSources: [{ label: 'T', amount: 1 }],
          generalIncomeSources: [{ label: 'G', amount: 500 }],
          totalPassiveIncome: 1,
          totalForeignTaxes: 1,

          totalGeneralIncome: 500,
          line4bApportionment: [],
          totalLine4b: 0,
        },
      } as unknown as TaxReturn1040
      const sheet = buildForm1116Sheet(tr)
      const generalTotal = sheet?.rows.find((r) => r.line === 'G1')
      expect(generalTotal?.amount).toBe(500)
    })
  })

  describe('buildEstimatedTaxSheet', () => {
    it('returns null when priorYearTax is zero', () => {
      const tr = {
        ...baseReturn,
        estimatedTaxPayments: {
          priorYearTax: 0,
          priorYearAgi: 0,
          agiThresholdApplied: 150000,
          multiplier: 1.1,
          safeHarborAmount: 0,
          expectedWithholding: 0,
          netDue: 0,
          planningYear: 2026,
          quarterlyPayments: [],
        },
      } as unknown as TaxReturn1040
      expect(buildEstimatedTaxSheet(tr)).toBeNull()
    })

    it('builds a safe-harbor sheet with quarterly payments when priorYearTax > 0', () => {
      const tr = {
        ...baseReturn,
        estimatedTaxPayments: {
          priorYearTax: 10000,
          priorYearAgi: 200000,
          agiThresholdApplied: 150000,
          multiplier: 1.1,
          safeHarborAmount: 11000,
          expectedWithholding: 5000,
          netDue: 6000,
          planningYear: 2026,
          quarterlyPayments: [
            { paymentNumber: 1, dueDate: '2026-04-15', amount: 1500 },
            { paymentNumber: 2, dueDate: '2026-06-15', amount: 1500 },
          ],
        },
      } as unknown as TaxReturn1040
      const sheet = buildEstimatedTaxSheet(tr)
      expect(sheet?.name).toBe('Est. Tax Payments')
      const q1 = sheet?.rows.find((r) => r.line === 'Q1')
      expect(q1?.amount).toBe(1500)
    })
  })

  describe('buildForm1040Sheet', () => {
    it('returns null when form1040 is absent', () => {
      const tr = { ...baseReturn, form1040: undefined } as unknown as TaxReturn1040
      expect(buildForm1040Sheet(tr)).toBeNull()
    })

    it('wires Schedule B formula refs when refs.scheduleBSheet is provided', () => {
      const scheduleBSheet = indexed({
        name: 'Schedule B',
        rows: [
          { line: '4', description: 'Line 4 — Total interest', amount: 300 },
          { line: '6', description: 'Line 6 — Total ordinary dividends', amount: 50 },
        ],
      })
      const tr = {
        ...baseReturn,
        form1040: [{ line: '1a', value: 100000 }],
        scheduleB: {
          interestTotal: 300,
          dividendTotal: 50,
          qualifiedDivTotal: 0,
          interestLines: [],
          dividendLines: [],
        },
      } as unknown as TaxReturn1040
      const sheet = buildForm1040Sheet(tr, { scheduleBSheet })
      const line2b = sheet?.rows.find((r) => r.line === '2b')
      const line3b = sheet?.rows.find((r) => r.line === '3b')
      expect(line2b?.formula).toBe("='Schedule B'!C2")
      expect(line3b?.formula).toBe("='Schedule B'!C3")
    })

    it('omits cross-sheet formulas when refs are empty', () => {
      const tr = {
        ...baseReturn,
        form1040: [{ line: '1a', value: 100000 }],
      } as unknown as TaxReturn1040
      const sheet = buildForm1040Sheet(tr)
      const line2b = sheet?.rows.find((r) => r.line === '2b')
      expect(line2b?.formula).toBeUndefined()
    })

    it('builds a self-referencing SUM formula for line 9 from the actual row positions', () => {
      const tr = {
        ...baseReturn,
        form1040: [{ line: '1a', value: 100 }],
      } as unknown as TaxReturn1040
      const sheet = buildForm1040Sheet(tr)
      const line9 = sheet?.rows.find((r) => r.line === '9')
      // Should SUM across the active income line positions, not a hardcoded range
      expect(line9?.formula).toMatch(/^=C\d+(\+C\d+)+$/)
    })
  })

  describe('assembleRegistrySheets', () => {
    it('returns empty array when registry has no xlsx contributions', () => {
      expect(assembleRegistrySheets(baseReturn, {})).toEqual([])
    })

    it('skips entries whose build returns null', () => {
      const registry = {
        'sch-c': {
          xlsx: { sheetName: () => 'Schedule C', order: 1, build: () => null as XlsxSheet | null },
        },
      }
      expect(assembleRegistrySheets(baseReturn, registry)).toEqual([])
    })

    it('skips sheets without exportable content', () => {
      const registry = {
        x: {
          xlsx: {
            sheetName: () => 'Empty',
            order: 1,
            build: () => ({ name: 'Empty', rows: [{ description: 'Header only', isHeader: true }] }),
          },
        },
      }
      expect(assembleRegistrySheets(baseReturn, registry)).toEqual([])
    })

    it('sorts sheets by order field', () => {
      const tr = {
        ...baseReturn,
        scheduleC: { total: 100 },
        scheduleD: { schD_line16: 200, schD_line21: 0 },
        scheduleE: { totalPassive: 10, totalNonpassive: 20, grandTotal: 30 },
      } as TaxReturn1040
      const registry = {
        'sch-c': {
          xlsx: { sheetName: () => 'Schedule C', order: 30, build: buildScheduleCSheet },
        },
        'sch-d': {
          xlsx: { sheetName: () => 'Schedule D', order: 40, build: buildScheduleDSheet },
        },
        'sch-e': {
          xlsx: { sheetName: () => 'Schedule E', order: 50, build: buildScheduleESheet },
        },
      }
      const sheets = assembleRegistrySheets(tr, registry)
      expect(sheets.map((s) => s.name)).toEqual(['Schedule C', 'Schedule D', 'Schedule E'])
    })
  })
})
