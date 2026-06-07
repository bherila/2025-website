import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

import type { Form4952Facts, TaxFactSource } from '@/types/generated/tax-preview-facts'

import Form4952DetailColumn, { form4952DetailColumn } from '../Form4952DetailColumn'

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
 * The derivation map only reads a handful of fields, so a partial cast keeps the
 * fixture focused on what each key consumes.
 */
function makeFacts(overrides: Partial<Form4952Facts> = {}): Form4952Facts {
  return {
    grossInvestmentIncomeFromK1Sources: [],
    qualifiedDividendSources: [],
    carryDestinations: [],
    line4aCalculationRows: [],
    line4cCalculationRows: [],
    line4dCalculationRows: [],
    line4eCalculationRows: [],
    ...overrides,
  } as Form4952Facts
}

describe('form4952DetailColumn', () => {
  it('returns the K-1 line 4a payload with K-1 sources and no calculation rows', () => {
    const sources = [makeSource({ id: 'k1', label: 'Partnership A', amount: 9000 })]
    const payload = form4952DetailColumn(makeFacts({ grossInvestmentIncomeFromK1Sources: sources }), 'line-4a-k1')

    expect(payload).not.toBeNull()
    expect(payload!.title).toMatch(/Gross investment income from K-1s/i)
    expect(payload!.sources).toBe(sources)
    expect(payload!.calculationRows).toEqual([])
    expect(payload!.amountMode).toBe('signed')
  })

  it('returns the line 4a payload carrying its calculation rows', () => {
    const rows = [{ label: 'Line 4a gross investment income', amount: 10000, role: 'result', note: null }]
    const payload = form4952DetailColumn(makeFacts({ line4aCalculationRows: rows }), 'line-4a')

    expect(payload!.calculationRows).toBe(rows)
  })

  it('returns the line 4d payload from its calculation rows with no sources', () => {
    const rows = [{ label: 'Line 4d net gain after zero floor', amount: 0, role: 'result', note: 'Floored at $0.' }]
    const payload = form4952DetailColumn(makeFacts({ line4dCalculationRows: rows }), 'line-4d')

    expect(payload!.sources).toEqual([])
    expect(payload!.calculationRows).toBe(rows)
  })

  it('resolves a dest-<key> instance to that carry destination’s sources as expenses', () => {
    const sources = [makeSource({ id: 'k1-13h', label: 'Trader Fund — Box 13H', amount: -200 })]
    const facts = makeFacts({
      carryDestinations: [
        {
          destination: 'sch-e',
          label: 'Schedule E, Part II, line 28',
          formLine: 'Schedule E, Part II, line 28',
          grossInterest: 200,
          allowedDeduction: 200,
          carryforward: 0,
          share: 1,
          citation: 'IRC §163(d)(5)(A)(ii)',
          sources,
        },
      ] as Form4952Facts['carryDestinations'],
    })
    const payload = form4952DetailColumn(facts, 'dest-sch-e')

    expect(payload!.title).toMatch(/Schedule E, Part II, line 28 — sources/)
    expect(payload!.sources).toBe(sources)
    expect(payload!.amountMode).toBe('expense')
  })

  it('returns null for an unknown or stale key', () => {
    expect(form4952DetailColumn(makeFacts(), 'line-99')).toBeNull()
    expect(form4952DetailColumn(makeFacts(), 'dest-nope')).toBeNull()
    expect(form4952DetailColumn(makeFacts(), undefined)).toBeNull()
  })
})

describe('Form4952DetailColumn', () => {
  it('renders the unavailable message for a stale key', () => {
    render(<Form4952DetailColumn facts={makeFacts()} instanceKey="line-99" onGoToSource={jest.fn()} />)
    expect(screen.getByText(/no longer available/i)).toBeInTheDocument()
  })

  it('lists sources and invokes onGoToSource when the go-to button is clicked', () => {
    const onGoToSource = jest.fn()
    const source = makeSource({ id: 'k1-7', label: 'Partnership A', amount: 9000, taxDocumentId: 7, formType: 'k1' })
    render(
      <Form4952DetailColumn
        facts={makeFacts({ grossInvestmentIncomeFromK1Sources: [source] })}
        instanceKey="line-4a-k1"
        onGoToSource={onGoToSource}
      />,
    )

    expect(screen.getByText('Partnership A')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /go to k-1/i }))
    expect(onGoToSource).toHaveBeenCalledWith(source)
  })
})
