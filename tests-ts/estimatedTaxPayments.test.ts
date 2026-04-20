import currency from 'currency.js'

import { buildTaxWorkbook } from '../resources/js/lib/finance/buildTaxWorkbook'
import { computeEstimatedTaxPayments } from '../resources/js/lib/finance/estimatedTaxPayments'
import type { TaxReturn1040 } from '../resources/js/types/finance/tax-return'

describe('computeEstimatedTaxPayments', () => {
  it('applies 100% multiplier when AGI ≤ $150k (MFJ/single)', () => {
    const result = computeEstimatedTaxPayments({
      selectedYear: 2025,
      priorYearTax: 100_000,
      priorYearAgi: 150_000,
      expectedWithholding: 0,
      isMarriedFilingSeparately: false,
    })

    expect(result.multiplier).toBe(1)
    expect(result.agiThresholdApplied).toBe(150_000)
    expect(result.safeHarborAmount).toBe(100_000)
  })

  it('applies 110% multiplier when AGI > $150k', () => {
    const result = computeEstimatedTaxPayments({
      selectedYear: 2025,
      priorYearTax: 100_000,
      priorYearAgi: 150_001,
      expectedWithholding: 0,
      isMarriedFilingSeparately: false,
    })

    expect(result.multiplier).toBe(1.1)
    expect(result.safeHarborAmount).toBe(110_000)
    expect(result.quarterlyAmount).toBe(27_500)
  })

  it('applies 100% multiplier when AGI ≤ $75k (MFS)', () => {
    const result = computeEstimatedTaxPayments({
      selectedYear: 2025,
      priorYearTax: 80_000,
      priorYearAgi: 75_000,
      expectedWithholding: 0,
      isMarriedFilingSeparately: true,
    })

    expect(result.multiplier).toBe(1)
    expect(result.agiThresholdApplied).toBe(75_000)
    expect(result.safeHarborAmount).toBe(80_000)
  })

  it('applies 110% multiplier when AGI > $75k (MFS)', () => {
    const result = computeEstimatedTaxPayments({
      selectedYear: 2025,
      priorYearTax: 80_000,
      priorYearAgi: 75_001,
      expectedWithholding: 0,
      isMarriedFilingSeparately: true,
    })

    expect(result.multiplier).toBe(1.1)
    expect(result.safeHarborAmount).toBe(88_000)
  })

  it('subtracts expected withholding from net due', () => {
    const result = computeEstimatedTaxPayments({
      selectedYear: 2025,
      priorYearTax: 100_000,
      priorYearAgi: 200_000,
      expectedWithholding: 60_000,
      isMarriedFilingSeparately: false,
    })

    expect(result.safeHarborAmount).toBe(110_000)
    expect(result.netDue).toBe(50_000)
    expect(result.quarterlyAmount).toBe(12_500)
  })

  it('clamps netDue to zero when withholding exceeds safe harbor', () => {
    const result = computeEstimatedTaxPayments({
      selectedYear: 2025,
      priorYearTax: 50_000,
      priorYearAgi: 200_000,
      expectedWithholding: 100_000,
      isMarriedFilingSeparately: false,
    })

    expect(result.safeHarborAmount).toBe(55_000)
    expect(result.netDue).toBe(0)
    expect(result.quarterlyAmount).toBe(0)
  })

  it('assigns correct IRS due dates in long form', () => {
    const result = computeEstimatedTaxPayments({
      selectedYear: 2025,
      priorYearTax: 80_000,
      priorYearAgi: 200_000,
      expectedWithholding: 0,
      isMarriedFilingSeparately: false,
    })

    const dates = result.quarterlyPayments.map((payment) => payment.dueDate)
    expect(dates).toEqual([
      'April 15, 2026',
      'June 15, 2026',
      'September 15, 2026',
      'January 15, 2027',
    ])
  })

  it('assigns sequential payment numbers 1–4', () => {
    const result = computeEstimatedTaxPayments({
      selectedYear: 2025,
      priorYearTax: 80_000,
      priorYearAgi: 200_000,
      expectedWithholding: 0,
      isMarriedFilingSeparately: false,
    })

    expect(result.quarterlyPayments.map((payment) => payment.paymentNumber)).toEqual([1, 2, 3, 4])
  })

  it('quarterly payments sum exactly to netDue (Q4 absorbs remainder)', () => {
    const result = computeEstimatedTaxPayments({
      selectedYear: 2025,
      priorYearTax: 100_001,
      priorYearAgi: 200_000,
      expectedWithholding: 0,
      isMarriedFilingSeparately: false,
    })

    const sum = result.quarterlyPayments.reduce(
      (acc, payment) => currency(acc).add(payment.amount).value,
      0,
    )

    expect(sum).toBe(result.netDue)
    expect(result.quarterlyPayments[0]?.amount).toBe(27_500.28)
    expect(result.quarterlyPayments[3]?.amount).toBe(27_500.26)
  })

  it('handles priorYearTax = 0 gracefully', () => {
    const result = computeEstimatedTaxPayments({
      selectedYear: 2025,
      priorYearTax: 0,
      priorYearAgi: 0,
      expectedWithholding: 50_000,
      isMarriedFilingSeparately: false,
    })

    expect(result.safeHarborAmount).toBe(0)
    expect(result.netDue).toBe(0)
    expect(result.quarterlyAmount).toBe(0)
  })
})

