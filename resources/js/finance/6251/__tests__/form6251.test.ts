import type { FK1StructuredData } from '@/types/finance/k1-data'

import { computeForm6251Lines } from '../form6251'

function makeData(codes: FK1StructuredData['codes'] = {}): FK1StructuredData {
  return {
    schemaVersion: '2026.1',
    formType: 'K-1-1065',
    fields: {},
    codes,
  }
}

function makeScheduleA({
  shouldItemize = false,
  saltDeduction = 10_000,
  standardDeduction = 14_600,
}: {
  shouldItemize?: boolean
  saltDeduction?: number
  standardDeduction?: number
} = {}) {
  return {
    shouldItemize,
    saltDeduction,
    standardDeduction,
  }
}

describe('computeForm6251Lines', () => {
  it('routes each Box 17 code to the correct Form 6251 line', () => {
    const result = computeForm6251Lines({
      taxableIncome: 100_000,
      year: 2024,
      regularTax: 0,
      scheduleA: makeScheduleA({ shouldItemize: false, standardDeduction: 0 }),
      k1Data: [{
        label: 'Acme LP',
        data: makeData({
          '17': [
            { code: 'A', value: '100' },
            { code: 'B', value: '200' },
            { code: 'C', value: '300' },
            { code: 'D', value: '400' },
            { code: 'E', value: '150' },
            { code: 'F', value: '75' },
          ],
        }),
      }],
    })

    expect(result.line2lPost1986Depreciation).toBe(100)
    expect(result.line2kDispositionOfProperty).toBe(200)
    expect(result.line2dDepletion).toBe(300)
    expect(result.line2tIntangibleDrillingCosts).toBe(250)
    expect(result.line3OtherAdjustments).toBe(75)
    expect(result.sourceEntries.map((entry) => `${entry.code}:${entry.line}`)).toEqual([
      'A:2l',
      'B:2k',
      'C:2d',
      'D:2t',
      'E:2t',
      'F:3',
    ])
  })

  it('preserves legacy G/H mappings for existing extracted data', () => {
    const result = computeForm6251Lines({
      taxableIncome: 100_000,
      year: 2024,
      regularTax: 0,
      k1Data: [{
        label: 'Legacy LP',
        data: makeData({
          '17': [
            { code: 'G', value: '90' },
            { code: 'H', value: '40' },
          ],
        }),
      }],
    })

    expect(result.line3OtherAdjustments).toBe(90)
    expect(result.line2mPassiveActivities).toBe(40)
    expect(result.sourceEntries.map((entry) => `${entry.code}:${entry.line}`)).toEqual(['G:3', 'H:2m'])
  })

  it('applies exemption phaseout at the 2024 single and MFJ thresholds', () => {
    const singleAtThreshold = computeForm6251Lines({
      taxableIncome: 609_350,
      year: 2024,
      regularTax: 0,
      k1Data: [],
    })
    const singleAboveThreshold = computeForm6251Lines({
      taxableIncome: 609_450,
      year: 2024,
      regularTax: 0,
      k1Data: [],
    })
    const mfjAboveThreshold = computeForm6251Lines({
      taxableIncome: 1_218_800,
      year: 2024,
      isMarried: true,
      regularTax: 0,
      k1Data: [],
    })

    expect(singleAtThreshold.exemption).toBe(85_700)
    expect(singleAboveThreshold.exemptionReduction).toBe(25)
    expect(singleAboveThreshold.exemption).toBe(85_675)
    expect(mfjAboveThreshold.exemptionReduction).toBe(25)
    expect(mfjAboveThreshold.exemption).toBe(133_275)
  })

  it('applies the 26% / 28% AMT rate split correctly', () => {
    const result = computeForm6251Lines({
      taxableIncome: 319_300,
      year: 2024,
      regularTax: 0,
      k1Data: [],
    })

    expect(result.amtTaxBase).toBe(233_600)
    expect(result.amtBeforeForeignCredit).toBe(60_756)
  })

  it('creates an AMT liability only when tentative minimum tax exceeds regular tax after credits', () => {
    const withAmt = computeForm6251Lines({
      taxableIncome: 319_300,
      year: 2024,
      regularTax: 50_000,
      k1Data: [],
    })
    const withoutAmt = computeForm6251Lines({
      taxableIncome: 319_300,
      year: 2024,
      regularTax: 70_000,
      k1Data: [],
    })

    expect(withAmt.amt).toBe(10_756)
    expect(withoutAmt.amt).toBe(0)
  })

  it('supports a separate AMT foreign tax credit input for Form 1116 interaction', () => {
    const result = computeForm6251Lines({
      taxableIncome: 319_300,
      year: 2024,
      regularTax: 55_000,
      regularForeignTaxCredit: 10_000,
      amtForeignTaxCredit: 4_000,
      k1Data: [],
    })

    expect(result.line8AmtForeignTaxCredit).toBe(4_000)
    expect(result.regularTaxAfterCredits).toBe(45_000)
    expect(result.tentativeMinTax).toBe(56_756)
    expect(result.amt).toBe(11_756)
  })
})
