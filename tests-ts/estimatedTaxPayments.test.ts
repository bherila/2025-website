import currency from 'currency.js'

import { computeEstimatedTaxPayments } from '../resources/js/lib/finance/estimatedTaxPayments'

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
