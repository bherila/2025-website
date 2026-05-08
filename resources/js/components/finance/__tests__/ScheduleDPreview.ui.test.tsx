import { fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'

import type { ScheduleDFacts, TaxFactSource } from '@/types/generated/tax-preview-facts'

import ScheduleDPreview from '../ScheduleDPreview'

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

function makeFacts(overrides: Partial<ScheduleDFacts> = {}): ScheduleDFacts {
  return {
    form8949Rollups: [],
    line5Sources: [],
    line3Sources: [],
    line10Sources: [],
    line12Sources: [],
    line13Sources: [],
    ambiguous11SSources: [],
    line1aGainLoss: 0,
    line1bGainLoss: 0,
    line2GainLoss: 0,
    line3GainLoss: 0,
    line4GainLoss: 0,
    line5GainLoss: 0,
    line6Carryover: 0,
    line7NetShortTerm: 0,
    line8aGainLoss: 0,
    line8bGainLoss: 0,
    line9GainLoss: 0,
    line10GainLoss: 0,
    line11GainLoss: 0,
    line12GainLoss: 0,
    line13CapitalGainDistributions: 0,
    line14Carryover: 0,
    line15NetLongTerm: 0,
    line16Combined: 0,
    line21LimitedLossOrGain: 0,
    appliedToReturn: 0,
    carryforward: 0,
    totalBusinessCapGains: 0,
    totalPersonalCapGains: 0,
    limitedBusinessCapGains: 0,
    limitedPersonalCapGains: 0,
    ambiguous11SAmount: 0,
    ...overrides,
  }
}

describe('ScheduleDPreview detail navigation', () => {
  it('renders detail buttons for Schedule D fact source rows and opens the associated tax document', () => {
    const onOpenDoc = jest.fn()
    const facts = makeFacts({
      line5Sources: [makeSource({
        id: 'k1-box8',
        label: 'Source Partnership — K-1 Box 8',
        amount: 1200,
        taxDocumentId: 10,
        formType: 'k1',
      })],
      line5GainLoss: 1200,
      line7NetShortTerm: 1200,
      line13Sources: [makeSource({
        id: 'div-cap-gain',
        label: 'Dividend Broker — capital gain distributions',
        amount: 400,
        taxDocumentId: 11,
        formType: '1099_div',
      })],
      line13CapitalGainDistributions: 400,
      line15NetLongTerm: 400,
      line16Combined: 1600,
      line21LimitedLossOrGain: 1600,
    })

    render(
      <ScheduleDPreview
        taxFacts={facts}
        selectedYear={2025}
        onOpenDoc={onOpenDoc}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open K1 detail' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open 1099-DIV detail' }))

    expect(onOpenDoc).toHaveBeenNthCalledWith(1, 10)
    expect(onOpenDoc).toHaveBeenNthCalledWith(2, 11)
  })

  it('shows backend capital loss carryovers and links line 21 back to Form 1040 line 7', () => {
    const onGoToForm1040 = jest.fn()

    render(
      <ScheduleDPreview
        taxFacts={makeFacts({
          line6Carryover: -7000,
          line14Carryover: -2000,
          line7NetShortTerm: -7000,
          line15NetLongTerm: -2000,
          line16Combined: -9000,
          line21LimitedLossOrGain: -3000,
          appliedToReturn: -3000,
          carryforward: -6000,
        })}
        selectedYear={2025}
        onGoToForm1040={onGoToForm1040}
      />,
    )

    expect(screen.getByText('2024 short-term capital loss carryover')).toBeInTheDocument()
    expect(screen.getByText('2024 long-term capital loss carryover')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Form 1040 line 7' }))

    expect(onGoToForm1040).toHaveBeenCalledTimes(1)
  })

  it('opens Schedule D line 5 supporting details with per-source navigation', () => {
    const onOpenDoc = jest.fn()
    const facts = makeFacts({
      line5Sources: [
        makeSource({
          id: 'line5-box8',
          label: 'TAX AWARE HEDGE FUND FUND, LLC — K-1 Box 8',
          amount: 1200,
          taxDocumentId: 20,
          formType: 'k1',
        }),
        makeSource({
          id: 'line5-box11s',
          label: 'TAX AWARE HEDGE FUND FUND, LLC — K-1 Box 11S',
          amount: -500,
          taxDocumentId: 20,
          formType: 'k1',
        }),
      ],
      line5GainLoss: 700,
      line7NetShortTerm: 700,
      line16Combined: 700,
      line21LimitedLossOrGain: 700,
    })

    render(
      <ScheduleDPreview
        taxFacts={facts}
        selectedYear={2025}
        onOpenDoc={onOpenDoc}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Line 5 total — short-term gain or \(loss\) from partnerships/ }))

    expect(screen.getByText('Schedule D Line 5 Supporting Details')).toBeInTheDocument()
    const modal = screen.getByRole('dialog', { name: 'Schedule D Line 5 Supporting Details' })
    expect(within(modal).getByText('TAX AWARE HEDGE FUND FUND, LLC — K-1 Box 8')).toBeInTheDocument()
    expect(within(modal).getByText('TAX AWARE HEDGE FUND FUND, LLC — K-1 Box 11S')).toBeInTheDocument()

    fireEvent.click(within(modal).getAllByRole('button', { name: 'Go to K1' })[0]!)

    expect(onOpenDoc).toHaveBeenCalledWith(20)
  })
})
