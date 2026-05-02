import '@testing-library/jest-dom'

import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

import RentVsBuyDetailsModal from '@/components/planning/RentVsBuy/RentVsBuyDetailsModal'
import type { RentVsBuyYearRow } from '@/lib/planning/rentVsBuy'

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open?: boolean }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}))

function makeRow(overrides: Partial<RentVsBuyYearRow> = {}): RentVsBuyYearRow {
  return {
    year: 3,
    buyNonrecoverableCosts: {
      closingCosts: 10_250.49,
      mortgageInterest: 20_400.5,
      propertyTax: 7_100,
      maintenance: 3_200,
      hoa: 1_800,
      homeownersInsurance: 2_300,
      taxBenefit: 1_500,
      total: 43_550.99,
    },
    rentNonrecoverableCosts: {
      rent: 72_400,
      rentersInsurance: 725,
      total: 73_125,
    },
    buyerPortfolio: {
      startingBalance: 0,
      cashFlowContributions: 4_200,
      investmentGrowth: 315.5,
      total: 4_515.5,
    },
    renterPortfolio: {
      startingBalance: 110_000,
      cashFlowContributions: 8_500,
      investmentGrowth: 19_755.25,
      total: 138_255.25,
    },
    homeSale: {
      homeValue: 650_000,
      sellingCosts: 39_000,
      capitalGainsTax: 8_250,
      mortgagePayoff: 410_000,
      netSaleCash: 192_750,
    },
    buyerTotalWealth: 197_265.5,
    renterTotalWealth: 138_255.25,
    wealthDelta: 59_010.25,
    ...overrides,
  }
}

describe('RentVsBuyDetailsModal', () => {
  it('renders buyer wealth details rounded to whole dollars', () => {
    render(<RentVsBuyDetailsModal row={makeRow()} section="buyer-wealth" onClose={jest.fn()} />)

    expect(screen.getByRole('heading', { name: 'Buyer total wealth - Year 3' })).toBeInTheDocument()
    expect(screen.getAllByText('Cash received at sale')).toHaveLength(2)
    expect(screen.getByText('$197,266')).toBeInTheDocument()
    expect(screen.queryByText('$197,265.50')).not.toBeInTheDocument()
  })

  it('renders tax benefits as a cost reduction', () => {
    render(<RentVsBuyDetailsModal row={makeRow()} section="buy-costs" onClose={jest.fn()} />)

    expect(screen.getByText('Tax benefit from itemizing')).toBeInTheDocument()
    expect(screen.getByText('-$1,500')).toBeInTheDocument()
  })
})
