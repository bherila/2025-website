import { render, screen } from '@testing-library/react'

import EstimatedTaxPaymentsSection from '../EstimatedTaxPaymentsSection'

const estimatedTaxPayments = {
  planningYear: 2026,
  priorYearTax: 100_001,
  priorYearAgi: 200_000,
  multiplier: 1.1,
  agiThresholdApplied: 150_000,
  safeHarborAmount: 110_001.1,
  expectedWithholding: 10_000,
  netDue: 100_001.1,
  quarterlyAmount: 25_000.28,
  quarterlyPayments: [
    { paymentNumber: 1, dueDate: 'April 15, 2026', amount: 25_000.28 },
    { paymentNumber: 2, dueDate: 'June 15, 2026', amount: 25_000.28 },
    { paymentNumber: 3, dueDate: 'September 15, 2026', amount: 25_000.28 },
    { paymentNumber: 4, dueDate: 'January 15, 2027', amount: 25_000.26 },
  ],
}

describe('EstimatedTaxPaymentsSection', () => {
  it('hides the AGI threshold message when no inputs have been entered', () => {
    render(
      <EstimatedTaxPaymentsSection
        planningYear={2026}
        priorYearTax={0}
        priorYearAgi={0}
        onPriorYearTaxChange={() => {}}
        onPriorYearAgiChange={() => {}}
        estimatedTaxPayments={undefined}
        showMfsUnsupportedNotice={false}
      />,
    )

    expect(screen.queryByText(/Prior year AGI .* threshold/i)).not.toBeInTheDocument()
  })

  it('shows an MFS unsupported notice and hides computed results for married users', () => {
    render(
      <EstimatedTaxPaymentsSection
        planningYear={2026}
        priorYearTax={100_001}
        priorYearAgi={200_000}
        onPriorYearTaxChange={() => {}}
        onPriorYearAgiChange={() => {}}
        estimatedTaxPayments={estimatedTaxPayments}
        showMfsUnsupportedNotice
      />,
    )

    expect(screen.getByText(/Married Filing Separately is not yet supported/i)).toBeInTheDocument()
    expect(screen.queryByText(/Safe Harbor Computation/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/2026 Payment Schedule/i)).not.toBeInTheDocument()
  })
})
