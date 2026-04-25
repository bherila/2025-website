import type { TaxReturn1040 } from '@/types/finance/tax-return'
import type { XlsxSheet } from '@/types/finance/xlsx-export'

import {
  assembleRegistrySheets,
  buildScheduleCSheet,
  buildScheduleDSheet,
  buildScheduleESheet,
} from '../buildTaxWorkbook'

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

    it('omits line 21 when net is non-negative', () => {
      const tr = { ...baseReturn, scheduleD: { schD_line16: 5000, schD_line21: 0 } } as TaxReturn1040
      const sheet = buildScheduleDSheet(tr)
      expect(sheet?.rows).toHaveLength(1)
      expect(sheet?.rows[0]?.line).toBe('16')
    })

    it('includes line 21 when net is negative', () => {
      const tr = {
        ...baseReturn,
        year: 2025,
        scheduleD: { schD_line16: -3000, schD_line21: -3000 },
      } as TaxReturn1040
      const sheet = buildScheduleDSheet(tr)
      expect(sheet?.rows).toHaveLength(2)
      expect(sheet?.rows[1]?.line).toBe('21')
      expect(sheet?.rows[1]?.description).toContain('2025')
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
