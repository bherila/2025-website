import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

import type { Form4952CarryDestination, Form4952Facts, TaxFactSource } from '@/types/generated/tax-preview-facts'

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

function makeDestination(overrides: Partial<Form4952CarryDestination> = {}): Form4952CarryDestination {
  return {
    destination: 'sch-a',
    label: 'Schedule A, line 9 — itemized investment interest',
    formLine: 'Schedule A, line 9',
    grossInterest: 0,
    allowedDeduction: 0,
    carryforward: 0,
    share: 0,
    citation: 'IRC §163(d)(5)(A)(i)',
    sources: [],
    ...overrides,
  }
}

function makeFacts(overrides: Partial<Form4952Facts> = {}): Form4952Facts {
  return {
    investmentInterestSources: [],
    investmentExpenseSources: [],
    excludedInvestmentExpenseSources: [],
    materialParticipationScheduleEInterestSources: [],
    grossInvestmentIncomeFromK1Sources: [],
    qualifiedDividendSources: [],
    carryDestinations: [],
    totalInvestmentInterestExpense: 0,
    totalInvestmentExpenses: 0,
    totalExcludedInvestmentExpenses: 0,
    totalMaterialParticipationScheduleEInterest: 0,
    grossInvestmentIncomeFromScheduleB: 0,
    grossInvestmentIncomeFromK1: 0,
    grossInvestmentIncomeTotal: 0,
    line4cNetInvestmentIncomeAfterQualifiedDividends: 0,
    netInvestmentIncomeBeforeQualifiedDividendElection: 0,
    totalQualifiedDividends: 0,
    deductibleInvestmentInterestExpense: 0,
    disallowedCarryforward: 0,
    deductibleScheduleEAboveLine: 0,
    deductibleScheduleAItemized: 0,
    carryforwardScheduleE: 0,
    carryforwardScheduleA: 0,
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

  it('displays Part I interest sources as negative expenses even when stored positive', () => {
    render(
      <Form4952Preview
        form4952Facts={makeFacts({
          investmentInterestSources: [makeSource({ id: 'box13h', label: 'Partnership — Box 13H', amount: 4321 })],
          totalInvestmentInterestExpense: 4321,
        })}
      />,
    )

    // Stored positive (raw K-1 sign) but rendered as a negative expense for consistency.
    expect(screen.getAllByText('($4,321)').length).toBeGreaterThanOrEqual(1)
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

  it('opens a K-1 line 4a detail modal and goes to the source K-1 with a focus field', () => {
    const onReviewDoc = jest.fn()
    render(
      <Form4952Preview
        onReviewDoc={onReviewDoc}
        form4952Facts={makeFacts({
          grossInvestmentIncomeFromK1: 9000,
          grossInvestmentIncomeTotal: 9000,
          grossInvestmentIncomeFromK1Sources: [makeSource({
            id: 'k1-7-form4952-line4a',
            label: 'Partnership A',
            amount: 9000,
            taxDocumentId: 7,
            formType: 'k1',
            box: '20',
            code: 'A',
          })],
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /list each k-1/i }))
    expect(screen.getByText('Partnership A')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /go to k-1/i }))
    expect(onReviewDoc).toHaveBeenCalledWith(7, 'k1-code-20-a')
  })

  it('drills to Schedule B when the line 4a Schedule B row is clicked', () => {
    const onOpenScheduleB = jest.fn()
    render(
      <Form4952Preview
        onOpenScheduleB={onOpenScheduleB}
        form4952Facts={makeFacts({
          grossInvestmentIncomeFromScheduleB: 8000,
          grossInvestmentIncomeTotal: 8000,
        })}
      />,
    )

    fireEvent.click(screen.getByText('Gross investment income from Schedule B'))
    expect(onOpenScheduleB).toHaveBeenCalled()
  })

  it('renders carry destinations with pro-rata math and drills on click', () => {
    const onOpenScheduleE = jest.fn()
    render(
      <Form4952Preview
        onOpenScheduleE={onOpenScheduleE}
        form4952Facts={makeFacts({
          totalInvestmentInterestExpense: 300,
          deductibleInvestmentInterestExpense: 150,
          disallowedCarryforward: 150,
          deductibleScheduleEAboveLine: 100,
          deductibleScheduleAItemized: 50,
          carryforwardScheduleE: 100,
          carryforwardScheduleA: 50,
          netInvestmentIncomeBeforeQualifiedDividendElection: 150,
          carryDestinations: [
            makeDestination({ destination: 'sch-a', grossInterest: 100, allowedDeduction: 50, carryforward: 50, share: 1 / 3 }),
            makeDestination({
              destination: 'sch-e',
              label: 'Schedule E, Part II, line 28 — above-the-line (trader fund)',
              formLine: 'Schedule E, Part II, line 28',
              grossInterest: 200,
              allowedDeduction: 100,
              carryforward: 100,
              share: 2 / 3,
              citation: 'IRC §163(d)(5)(A)(ii); Rev. Rul. 2008-38',
            }),
          ],
        })}
      />,
    )

    expect(screen.getByText('Where the deductible carries')).toBeInTheDocument()
    expect(screen.getByText(/Schedule E, Part II, line 28/)).toBeInTheDocument()
    expect(screen.getByText(/66\.7%/)).toBeInTheDocument()

    fireEvent.click(screen.getByText(/Schedule E, Part II, line 28/))
    expect(onOpenScheduleE).toHaveBeenCalled()
  })

  it('renders info tooltips with citations on the key lines', () => {
    render(
      <Form4952Preview
        form4952Facts={makeFacts({
          grossInvestmentIncomeTotal: 1000,
          netInvestmentIncomeBeforeQualifiedDividendElection: 1000,
        })}
      />,
    )

    expect(screen.getAllByRole('button', { name: /more information/i }).length).toBeGreaterThanOrEqual(2)
  })
})
