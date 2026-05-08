import { render, screen } from '@testing-library/react'
import React from 'react'

import type { Form4952Facts, TaxFactSource } from '@/types/generated/tax-preview-facts'

import Form4952Preview from '../Form4952Preview'

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

function makeFacts(overrides: Partial<Form4952Facts> = {}): Form4952Facts {
  return {
    investmentInterestSources: [],
    investmentExpenseSources: [],
    excludedInvestmentExpenseSources: [],
    totalInvestmentInterestExpense: 0,
    totalInvestmentExpenses: 0,
    totalExcludedInvestmentExpenses: 0,
    grossInvestmentIncomeFromScheduleB: 0,
    grossInvestmentIncomeFromK1: 0,
    grossInvestmentIncomeTotal: 0,
    line4cNetInvestmentIncomeAfterQualifiedDividends: 0,
    netInvestmentIncomeBeforeQualifiedDividendElection: 0,
    totalQualifiedDividends: 0,
    deductibleInvestmentInterestExpense: 0,
    disallowedCarryforward: 0,
    ...overrides,
  }
}

describe('Form4952Preview', () => {
  it('renders the facts loading placeholder before backend facts arrive', () => {
    render(<Form4952Preview form4952Facts={null} />)
    expect(screen.getByText(/form 4952 facts are not loaded yet/i)).toBeInTheDocument()
  })

  it('renders the no-activity callout when backend facts are zero', () => {
    render(<Form4952Preview form4952Facts={makeFacts()} />)
    expect(screen.getByText(/no form 4952 activity detected/i)).toBeInTheDocument()
  })

  it('renders investment interest sources and deductible result from facts', () => {
    render(
      <Form4952Preview
        form4952Facts={makeFacts({
          investmentInterestSources: [makeSource({
            id: 'box13h',
            label: 'Partnership — Box 13H',
            amount: -5000,
          })],
          totalInvestmentInterestExpense: 5000,
          grossInvestmentIncomeFromScheduleB: 8000,
          grossInvestmentIncomeTotal: 8000,
          line4cNetInvestmentIncomeAfterQualifiedDividends: 8000,
          netInvestmentIncomeBeforeQualifiedDividendElection: 8000,
          deductibleInvestmentInterestExpense: 5000,
        })}
      />,
    )

    expect(screen.getByText('Partnership — Box 13H')).toBeInTheDocument()
    expect(screen.getByText('Deductible investment interest expense')).toBeInTheDocument()
    expect(screen.getAllByText('$5,000').length).toBeGreaterThanOrEqual(1)
  })

  it('renders excluded investment expenses from backend facts without recomputing them', () => {
    render(
      <Form4952Preview
        form4952Facts={makeFacts({
          excludedInvestmentExpenseSources: [makeSource({
            id: 'box20b',
            label: 'Partnership — Box 20B (investment expenses)',
            amount: -2500,
          })],
          totalExcludedInvestmentExpenses: 2500,
        })}
      />,
    )

    expect(screen.getByText('Tracked but Excluded Investment Expenses')).toBeInTheDocument()
    expect(screen.getByText('Partnership — Box 20B (investment expenses)')).toBeInTheDocument()
  })
})
