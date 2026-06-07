import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

import type { Form4952AmtFacts, Form4952CarryDestination, Form4952Facts, TaxFactSource } from '@/types/generated/tax-preview-facts'

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

function makeAmt(overrides: Partial<Form4952AmtFacts> = {}): Form4952AmtFacts {
  return {
    line1to3InvestmentInterest: 0,
    line4aGrossInvestmentIncome: 0,
    line4bQualifiedDividends: 0,
    line4cAfterQualifiedDividends: 0,
    line4dNetGainFromDisposition: 0,
    line4eNetCapitalGainFromDisposition: 0,
    line4fNetShortTermFromDisposition: 0,
    line4gElected: 0,
    line4hTotalInvestmentIncome: 0,
    line5InvestmentExpenses: 0,
    line6NetInvestmentIncome: 0,
    line7DisallowedCarryforward: 0,
    line8DeductibleInvestmentInterest: 0,
    line2cAdjustment: 0,
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
    allocationMethod: 'pro_rata',
    allocationMethodDescription: 'Pro-rata allocation under Rev. Rul. 2008-38.',
    tracingSplitSources: [],
    line4aCalculationRows: [],
    line4cCalculationRows: [],
    line4dCalculationRows: [],
    line4eCalculationRows: [],
    line4dNetGainFromDisposition: 0,
    line4eNetCapitalGainFromDisposition: 0,
    line4fNetShortTermFromDisposition: 0,
    line4gElectedQualifiedDividendsAndGain: 0,
    line4hTotalInvestmentIncome: 0,
    line5InvestmentExpenses: 0,
    line5TcjaSuspended: true,
    line5SuspensionReason: '§67(g) (TCJA) suspends §212 investment expenses for 2025.',
    line6NetInvestmentIncome: 0,
    electionNiiWithoutElection: 0,
    electionExcessInvestmentInterest: 0,
    electionAvailableForElection: 0,
    electionMaxBeneficial: 0,
    recommendedElection: 0,
    line18AllowedDeduction: 0,
    line19aScheduleEPassthru: 0,
    line20ScheduleAItemized: 0,
    amt: makeAmt(),
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

  it('renders Part III line 7 as the carryforward and line 8 as the deduction (not swapped)', () => {
    render(
      <Form4952Preview
        form4952Facts={makeFacts({
          investmentInterestSources: [makeSource({ id: 'box13h', label: 'Partnership — Box 13H', amount: -5300 })],
          totalInvestmentInterestExpense: 5300,
          grossInvestmentIncomeTotal: 5000,
          line4cNetInvestmentIncomeAfterQualifiedDividends: 5000,
          line4hTotalInvestmentIncome: 5000,
          line6NetInvestmentIncome: 5000,
          deductibleInvestmentInterestExpense: 5000,
          disallowedCarryforward: 300,
        })}
      />,
    )

    // Line 8 = the deduction (smaller of line 3 or line 6).
    expect(screen.getAllByText('Investment interest expense deduction').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('$5,000').length).toBeGreaterThanOrEqual(1)
    // Line 7 = the disallowed carryforward.
    expect(screen.getByText(/Disallowed investment interest carried forward/i)).toBeInTheDocument()
    expect(screen.getAllByText('$300').length).toBeGreaterThanOrEqual(1)
    // The box references for the two Part III lines are present.
    expect(screen.getAllByText('7.').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('8.').length).toBeGreaterThanOrEqual(1)
  })

  it('renders the summary block with NII, carryforward and deduction', () => {
    render(
      <Form4952Preview
        form4952Facts={makeFacts({
          totalInvestmentInterestExpense: 5300,
          grossInvestmentIncomeTotal: 5000,
          line6NetInvestmentIncome: 5000,
          deductibleInvestmentInterestExpense: 5000,
          disallowedCarryforward: 300,
        })}
      />,
    )

    expect(screen.getByText('Summary')).toBeInTheDocument()
    expect(screen.getByText('Net investment income (NII)')).toBeInTheDocument()
    expect(screen.getByText('Qualified-dividend election')).toBeInTheDocument()
    // Carryforward > 0 with no QD/cap-gain available → election cannot help; excess carries forward.
    expect(screen.getByText(/No election available — the excess carries forward/i)).toBeInTheDocument()
  })

  it('shows "no election needed" only when the deduction is fully allowed', () => {
    render(
      <Form4952Preview
        form4952Facts={makeFacts({
          totalInvestmentInterestExpense: 5000,
          grossInvestmentIncomeTotal: 8000,
          line6NetInvestmentIncome: 8000,
          deductibleInvestmentInterestExpense: 5000,
          disallowedCarryforward: 0,
        })}
      />,
    )

    expect(screen.getByText(/Not needed — interest is fully deductible/i)).toBeInTheDocument()
    expect(screen.getByText(/No QD Election Needed/i)).toBeInTheDocument()
  })

  it('labels Part I source rows with box "1" and never the bogus "1a"', () => {
    render(
      <Form4952Preview
        form4952Facts={makeFacts({
          investmentInterestSources: [makeSource({ id: 'box13h', label: 'Partnership — Box 13H', amount: -5000 })],
          totalInvestmentInterestExpense: 5000,
        })}
      />,
    )

    expect(screen.getAllByText('1.').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('1a.')).not.toBeInTheDocument()
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

    expect(screen.getAllByText('($4,321)').length).toBeGreaterThanOrEqual(1)
  })

  it('warns when a source has not been reviewed', () => {
    render(
      <Form4952Preview
        form4952Facts={makeFacts({
          investmentInterestSources: [makeSource({ id: 'm1', label: 'Margin interest paid', amount: -5000, isReviewed: false, reviewStatus: 'needs_review' })],
          totalInvestmentInterestExpense: 5000,
        })}
      />,
    )

    expect(screen.getByText(/not yet reviewed/i)).toBeInTheDocument()
    // "Margin interest paid" appears both in the warning and the Part I row.
    expect(screen.getAllByText(/Margin interest paid/).length).toBeGreaterThanOrEqual(1)
  })

  it('renders excluded investment expenses from backend facts without recomputing them', () => {
    render(
      <Form4952Preview
        form4952Facts={makeFacts({
          excludedInvestmentExpenseSources: [makeSource({ id: 'box20b', label: 'Partnership — Box 20B (investment expenses)', amount: -2500 })],
          totalExcludedInvestmentExpenses: 2500,
        })}
      />,
    )

    expect(screen.getByText('Tracked but Excluded Investment Expenses')).toBeInTheDocument()
    expect(screen.getByText('Partnership — Box 20B (investment expenses)')).toBeInTheDocument()
  })

  it('renders lines 4d–4f for a disposition-gain year', () => {
    render(
      <Form4952Preview
        form4952Facts={makeFacts({
          totalInvestmentInterestExpense: 200,
          grossInvestmentIncomeTotal: 150,
          line4cNetInvestmentIncomeAfterQualifiedDividends: 150,
          line4dNetGainFromDisposition: 400,
          line4eNetCapitalGainFromDisposition: 300,
          line4fNetShortTermFromDisposition: 100,
          line4hTotalInvestmentIncome: 250,
          line6NetInvestmentIncome: 250,
          deductibleInvestmentInterestExpense: 200,
        })}
      />,
    )

    expect(screen.getByText(/Net gain from disposition of investment property/i)).toBeInTheDocument()
    expect(screen.getByText(/Net short-term gain/i)).toBeInTheDocument()
    expect(screen.getAllByText('4d.').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('4f.').length).toBeGreaterThanOrEqual(1)
  })

  it('renders the Special Election Smart Worksheet when qualified dividends are present', () => {
    render(
      <Form4952Preview
        form4952Facts={makeFacts({
          totalInvestmentInterestExpense: 500,
          grossInvestmentIncomeTotal: 200,
          totalQualifiedDividends: 150,
          line4cNetInvestmentIncomeAfterQualifiedDividends: 50,
          line4hTotalInvestmentIncome: 50,
          line6NetInvestmentIncome: 50,
          deductibleInvestmentInterestExpense: 50,
          disallowedCarryforward: 450,
          electionNiiWithoutElection: 50,
          electionExcessInvestmentInterest: 450,
          electionAvailableForElection: 150,
          electionMaxBeneficial: 150,
          recommendedElection: 150,
        })}
      />,
    )

    expect(screen.getByText(/Special Election Smart Worksheet/i)).toBeInTheDocument()
    expect(screen.getByText(/Maximum beneficial election/i)).toBeInTheDocument()
    expect(screen.getByText(/Electing \$150 would unlock additional deduction/i)).toBeInTheDocument()
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

  it('drills to Schedule B when the line 4a Schedule B destination button is clicked', () => {
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

    fireEvent.click(screen.getByRole('button', { name: /open schedule b/i }))
    expect(onOpenScheduleB).toHaveBeenCalled()
  })

  it('opens line 4a and 4d calculation dialogs from icon-only source buttons', () => {
    render(
      <Form4952Preview
        form4952Facts={makeFacts({
          grossInvestmentIncomeFromScheduleB: 8000,
          grossInvestmentIncomeFromK1: 2000,
          grossInvestmentIncomeTotal: 10000,
          line4cNetInvestmentIncomeAfterQualifiedDividends: 7000,
          totalQualifiedDividends: 3000,
          line4aCalculationRows: [
            { label: 'Schedule B investment income', amount: 8000, role: 'input', note: null },
            { label: 'K-1 investment income', amount: 2000, role: 'input', note: null },
            { label: 'Line 4a gross investment income', amount: 10000, role: 'result', note: null },
          ],
          line4cCalculationRows: [
            { label: 'Line 4a gross investment income', amount: 10000, role: 'input', note: null },
            { label: 'Line 4b qualified dividends included on line 4a', amount: -3000, role: 'subtract', note: null },
            { label: 'Line 4c income after qualified dividends', amount: 7000, role: 'result', note: null },
          ],
          line4dCalculationRows: [
            { label: 'Schedule D line 16 combined gain or loss', amount: -400, role: 'input', note: null },
            { label: 'Line 4d net gain after zero floor', amount: 0, role: 'result', note: 'Form 4952 line 4d cannot be less than $0.' },
          ],
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /show line 4a sources and calculation/i }))
    expect(screen.getByText('Schedule B investment income')).toBeInTheDocument()
    expect(screen.getAllByText('Line 4a gross investment income').length).toBeGreaterThanOrEqual(1)

    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    fireEvent.click(screen.getByRole('button', { name: /show line 4d calculation/i }))
    expect(screen.getByText('Schedule D line 16 combined gain or loss')).toBeInTheDocument()
    expect(screen.getByText(/cannot be less than \$0/i)).toBeInTheDocument()
  })

  it('renders the 18–20 allocation with pro-rata math and drills on click', () => {
    const onOpenScheduleE = jest.fn()
    render(
      <Form4952Preview
        onOpenScheduleE={onOpenScheduleE}
        form4952Facts={makeFacts({
          totalInvestmentInterestExpense: 300,
          deductibleInvestmentInterestExpense: 150,
          disallowedCarryforward: 150,
          line18AllowedDeduction: 150,
          line19aScheduleEPassthru: 100,
          line20ScheduleAItemized: 50,
          deductibleScheduleEAboveLine: 100,
          deductibleScheduleAItemized: 50,
          carryforwardScheduleE: 100,
          carryforwardScheduleA: 50,
          line6NetInvestmentIncome: 150,
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

    expect(screen.getByText(/Allocation of the Deduction/i)).toBeInTheDocument()
    expect(screen.getByText(/Schedule E, Part II, line 28/)).toBeInTheDocument()
    expect(screen.getByText(/66\.7%/)).toBeInTheDocument()
    expect(screen.getAllByText('19a.').length).toBeGreaterThanOrEqual(1)

    fireEvent.click(screen.getByRole('button', { name: /open schedule e, part ii, line 28/i }))
    expect(onOpenScheduleE).toHaveBeenCalled()
  })

  it('drills into a carry destination’s own sources', () => {
    render(
      <Form4952Preview
        form4952Facts={makeFacts({
          totalInvestmentInterestExpense: 200,
          deductibleInvestmentInterestExpense: 200,
          line18AllowedDeduction: 200,
          line19aScheduleEPassthru: 200,
          deductibleScheduleEAboveLine: 200,
          line6NetInvestmentIncome: 300,
          carryDestinations: [
            makeDestination({
              destination: 'sch-e',
              label: 'Schedule E, Part II, line 28 — above-the-line (trader fund)',
              grossInterest: 200,
              allowedDeduction: 200,
              share: 1,
              sources: [makeSource({ id: 'k1-9-13H-0-schedule-e', label: 'Trader Fund — Box 13H', amount: -200 })],
            }),
          ],
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /list the sources allocated here/i }))
    expect(screen.getByText('Trader Fund — Box 13H')).toBeInTheDocument()
  })

  it('renders tracing split inputs and method note when tracing allocation is present', () => {
    render(
      <Form4952Preview
        form4952Facts={makeFacts({
          totalInvestmentInterestExpense: 200,
          deductibleInvestmentInterestExpense: 100,
          disallowedCarryforward: 100,
          line18AllowedDeduction: 100,
          line19aScheduleEPassthru: 60,
          line20ScheduleAItemized: 40,
          deductibleScheduleEAboveLine: 60,
          deductibleScheduleAItemized: 40,
          carryforwardScheduleE: 60,
          carryforwardScheduleA: 40,
          line6NetInvestmentIncome: 100,
          allocationMethod: 'tracing',
          allocationMethodDescription: 'Tracing inputs under Treas. Reg. §1.163-8T set the category gross amounts.',
          tracingSplitSources: [{
            sourceId: 'k1-1-13H-0',
            label: 'Trader Fund — Box 13H',
            grossInterest: 200,
            scheduleAInterest: 80,
            scheduleEInterest: 120,
            scheduleAShare: 0.4,
            scheduleEShare: 0.6,
            taxDocumentId: 1,
            formType: 'k1',
            box: '13',
            code: 'H',
          }],
          carryDestinations: [
            makeDestination({ destination: 'sch-a', grossInterest: 80, allowedDeduction: 40, carryforward: 40, share: 0.4 }),
            makeDestination({
              destination: 'sch-e',
              label: 'Schedule E, Part II, line 28 — above-the-line (trader fund)',
              formLine: 'Schedule E, Part II, line 28',
              grossInterest: 120,
              allowedDeduction: 60,
              carryforward: 60,
              share: 0.6,
              citation: 'IRC §163(d)(5)(A)(ii); Rev. Rul. 2008-38',
            }),
          ],
        })}
      />,
    )

    expect(screen.getAllByText(/Tracing-based:/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Schedule A traced gross')).toBeInTheDocument()
    expect(screen.getByText('Schedule E traced gross')).toBeInTheDocument()
    expect(screen.getByText(/collateral securing the debt does not control/i)).toBeInTheDocument()
  })

  it('renders the AMT block surfacing the Form 6251 line 2c adjustment', () => {
    render(
      <Form4952Preview
        form4952Facts={makeFacts({
          totalInvestmentInterestExpense: 5000,
          deductibleInvestmentInterestExpense: 5000,
          line6NetInvestmentIncome: 8000,
          amt: makeAmt({ line8DeductibleInvestmentInterest: 5000, line2cAdjustment: 0 }),
        })}
      />,
    )

    expect(screen.getByText('Alternative Minimum Tax (Form 4952 AMT)')).toBeInTheDocument()
    expect(screen.getByText(/Form 6251 line 2c adjustment/i)).toBeInTheDocument()
    expect(screen.getByText(/the AMT deduction equals the regular-tax deduction/i)).toBeInTheDocument()
  })

  it('renders info tooltips with citations on the key lines', () => {
    render(
      <Form4952Preview
        form4952Facts={makeFacts({
          grossInvestmentIncomeTotal: 1000,
          line6NetInvestmentIncome: 1000,
        })}
      />,
    )

    expect(screen.getAllByRole('button', { name: /more information/i }).length).toBeGreaterThanOrEqual(2)
  })
})
