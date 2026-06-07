import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

import { fetchWrapper } from '@/fetchWrapper'
import type { ScheduleDFacts, TaxFactSource } from '@/types/generated/tax-preview-facts'

import ScheduleDPreview from '../ScheduleDPreview'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    put: jest.fn(),
  },
}))

const mockedFetchWrapper = fetchWrapper as jest.Mocked<typeof fetchWrapper>

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
    line4Sources: [],
    line10Sources: [],
    line11Sources: [],
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
  beforeEach(() => {
    jest.clearAllMocks()
    mockedFetchWrapper.get.mockImplementation(() => new Promise(() => {}))
    mockedFetchWrapper.put.mockResolvedValue({})
  })

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

  it('flags missing prior-year carryovers and saves manual opening amounts', async () => {
    const onCarryoverSaved = jest.fn()
    mockedFetchWrapper.get.mockResolvedValue({
      id: null,
      tax_year: 2025,
      short_term_loss_carryover: 0,
      long_term_loss_carryover: 0,
      notes: null,
    })

    render(
      <ScheduleDPreview
        taxFacts={makeFacts()}
        selectedYear={2025}
        availableYears={[2025]}
        onCarryoverSaved={onCarryoverSaved}
      />,
    )

    expect(await screen.findByText('Prior-year Schedule D not found')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Short-term loss carryover'), { target: { value: '7000' } })
    fireEvent.change(screen.getByLabelText('Long-term loss carryover'), { target: { value: '2000' } })
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'From filed 2024 return' } })
    fireEvent.click(screen.getByRole('button', { name: /save carryovers/i }))

    await waitFor(() => {
      expect(mockedFetchWrapper.put).toHaveBeenCalledWith('/api/finance/schedule-d-carryovers', {
        tax_year: 2025,
        short_term_loss_carryover: 7000,
        long_term_loss_carryover: 2000,
        notes: 'From filed 2024 return',
      })
    })
    expect(onCarryoverSaved).toHaveBeenCalledTimes(1)
  })

  it('can prefill carryovers from the prior-year preview calculation', async () => {
    mockedFetchWrapper.get.mockResolvedValue({
      id: null,
      tax_year: 2025,
      short_term_loss_carryover: 0,
      long_term_loss_carryover: 0,
      notes: null,
    })

    render(
      <ScheduleDPreview
        taxFacts={makeFacts()}
        selectedYear={2025}
        availableYears={[2025, 2024]}
        priorYearCapitalLossCarryover={{
          netShortTerm: -10000,
          netLongTerm: -5000,
          combined: -15000,
          appliedToOrdinaryIncome: 3000,
          shortTermCarryover: 7000,
          longTermCarryover: 5000,
          totalCarryover: 12000,
          hasCarryover: true,
        }}
      />,
    )

    expect(await screen.findByText('Prior-year carryover not applied')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use prior-year preview' }))

    expect(screen.getByLabelText<HTMLInputElement>('Short-term loss carryover').value).toBe('7000')
    expect(screen.getByLabelText<HTMLInputElement>('Long-term loss carryover').value).toBe('5000')
  })

  it('renders Section 1256 Form 6781 allocations on Schedule D lines 4 and 11', () => {
    render(
      <ScheduleDPreview
        taxFacts={makeFacts({
          line4Sources: [makeSource({
            id: 'section-1256-short',
            label: 'AQR — K-1 Box 11C Form 6781 40% S/T allocation',
            amount: 13018,
            formType: 'k1',
          })],
          line11Sources: [makeSource({
            id: 'section-1256-long',
            label: 'AQR — K-1 Box 11C Form 6781 60% L/T allocation',
            amount: 19527,
            formType: 'k1',
          })],
          line4GainLoss: 13018,
          line7NetShortTerm: 13018,
          line11GainLoss: 19527,
          line15NetLongTerm: 19527,
          line16Combined: 32545,
          line21LimitedLossOrGain: 32545,
        })}
        selectedYear={2025}
      />,
    )

    expect(screen.getAllByText('AQR — K-1 Box 11C Form 6781 40% S/T allocation')).toHaveLength(2)
    expect(screen.getAllByText('AQR — K-1 Box 11C Form 6781 60% L/T allocation')).toHaveLength(2)
    expect(screen.getByText(/Schedule D lines 4 and 11/)).toBeInTheDocument()
  })

  it('drills into a tax-source-detail column from Schedule D line 5', () => {
    const onOpenDetail = jest.fn()
    const facts = makeFacts({
      line5Sources: [
        makeSource({
          id: 'line5-box8',
          label: 'Partnership A — K-1 Box 8',
          amount: 1200,
          taxDocumentId: 20,
          formType: 'k1',
        }),
        makeSource({
          id: 'line5-box11s',
          label: 'Partnership A — K-1 Box 11S',
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
        onOpenDetail={onOpenDetail}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Schedule D Line 5 Supporting Details' }))

    expect(onOpenDetail).toHaveBeenCalledWith('sch-d:line-5')
  })
})
