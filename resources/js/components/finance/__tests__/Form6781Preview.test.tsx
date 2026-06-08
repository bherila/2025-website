import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

import type { Form6781Facts, TaxFactSource } from '@/types/generated/tax-preview-facts'

import Form6781Preview from '../Form6781Preview'

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

function makeFacts(overrides: Partial<Form6781Facts> = {}): Form6781Facts {
  return {
    shortTermSources: [],
    longTermSources: [],
    shortTermTotal: 0,
    longTermTotal: 0,
    netGain: 0,
    ...overrides,
  }
}

describe('Form6781Preview', () => {
  it('renders the facts loading placeholder before backend facts arrive', () => {
    render(<Form6781Preview form6781Facts={null} />)
    expect(screen.getByText(/form 6781 facts are not loaded yet/i)).toBeInTheDocument()
  })

  it('renders short-term and long-term sources with totals', () => {
    render(
      <Form6781Preview
        form6781Facts={makeFacts({
          shortTermSources: [makeSource({
            id: 'section-1256-short',
            label: 'Section 1256 Fund — K-1 Box 11C Form 6781 40% S/T allocation',
            amount: 13018,
            notes: 'Section 1256 contracts',
          })],
          longTermSources: [makeSource({
            id: 'section-1256-long',
            label: 'Section 1256 Fund — K-1 Box 11C Form 6781 60% L/T allocation',
            amount: 19527,
          })],
          shortTermTotal: 13018,
          longTermTotal: 19527,
          netGain: 32545,
        })}
      />,
    )

    expect(screen.getByText('Section 1256 Fund — K-1 Box 11C Form 6781 40% S/T allocation')).toBeInTheDocument()
    expect(screen.getByText('Section 1256 Fund — K-1 Box 11C Form 6781 60% L/T allocation')).toBeInTheDocument()
    expect(screen.getByText('Section 1256 contracts')).toBeInTheDocument()
    expect(screen.getByText('Total short-term allocation to Schedule D line 4')).toBeInTheDocument()
    expect(screen.getByText('Total long-term allocation to Schedule D line 11')).toBeInTheDocument()
    expect(screen.getByText('Net Section 1256 gain or (loss)')).toBeInTheDocument()
    expect(screen.getAllByText('$32,545').length).toBeGreaterThanOrEqual(1)
  })

  it('drills to Schedule D and opens source documents', () => {
    const onGoToScheduleD = jest.fn()
    const onOpenDoc = jest.fn()

    render(
      <Form6781Preview
        onGoToScheduleD={onGoToScheduleD}
        onOpenDoc={onOpenDoc}
        form6781Facts={makeFacts({
          shortTermSources: [makeSource({
            id: 'section-1256-short',
            label: 'Section 1256 Fund — K-1 Box 11C Form 6781 40% S/T allocation',
            amount: 13018,
            taxDocumentId: 12,
            formType: 'k1',
          })],
          shortTermTotal: 13018,
          netGain: 13018,
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Go to Schedule D' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open K1 detail' }))

    expect(onGoToScheduleD).toHaveBeenCalledTimes(1)
    expect(onOpenDoc).toHaveBeenCalledWith(12)
  })

  it('renders an empty state when there are no Section 1256 sources', () => {
    render(<Form6781Preview form6781Facts={makeFacts()} />)

    expect(screen.getByText(/no form 6781 activity detected/i)).toBeInTheDocument()
    expect(screen.getByText('No short-term Section 1256 sources')).toBeInTheDocument()
    expect(screen.getByText('No long-term Section 1256 sources')).toBeInTheDocument()
  })
})
