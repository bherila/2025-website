import '@testing-library/jest-dom'

import { fireEvent, render, screen } from '@testing-library/react'

import RentVsBuyForm, { getConvertedClosingCostsValue } from '@/components/planning/RentVsBuy/RentVsBuyForm'
import type { RentVsBuyInputs } from '@/lib/planning/rentVsBuy'

function makeInputs(overrides: Partial<RentVsBuyInputs> = {}): RentVsBuyInputs {
  return {
    homePrice: 800_000,
    downPaymentPercent: 20,
    mortgageRatePercent: 7.25,
    mortgageTermYears: 30,
    closingCostsValue: 3,
    closingCostsType: 'percent',
    propertyTaxRatePercent: 1.1,
    useCaliforniaProp13: false,
    hoaAmount: 350,
    hoaPeriod: 'monthly',
    hoaGrowthPercent: 3,
    homeownersInsuranceAnnual: 2_000,
    homeownersInsuranceGrowthPercent: 3,
    maintenancePercent: 1,
    appreciationPercent: 3,
    sellingCostsPercent: 6,
    monthlyRent: 3_500,
    rentersInsuranceAmount: 240,
    rentersInsurancePeriod: 'annual',
    rentersInsuranceGrowthPercent: 3,
    rentIncreasePercent: 3,
    investmentReturnPercent: 6,
    marginalTaxRatePercent: 30,
    capitalGainsTaxRatePercent: 15,
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

  it('clarifies starting rent and updates the Prop 13 checkbox', () => {
    const onChange = jest.fn()

    render(<RentVsBuyForm inputs={makeInputs()} onChange={onChange} />)

    expect(screen.getByLabelText('Starting monthly rent')).toBeInTheDocument()
    expect(screen.getByLabelText('HOA growth')).toBeInTheDocument()
    expect(screen.getByLabelText('Insurance growth')).toBeInTheDocument()
    expect(screen.getByLabelText('Homeowners insurance (annual)')).toBeInTheDocument()
    expect(screen.getByLabelText("Renter's insurance growth")).toBeInTheDocument()
    expect(screen.getByText('Caps assessed value growth at 2% / yr')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: /CA Prop 13/ }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      useCaliforniaProp13: true,
    }))
  })

  it('converts closing costs when switching between percent and amount modes', () => {
    expect(getConvertedClosingCostsValue(makeInputs({
      homePrice: 800_000,
      closingCostsValue: 3,
      closingCostsType: 'percent',
    }), 'amount')).toBe(24_000)

    expect(getConvertedClosingCostsValue(makeInputs({
      homePrice: 800_000,
      closingCostsValue: 24_000,
      closingCostsType: 'amount',
    }), 'percent')).toBe(3)
  })
})