describe('buildTaxWorkbook — Est. Tax Payments sheet', () => {
  it('omits sheet when estimatedTaxPayments is absent', () => {
    const workbook = buildTaxWorkbook({ year: 2025 })
    expect(workbook.sheets.some((sheet) => sheet.name === 'Est. Tax Payments')).toBe(false)
  })

  it('omits sheet when priorYearTax is zero', () => {
    const taxReturn: TaxReturn1040 = {
      year: 2025,
      estimatedTaxPayments: {
        planningYear: 2026,
        priorYearTax: 0,
        priorYearAgi: 0,
        multiplier: 1,
        agiThresholdApplied: 150_000,
        safeHarborAmount: 0,
        expectedWithholding: 0,
        netDue: 0,
        quarterlyAmount: 0,
        quarterlyPayments: [],
      },
    }
    const workbook = buildTaxWorkbook(taxReturn)
    expect(workbook.sheets.some((sheet) => sheet.name === 'Est. Tax Payments')).toBe(false)
  })

  it('emits sheet with AGI threshold row and long-form due dates', () => {
    const taxReturn: TaxReturn1040 = {
      year: 2025,
      estimatedTaxPayments: {
        planningYear: 2026,
        priorYearTax: 100_000,
        priorYearAgi: 200_000,
        multiplier: 1.1,
        agiThresholdApplied: 150_000,
        safeHarborAmount: 110_000,
        expectedWithholding: 60_000,
        netDue: 50_000,
        quarterlyAmount: 12_500,
        quarterlyPayments: [
          { paymentNumber: 1, dueDate: 'April 15, 2026', amount: 12_500 },
          { paymentNumber: 2, dueDate: 'June 15, 2026', amount: 12_500 },
          { paymentNumber: 3, dueDate: 'September 15, 2026', amount: 12_500 },
          { paymentNumber: 4, dueDate: 'January 15, 2027', amount: 12_500 },
        ],
      },
    }
    const workbook = buildTaxWorkbook(taxReturn)
    const sheet = workbook.sheets.find((candidate) => candidate.name === 'Est. Tax Payments')

    expect(sheet).toBeDefined()
    expect(sheet?.rows.some((row) => row.description === '2025 AGI (prior year)' && row.amount === 200_000)).toBe(true)
    expect(sheet?.rows.some((row) => row.description === 'Safe harbor amount (110%)' && row.isTotal)).toBe(true)
    expect(sheet?.rows.some((row) => row.description === 'Payment 4 — Due January 15, 2027')).toBe(true)
  })
})
