import currency from 'currency.js'

export interface EstimatedTaxPaymentsData {
  /** The tax year for which payments are due (selectedYear + 1). */
  planningYear: number
  /** Total tax from the prior year (user-entered). */
  priorYearTax: number
  /** 110% of priorYearTax — the safe harbor amount. */
  safeHarborAmount: number
  /** Expected federal withholding for the planning year (estimated from payslip data). */
  expectedWithholding: number
  /** Amount still due after withholding: max(0, safeHarborAmount − expectedWithholding). */
  netDue: number
  /** Each quarterly payment: netDue / 4. */
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
 * Safe harbor rule: for AGI > $150k the required annual estimated tax is 110%
 * of the prior year's total tax.  Divide by 4 and subtract expected withholding
 * to get the net quarterly cash payment.
 *
 * Due dates (for planning year P):
 *   Q1 — April 15, P
 *   Q2 — June 15, P
 *   Q3 — September 15, P
 *   Q4 — January 15, P+1
 */
export function computeEstimatedTaxPayments(params: {
  /** The tax year being reviewed on the Tax Preview page (e.g. 2025). */
  selectedYear: number
  /** Total tax for selectedYear — the "prior year" used in the safe harbor calc. */
  priorYearTax: number
  /** Expected federal withholding for the planning year (selectedYear + 1). */
  expectedWithholding: number
}): EstimatedTaxPaymentsData {
  const { selectedYear, priorYearTax, expectedWithholding } = params
  const planningYear = selectedYear + 1

  const safeHarborAmount = currency(priorYearTax).multiply(1.1).value
  const netDue = Math.max(0, currency(safeHarborAmount).subtract(expectedWithholding).value)
  const quarterlyAmount = currency(netDue).divide(4).value

  return {
    planningYear,
    priorYearTax,
    safeHarborAmount,
    expectedWithholding,
    netDue,
    quarterlyAmount,
    quarterlyPayments: [
      { paymentNumber: 1, dueDate: `04/15/${planningYear}`, amount: quarterlyAmount },
      { paymentNumber: 2, dueDate: `06/15/${planningYear}`, amount: quarterlyAmount },
      { paymentNumber: 3, dueDate: `09/15/${planningYear}`, amount: quarterlyAmount },
      { paymentNumber: 4, dueDate: `01/15/${planningYear + 1}`, amount: quarterlyAmount },
    ],
  }
}
