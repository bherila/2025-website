import type { Form6251Lines, TaxReturn1040 } from '@/types/finance/tax-return'

import { buildTaxWorkbook } from '../buildTaxWorkbook'

function makeForm6251(overrides: Partial<Form6251Lines> = {}): Form6251Lines {
  return {
    line1TaxableIncome: 300_000,
    line2aTaxesOrStandardDeduction: 14_600,
    line2aSource: 'standard_deduction',
    line2cInvestmentInterest: 0,
    line2dDepletion: 300,
    line2kDispositionOfProperty: 200,
    line2lPost1986Depreciation: 100,
    line2mPassiveActivities: 0,
    line2nLossLimitations: 0,
    line2tIntangibleDrillingCosts: 250,
    line3OtherAdjustments: 75,
    adjustmentTotal: 15_525,
    amti: 315_525,
    exemption: 85_700,
    exemptionBase: 85_700,
    exemptionReduction: 0,
    exemptionPhaseoutThreshold: 609_350,
    amtTaxBase: 229_825,
    amtRateSplitThreshold: 232_600,
    amtBeforeForeignCredit: 59_754.5,
    line8AmtForeignTaxCredit: 2_000,
    tentativeMinTax: 57_754.5,
    regularTax: 50_000,
    regularForeignTaxCredit: 1_500,
    regularTaxAfterCredits: 48_500,
    amt: 9_254.5,
    filingStatus: 'single',
    sourceEntries: [
      { label: 'Acme LP', code: 'A', line: '2l', amount: 100, description: 'Post-1986 depreciation adjustment' },
      { label: 'Acme LP', code: 'B', line: '2k', amount: 200, description: 'Adjusted gain or loss' },
    ],
    requiresStatementReview: false,
    manualReviewReasons: [],
    ...overrides,
  }
}

function makeTaxReturn(form6251: Form6251Lines): TaxReturn1040 {
  return {
    year: 2024,
    form1040: [{ line: '1a', label: 'Wages, salaries, tips (W-2, box 1)', value: 300_000 }],
    schedule2: {
      altMinimumTax: form6251.amt,
      selfEmploymentTax: 0,
      additionalMedicareTax: 0,
      niit: 0,
      totalAdditionalTaxes: form6251.amt,
    },
    form6251,
  }
}

describe('buildTaxWorkbook — Form 6251 sheet', () => {
  it('includes Form 6251 when form6251 data exists', () => {
    const workbook = buildTaxWorkbook(makeTaxReturn(makeForm6251()))
    expect(workbook.sheets.find((sheet) => sheet.name === 'Form 6251')).toBeDefined()
  })

  it('wires Form 1040 line 17 to Form 6251 line 11 when present', () => {
    const workbook = buildTaxWorkbook(makeTaxReturn(makeForm6251()))
    const form1040 = workbook.sheets.find((sheet) => sheet.name === 'Form 1040')
    const line17 = form1040?.rows.find((row) => row.line === '17')

    expect(line17?.formula).toContain("'Form 6251'!C")
    expect(line17?.note).toContain('Form 6251')
  })
})
