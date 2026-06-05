import { render, screen } from '@testing-library/react'
import React from 'react'

import type { ScheduleEFacts, TaxFactSource } from '@/types/generated/tax-preview-facts'

import ScheduleEPreview from '../ScheduleEPreview'

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

function makeFacts(overrides: Partial<ScheduleEFacts> = {}): ScheduleEFacts {
  return {
    miscIncomeSources: [],
    box1Sources: [],
    box2Sources: [],
    box3Sources: [],
    box4Sources: [],
    box11ZZSources: [],
    box13ZZSources: [],
    traderNiiSources: [],
    miscIncomeTotal: 0,
    totalBox1: 0,
    totalBox2: 0,
    totalBox3: 0,
    totalBox4: 0,
    totalBox5: 0,
    totalBox11ZZ: 0,
    totalBox13ZZ: 0,
    totalTraderNii: 0,
    form4952InvestmentInterestSources: [],
    totalForm4952InvestmentInterest: 0,
    totalPassive: 0,
    totalNonpassive: 0,
    totalNonpassiveIncome: 0,
    totalNonpassiveLoss: 0,
    grandTotal: 0,
    ...overrides,
  }
}

describe('ScheduleEPreview', () => {
  it('renders the facts loading placeholder before backend facts arrive', () => {
    render(<ScheduleEPreview taxFacts={null} selectedYear={2025} />)
    expect(screen.getByText(/schedule e facts are not loaded yet/i)).toBeInTheDocument()
  })

  it('renders 1099-MISC rental income from backend fact sources', () => {
    render(
      <ScheduleEPreview
        taxFacts={makeFacts({
          miscIncomeSources: [makeSource({
            id: 'misc-1',
            label: 'Tenant Co — 1099-MISC Schedule E income',
            amount: 1500,
          })],
          miscIncomeTotal: 1500,
          grandTotal: 1500,
        })}
        selectedYear={2025}
      />,
    )

    expect(screen.getByText('Part I — 1099-MISC Rental & Royalty Income')).toBeInTheDocument()
    expect(screen.getByText('Tenant Co — 1099-MISC Schedule E income')).toBeInTheDocument()
    expect(screen.getByText('1099-MISC rental & royalty income subtotal')).toBeInTheDocument()
    expect(screen.getAllByText('$1,500')).not.toHaveLength(0)
  })

  it('routes Box 11ZZ ordinary income/loss and Box 13ZZ deductions to Part II nonpassive', () => {
    render(
      <ScheduleEPreview
        taxFacts={makeFacts({
          box11ZZSources: [makeSource({
            id: 'box11zz',
            label: 'AQR TA DELPHI PLUS FUND, LLC — K-1 Box 11ZZ',
            amount: -74_206,
          })],
          box13ZZSources: [makeSource({
            id: 'box13zz',
            label: 'AQR TA DELPHI PLUS FUND, LLC — K-1 Box 13ZZ',
            amount: -9151,
          })],
          totalBox11ZZ: -74_206,
          totalBox13ZZ: 9151,
          totalNonpassive: -83_357,
          grandTotal: -83_357,
          totalTraderNii: -83_357,
        })}
        selectedYear={2025}
      />,
    )

    expect(screen.getByText(/AQR TA DELPHI PLUS FUND, LLC — K-1 Box 11ZZ/)).toBeInTheDocument()
    expect(screen.getByText(/AQR TA DELPHI PLUS FUND, LLC — K-1 Box 13ZZ/)).toBeInTheDocument()
    expect(screen.getByText('Schedule E combined total')).toBeInTheDocument()
    expect(screen.getAllByText('($83,357)').length).toBeGreaterThanOrEqual(1)
  })
})
