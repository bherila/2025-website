import { buildTaxWorkbook } from '../resources/js/lib/finance/buildTaxWorkbook'
import { computeEstimatedTaxPayments } from '../resources/js/lib/finance/estimatedTaxPayments'
import type { TaxReturn1040 } from '../resources/js/types/finance/tax-return'

describe('computeEstimatedTaxPayments', () => {
  it('computes 110% safe harbor with zero withholding', () => {
    const result = computeEstimatedTaxPayments({
      selectedYear: 2025,
      priorYearTax: 100_000,
      expectedWithholding: 0,
    })

    expect(result.planningYear).toBe(2026)
    expect(result.priorYearTax).toBe(100_000)
    expect(result.safeHarborAmount).toBe(110_000)
    expect(result.expectedWithholding).toBe(0)
    expect(result.netDue).toBe(110_000)
    expect(result.quarterlyAmount).toBe(27_500)
    expect(result.quarterlyPayments).toHaveLength(4)
  })

  it('subtracts expected withholding from net due', () => {
    const result = computeEstimatedTaxPayments({
      selectedYear: 2025,
      priorYearTax: 100_000,
      expectedWithholding: 60_000,
    })

    expect(result.safeHarborAmount).toBe(110_000)
    expect(result.netDue).toBe(50_000)
    expect(result.quarterlyAmount).toBe(12_500)
  })

  it('clamps netDue to zero when withholding exceeds safe harbor', () => {
    const result = computeEstimatedTaxPayments({
      selectedYear: 2025,
      priorYearTax: 50_000,
      expectedWithholding: 100_000,
    })

    expect(result.safeHarborAmount).toBe(55_000)
    expect(result.netDue).toBe(0)
    expect(result.quarterlyAmount).toBe(0)
  })

  it('assigns correct IRS due dates', () => {
    const result = computeEstimatedTaxPayments({
      selectedYear: 2025,
      priorYearTax: 80_000,
      expectedWithholding: 0,
    })

    const dates = result.quarterlyPayments.map((p) => p.dueDate)
    expect(dates).toEqual(['04/15/2026', '06/15/2026', '09/15/2026', '01/15/2027'])
  })

  it('assigns sequential payment numbers 1–4', () => {
    const result = computeEstimatedTaxPayments({
      selectedYear: 2025,
      priorYearTax: 80_000,
      expectedWithholding: 0,
    })

    expect(result.quarterlyPayments.map((p) => p.paymentNumber)).toEqual([1, 2, 3, 4])
  })

  it('uses currency.js precision (no floating-point drift)', () => {
    // 110% of 100,001 = 110,001.10 → / 4 = 27,500.275 → rounds to 27,500.28
    const result = computeEstimatedTaxPayments({
      selectedYear: 2025,
      priorYearTax: 100_001,
      expectedWithholding: 0,
    })

    expect(result.safeHarborAmount).toBe(110_001.10)
    // All 4 payments should be equal
    const amounts = result.quarterlyPayments.map((p) => p.amount)
    expect(amounts[0]).toBe(amounts[1])
    expect(amounts[1]).toBe(amounts[2])
    expect(amounts[2]).toBe(amounts[3])
  })

  it('handles priorYearTax = 0 gracefully', () => {
    const result = computeEstimatedTaxPayments({
      selectedYear: 2025,
      priorYearTax: 0,
      expectedWithholding: 50_000,
    })

    expect(result.safeHarborAmount).toBe(0)
    expect(result.netDue).toBe(0)
    expect(result.quarterlyAmount).toBe(0)
  })
})

describe('buildTaxWorkbook — Est. Tax Payments sheet', () => {
  it('omits sheet when estimatedTaxPayments is absent', () => {
    const workbook = buildTaxWorkbook({ year: 2025 })
    expect(workbook.sheets.some((s) => s.name === 'Est. Tax Payments')).toBe(false)
  })

  it('omits sheet when priorYearTax is zero', () => {
    const taxReturn: TaxReturn1040 = {
      year: 2025,
      estimatedTaxPayments: {
        planningYear: 2026,
        priorYearTax: 0,
        safeHarborAmount: 0,
        expectedWithholding: 0,
        netDue: 0,
        quarterlyAmount: 0,
        quarterlyPayments: [],
      },
    }
    const workbook = buildTaxWorkbook(taxReturn)
    expect(workbook.sheets.some((s) => s.name === 'Est. Tax Payments')).toBe(false)
  })

  it('emits sheet with correct rows when priorYearTax > 0', () => {
    const taxReturn: TaxReturn1040 = {
      year: 2025,
      estimatedTaxPayments: {
        planningYear: 2026,
        priorYearTax: 100_000,
        safeHarborAmount: 110_000,
        expectedWithholding: 60_000,
        netDue: 50_000,
        quarterlyAmount: 12_500,
        quarterlyPayments: [
          { paymentNumber: 1, dueDate: '04/15/2026', amount: 12_500 },
          { paymentNumber: 2, dueDate: '06/15/2026', amount: 12_500 },
          { paymentNumber: 3, dueDate: '09/15/2026', amount: 12_500 },
          { paymentNumber: 4, dueDate: '01/15/2027', amount: 12_500 },
        ],
      },
    }
    const workbook = buildTaxWorkbook(taxReturn)
    const sheet = workbook.sheets.find((s) => s.name === 'Est. Tax Payments')
    expect(sheet).toBeDefined()

    // Must include prior year tax row
    expect(sheet?.rows.some((r) => r.amount === 100_000)).toBe(true)
    // Must include safe harbor total row
    expect(sheet?.rows.some((r) => r.amount === 110_000 && r.isTotal)).toBe(true)
    // Must include net due row
    expect(sheet?.rows.some((r) => r.amount === 50_000 && r.isTotal)).toBe(true)
    // Must have 4 quarterly payment rows
    const paymentRows = sheet?.rows.filter((r) => r.line?.startsWith('Q'))
    expect(paymentRows).toHaveLength(4)
    expect(paymentRows?.[0]?.amount).toBe(12_500)
    expect(paymentRows?.[3]?.description).toContain('01/15/2027')
  })
})
