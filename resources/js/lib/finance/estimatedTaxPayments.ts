import currency from 'currency.js'

export interface EstimatedTaxPaymentsData {
  /** The tax year for which payments are due (selectedYear + 1). */
  planningYear: number
  /** Total tax from the prior year (user-entered). */
  priorYearTax: number
  /** Prior-year AGI (user-entered). */
  priorYearAgi: number
  /** Multiplier applied to priorYearTax (1.00 or 1.10). */
  multiplier: number
  /** AGI threshold used to determine the multiplier. */
  agiThresholdApplied: number
  /** multiplier × priorYearTax — the safe harbor amount. */
  safeHarborAmount: number
  /** Expected federal withholding for the planning year (estimated from payslip data). */
  expectedWithholding: number
  /** Amount still due after withholding: max(0, safeHarborAmount − expectedWithholding). */
  netDue: number
  /** Base quarterly payment for Q1–Q3. Q4 may differ by up to $0.03 to absorb rounding. */
  quarterlyAmount: number
  /** Four quarterly payment rows with IRS due dates. */
  quarterlyPayments: Array<{
    paymentNumber: number
    dueDate: string
    amount: number
  }>
}

/**
 * Compute safe-harbor estimated tax payments (110% method) for the year
 * following `selectedYear`.
 *
 * Safe harbor rule: for AGI above the applicable threshold, the required annual
 * estimated tax is 110% of the prior year's total tax; otherwise it is 100%.
 * Divide the net due into four installments, letting Q4 absorb any rounding
 * remainder so the displayed quarterly payments reconcile exactly to `netDue`.
 *
 * Due dates (for planning year P):
 *   Q1 — April 15, P
 *   Q2 — June 15, P
 *   Q3 — September 15, P
 *   Q4 — January 15, P+1
 */
function formatDueDate(month: string, day: number, year: number): string {
  return `${month} ${day}, ${year}`
}

export function computeEstimatedTaxPayments(params: {
  /** The tax year being reviewed on the Tax Preview page (e.g. 2025). */
  selectedYear: number
  /** Total tax for selectedYear — the "prior year" used in the safe harbor calc. */
  priorYearTax: number
  /** Prior-year AGI (Form 1040 Line 11). */
  priorYearAgi: number
  /** Expected federal withholding for the planning year (selectedYear + 1). */
  expectedWithholding: number
  /** Whether the prior-year return was MFS. */
  isMarriedFilingSeparately: boolean
}): EstimatedTaxPaymentsData {
  const {
    selectedYear,
    priorYearTax,
    priorYearAgi,
    expectedWithholding,
    isMarriedFilingSeparately,
  } = params
  const planningYear = selectedYear + 1
  const agiThresholdApplied = isMarriedFilingSeparately ? 75_000 : 150_000
  const multiplier = priorYearAgi > agiThresholdApplied ? 1.1 : 1

  const safeHarborAmount = currency(priorYearTax).multiply(multiplier).value
  const netDue = Math.max(0, currency(safeHarborAmount).subtract(expectedWithholding).value)
  const quarterlyAmount = currency(netDue).divide(4).value
  const q4Amount = currency(netDue)
    .subtract(quarterlyAmount)
    .subtract(quarterlyAmount)
    .subtract(quarterlyAmount)
    .value

  return {
    planningYear,
    priorYearTax,
    priorYearAgi,
    multiplier,
    agiThresholdApplied,
    safeHarborAmount,
    expectedWithholding,
    netDue,
    quarterlyAmount,
    quarterlyPayments: [
      { paymentNumber: 1, dueDate: formatDueDate('April', 15, planningYear), amount: quarterlyAmount },
      { paymentNumber: 2, dueDate: formatDueDate('June', 15, planningYear), amount: quarterlyAmount },
      { paymentNumber: 3, dueDate: formatDueDate('September', 15, planningYear), amount: quarterlyAmount },
      { paymentNumber: 4, dueDate: formatDueDate('January', 15, planningYear + 1), amount: q4Amount },
    ],
  }
}
