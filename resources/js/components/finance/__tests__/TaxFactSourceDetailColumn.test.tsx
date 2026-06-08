import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

import type {
  Form1040Facts,
  Schedule1Facts,
  ScheduleAFacts,
  ScheduleDFacts,
  TaxFactSource,
  TaxPreviewFacts,
} from '@/types/generated/tax-preview-facts'

import TaxFactSourceDetailColumn, { taxFactSourceDetailColumn } from '../TaxFactSourceDetailColumn'

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

/**
 * The derivation map only reads the slice fields each key consumes, so partial
 * casts keep the fixture focused. Slices default to empty objects.
 */
function makeFacts(slices: {
  form1040?: Partial<Form1040Facts>
  schedule1?: Partial<Schedule1Facts>
  scheduleA?: Partial<ScheduleAFacts>
  scheduleD?: Partial<ScheduleDFacts>
} = {}): TaxPreviewFacts {
  return {
    form1040: (slices.form1040 ?? {}) as Form1040Facts,
    schedule1: (slices.schedule1 ?? {}) as Schedule1Facts,
    scheduleA: (slices.scheduleA ?? {}) as ScheduleAFacts,
    scheduleD: (slices.scheduleD ?? {}) as ScheduleDFacts,
  } as TaxPreviewFacts
}

describe('taxFactSourceDetailColumn', () => {
  it('resolves a Form 1040 line key to its sources, total, and description', () => {
    const sources = [makeSource({ id: 'line25b', label: 'IRA Custodian withholding', amount: 1200 })]
    const payload = taxFactSourceDetailColumn(
      makeFacts({ form1040: { line25bSources: sources, line25b: 1200 } }),
      'form-1040:line-25b',
    )

    expect(payload).not.toBeNull()
    expect(payload!.title).toBe('Form 1040 Line 25b Supporting Details')
    expect(payload!.description).toBe('Federal income tax withheld from 1099')
    expect(payload!.sources).toBe(sources)
    expect(payload!.total).toBe(1200)
  })

  it('resolves a Schedule 1 line key to its sources, total, and signed display', () => {
    const sources = [makeSource({ id: 'line5', label: 'Partnership — Schedule E net income/loss', amount: 1200 })]
    const payload = taxFactSourceDetailColumn(
      makeFacts({ schedule1: { line5Sources: sources, line5Total: 1200 } }),
      'sch-1:line-5',
    )

    expect(payload).not.toBeNull()
    expect(payload!.title).toBe('Schedule 1 Line 5 Supporting Details')
    expect(payload!.sources).toBe(sources)
    expect(payload!.total).toBe(1200)
    expect(payload!.amountMode).toBe('signed')
    expect(payload!.positiveAmountTone).toBe('success')
  })

  it('resolves Schedule A line 9 as an absolute, destructive-toned deduction', () => {
    const sources = [makeSource({ id: 'margin', label: 'Broker — margin interest', amount: -1200 })]
    const payload = taxFactSourceDetailColumn(
      makeFacts({ scheduleA: { investmentInterestSources: sources, investmentInterestTotal: 1200 } }),
      'sch-a:line-9',
    )

    expect(payload!.title).toBe('Investment Interest Expense — Data Sources')
    expect(payload!.sources).toBe(sources)
    expect(payload!.amountMode).toBe('absolute')
    expect(payload!.positiveAmountTone).toBe('destructive')
  })

  it('selects the sales-tax sources for Schedule A line 5a when that election is active', () => {
    const salesTaxSources = [makeSource({ id: 'sales', label: 'Estimated sales tax', amount: 900 })]
    const stateIncomeTaxSources = [makeSource({ id: 'state', label: 'State income tax withheld', amount: 2000 })]
    const payload = taxFactSourceDetailColumn(
      makeFacts({
        scheduleA: {
          selectedLine5aType: 'sales_tax',
          selectedLine5aTotal: 900,
          salesTaxSources,
          stateIncomeTaxSources,
        },
      }),
      'sch-a:line-5a',
    )

    expect(payload!.sources).toBe(salesTaxSources)
    expect(payload!.total).toBe(900)
  })

  it('resolves Schedule D line 5 from its net gain/loss total', () => {
    const sources = [makeSource({ id: 'box8', label: 'Partnership A — K-1 Box 8', amount: 700 })]
    const payload = taxFactSourceDetailColumn(
      makeFacts({ scheduleD: { line5Sources: sources, line5GainLoss: 700 } }),
      'sch-d:line-5',
    )

    expect(payload!.title).toBe('Schedule D Line 5 Supporting Details')
    expect(payload!.total).toBe(700)
  })

  it('returns null for an unknown line, unknown form, missing key, or missing facts', () => {
    expect(taxFactSourceDetailColumn(makeFacts(), 'sch-1:line-99')).toBeNull()
    expect(taxFactSourceDetailColumn(makeFacts(), 'sch-z:line-1')).toBeNull()
    expect(taxFactSourceDetailColumn(makeFacts(), undefined)).toBeNull()
    expect(taxFactSourceDetailColumn(null, 'sch-1:line-5')).toBeNull()
  })
})

describe('TaxFactSourceDetailColumn', () => {
  it('renders the unavailable message for a stale key', () => {
    render(<TaxFactSourceDetailColumn facts={makeFacts()} instanceKey="sch-1:line-99" onGoToSource={jest.fn()} />)
    expect(screen.getByText(/no longer available/i)).toBeInTheDocument()
  })

  it('lists sources and invokes onGoToSource when the go-to button is clicked', () => {
    const onGoToSource = jest.fn()
    const source = makeSource({ id: 'box8', label: 'Partnership A — K-1 Box 8', amount: 700, taxDocumentId: 20, formType: 'k1' })
    render(
      <TaxFactSourceDetailColumn
        facts={makeFacts({ scheduleD: { line5Sources: [source], line5GainLoss: 700 } })}
        instanceKey="sch-d:line-5"
        onGoToSource={onGoToSource}
      />,
    )

    expect(screen.getByText('Partnership A — K-1 Box 8')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Go to K1' }))
    expect(onGoToSource).toHaveBeenCalledWith(source)
  })

  it('renders Form 1040 source field context when explicit notes are absent', () => {
    render(
      <TaxFactSourceDetailColumn
        facts={makeFacts({
          form1040: {
            line1zSources: [
              makeSource({ id: 'w2-box-1', label: 'Employer A', amount: 100_000, formType: 'w2', box: '1' }),
              makeSource({ id: 'routing-note', label: 'Employer B', amount: 5_000, routingReason: 'Routed to wages from document classification' }),
            ],
            line1z: 105_000,
          },
        })}
        instanceKey="form-1040:line-1z"
        onGoToSource={jest.fn()}
      />,
    )

    expect(screen.getByText('w2 box 1')).toBeInTheDocument()
    expect(screen.getByText('Routed to wages from document classification')).toBeInTheDocument()
  })

  it('shows an unreviewed estimate as a review-required absolute deduction', () => {
    render(
      <TaxFactSourceDetailColumn
        facts={makeFacts({
          scheduleA: {
            investmentInterestSources: [makeSource({ id: 'margin', label: 'Broker — margin interest', amount: -1200, isReviewed: false })],
            investmentInterestTotal: 1200,
          },
        })}
        instanceKey="sch-a:line-9"
        onGoToSource={jest.fn()}
      />,
    )

    expect(screen.getByText('Estimated — review required')).toBeInTheDocument()
    // Absolute mode renders the expense as a positive figure on both the source row and the total.
    expect(screen.getAllByText('$1,200.00')).toHaveLength(2)
  })
})
