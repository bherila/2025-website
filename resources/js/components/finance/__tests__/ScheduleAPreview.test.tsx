import { fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'

import type { ScheduleAFacts, TaxFactSource } from '@/types/generated/tax-preview-facts'

import ScheduleAPreview from '../ScheduleAPreview'

function makeSource(overrides: Partial<TaxFactSource> = {}): TaxFactSource {
  return {
    sourceType: 'test',
    routing: null,
    id: 'source-1',
    label: 'Test source',
    amount: 0,
    taxDocumentId: null,
    taxDocumentAccountId: null,
    accountId: null,
    formType: null,
    box: null,
    code: null,
    routingReason: null,
    notes: null,
    isReviewed: true,
    reviewStatus: 'reviewed',
    reviewAction: null,
    ...overrides,
  }
}

function makeFacts(overrides: Partial<ScheduleAFacts> = {}): ScheduleAFacts {
  return {
    stateIncomeTaxSources: [],
    salesTaxSources: [],
    realEstateTaxSources: [],
    mortgageInterestSources: [],
    investmentInterestSources: [],
    charitableCashSources: [],
    charitableNoncashSources: [],
    otherItemizedSources: [],
    stateIncomeTaxTotal: 0,
    salesTaxTotal: 0,
    selectedLine5aType: 'state_income_tax',
    selectedLine5aTotal: 0,
    realEstateTaxTotal: 0,
    saltPaidBeforeCap: 0,
    saltCap: 10_000,
    saltDeduction: 0,
    saltCapMagi: null,
    saltCapUsesEstimatedMagi: false,
    saltCapNeedsMagi: false,
    mortgageInterestTotal: 0,
    grossInvestmentInterestTotal: 0,
    investmentInterestTotal: 0,
    disallowedInvestmentInterest: 0,
    totalInterest: 0,
    charitableCashTotal: 0,
    charitableNoncashTotal: 0,
    charitableTotal: 0,
    otherItemizedTotal: 0,
    totalItemizedDeductions: 0,
    standardDeductionSingle: 15_000,
    standardDeductionMarriedFilingJointly: 30_000,
    shouldItemizeSingle: false,
    shouldItemizeMarriedFilingJointly: false,
    ...overrides,
  }
}

describe('ScheduleAPreview', () => {
  it('renders the facts loading placeholder before backend facts arrive', () => {
    render(<ScheduleAPreview selectedYear={2025} scheduleAFacts={null} />)
    expect(screen.getByText(/schedule a facts are not loaded yet/i)).toBeInTheDocument()
  })

  it('renders itemized deduction totals from backend facts', () => {
    render(
      <ScheduleAPreview
        selectedYear={2025}
        scheduleAFacts={makeFacts({
          stateIncomeTaxTotal: 12_000,
          selectedLine5aTotal: 12_000,
          saltPaidBeforeCap: 12_000,
          saltDeduction: 10_000,
          mortgageInterestTotal: 5000,
          totalInterest: 5000,
          charitableCashTotal: 2000,
          charitableTotal: 2000,
          totalItemizedDeductions: 17_000,
          shouldItemizeSingle: true,
        })}
      />,
    )

    expect(screen.getByText('State income tax withheld / estimated tax paid')).toBeInTheDocument()
    expect(screen.getByText('Itemized deductions (Schedule A total)')).toBeInTheDocument()
    expect(screen.getAllByText('$17,000').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('✓ Itemizing saves more — use Schedule A')).toBeInTheDocument()
  })

  it('opens source attribution from Schedule A fact sources', () => {
    render(
      <ScheduleAPreview
        selectedYear={2025}
        scheduleAFacts={makeFacts({
          investmentInterestSources: [makeSource({
            id: 'margin-interest',
            label: 'Broker — margin interest',
            amount: -1200,
          })],
          grossInvestmentInterestTotal: 1200,
          investmentInterestTotal: 1200,
          totalInterest: 1200,
          totalItemizedDeductions: 1200,
        })}
      />,
    )

    fireEvent.click(screen.getByText('Investment interest expense (from Form 4952)'))
    const modal = screen.getByRole('dialog', { name: 'Investment Interest Expense — Data Sources' })
    expect(within(modal).getByText('Broker — margin interest')).toBeInTheDocument()
  })
})
