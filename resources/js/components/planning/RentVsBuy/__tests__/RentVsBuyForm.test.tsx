import '@testing-library/jest-dom'

import { fireEvent, render, screen } from '@testing-library/react'

import RentVsBuyForm from '@/components/planning/RentVsBuy/RentVsBuyForm'
import type { RentVsBuyInputs } from '@/lib/planning/rentVsBuy'

function makeInputs(overrides: Partial<RentVsBuyInputs> = {}): RentVsBuyInputs {
  return {
    homePrice: 800_000,
    downPaymentPercent: 20,
    mortgageRatePercent: 7.25,
    mortgageTermYears: 30,
    closingCostsPercent: 3,
    propertyTaxRatePercent: 1.1,
    hoaMonthly: 350,
    homeownersInsuranceAnnual: 2_000,
    maintenancePercent: 1,
    appreciationPercent: 3,
    sellingCostsPercent: 6,
    monthlyRent: 3_500,
    rentersInsuranceAnnual: 240,
    rentIncreasePercent: 3,
    investmentReturnPercent: 6,
    marginalTaxRatePercent: 30,
    filingStatus: 'Single',
    timeHorizonYears: 10,
    inflationRatePercent: 2.5,
    ...overrides,
  }
}

describe('RentVsBuyForm', () => {
  it('formats and parses money inputs with currency.js-compatible values', () => {
    const onChange = jest.fn()

    render(<RentVsBuyForm inputs={makeInputs()} onChange={onChange} />)

    const homePrice = screen.getByDisplayValue('$800,000.00')
    expect(homePrice).toBeInTheDocument()

    fireEvent.change(homePrice, { target: { value: '$1,234,567.89' } })

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      homePrice: 1_234_567.89,
    }))
  })
})
