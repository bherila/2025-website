import { computeRentVsBuy, type RentVsBuyInputs } from '@/lib/planning/rentVsBuy'

function makeInputs(overrides: Partial<RentVsBuyInputs> = {}): RentVsBuyInputs {
  return {
    homePrice: 450_000,
    downPaymentPercent: 20,
    mortgageRatePercent: 6.25,
    mortgageTermYears: 30,
    closingCostsPercent: 3,
    propertyTaxRatePercent: 1.1,
    hoaMonthly: 0,
    homeownersInsuranceAnnual: 1_800,
    maintenancePercent: 1,
    appreciationPercent: 3,
    sellingCostsPercent: 6,
    monthlyRent: 2_700,
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

describe('computeRentVsBuy', () => {
  it('finds a break-even year within the chosen horizon for balanced assumptions', () => {
    const result = computeRentVsBuy(makeInputs({
      homePrice: 300_000,
      monthlyRent: 2_600,
      mortgageRatePercent: 5,
      timeHorizonYears: 12,
    }))

    expect(result.breakEvenYear).not.toBeNull()
    expect(result.breakEvenYear).toBeGreaterThanOrEqual(1)
    expect(result.breakEvenYear).toBeLessThanOrEqual(12)
  })

  it('returns null when renting stays cheaper for the full horizon', () => {
    const result = computeRentVsBuy(makeInputs({
      homePrice: 1_250_000,
      monthlyRent: 2_100,
      propertyTaxRatePercent: 1.4,
      homeownersInsuranceAnnual: 3_000,
      maintenancePercent: 1.5,
      appreciationPercent: 1,
      investmentReturnPercent: 8,
      timeHorizonYears: 12,
    }))

    expect(result.breakEvenYear).toBeNull()
    expect(result.finalWealthDelta).toBeLessThan(0)
  })

  it('can show buying wins immediately when rent is very high relative to the home cost', () => {
    const result = computeRentVsBuy(makeInputs({
      homePrice: 180_000,
      monthlyRent: 3_200,
      mortgageRatePercent: 4.5,
      propertyTaxRatePercent: 0.6,
      maintenancePercent: 0.5,
      timeHorizonYears: 8,
    }))

    expect(result.breakEvenYear).toBe(1)
    expect(result.rows[0]?.ownCumulativeCost).toBeLessThan(result.rows[0]?.rentCumulativeCost ?? 0)
  })

  it('changes the outcome when the horizon gets longer', () => {
    const shortHorizon = computeRentVsBuy(makeInputs({
      homePrice: 550_000,
      monthlyRent: 2_850,
      appreciationPercent: 3.5,
      investmentReturnPercent: 6.5,
      timeHorizonYears: 5,
    }))
    const longHorizon = computeRentVsBuy(makeInputs({
      homePrice: 550_000,
      monthlyRent: 2_850,
      appreciationPercent: 3.5,
      investmentReturnPercent: 6.5,
      timeHorizonYears: 15,
    }))

    expect(shortHorizon.breakEvenYear).toBeNull()
    expect(longHorizon.breakEvenYear).not.toBeNull()
    expect(longHorizon.finalWealthDelta).toBeGreaterThan(shortHorizon.finalWealthDelta)
  })

  it('caps the deductible property tax at the SALT limit when itemizing', () => {
    const underCap = computeRentVsBuy(makeInputs({
      homePrice: 1_000_000,
      downPaymentPercent: 0,
      mortgageRatePercent: 8,
      propertyTaxRatePercent: 0.9,
      maintenancePercent: 0,
      homeownersInsuranceAnnual: 0,
      monthlyRent: 4_500,
      rentersInsuranceAnnual: 0,
      timeHorizonYears: 1,
      inflationRatePercent: 0,
    }))
    const overCap = computeRentVsBuy(makeInputs({
      homePrice: 1_000_000,
      downPaymentPercent: 0,
      mortgageRatePercent: 8,
      propertyTaxRatePercent: 1.2,
      maintenancePercent: 0,
      homeownersInsuranceAnnual: 0,
      monthlyRent: 4_500,
      rentersInsuranceAnnual: 0,
      timeHorizonYears: 1,
      inflationRatePercent: 0,
    }))

    expect((overCap.rows[0]?.ownCumulativeCost ?? 0) - (underCap.rows[0]?.ownCumulativeCost ?? 0)).toBeCloseTo(2_700, 0)
  })

  it('applies the marginal rate when property tax stays below the SALT cap', () => {
    const lowerTax = computeRentVsBuy(makeInputs({
      homePrice: 500_000,
      downPaymentPercent: 0,
      mortgageRatePercent: 7.5,
      propertyTaxRatePercent: 0.8,
      maintenancePercent: 0,
      homeownersInsuranceAnnual: 0,
      monthlyRent: 2_500,
      rentersInsuranceAnnual: 0,
      timeHorizonYears: 1,
      inflationRatePercent: 0,
    }))
    const higherTax = computeRentVsBuy(makeInputs({
      homePrice: 500_000,
      downPaymentPercent: 0,
      mortgageRatePercent: 7.5,
      propertyTaxRatePercent: 1,
      maintenancePercent: 0,
      homeownersInsuranceAnnual: 0,
      monthlyRent: 2_500,
      rentersInsuranceAnnual: 0,
      timeHorizonYears: 1,
      inflationRatePercent: 0,
    }))

    expect((higherTax.rows[0]?.ownCumulativeCost ?? 0) - (lowerTax.rows[0]?.ownCumulativeCost ?? 0)).toBeCloseTo(700, 0)
  })

  it('does not create a tax benefit when the standard deduction still wins', () => {
    const noTaxRate = computeRentVsBuy(makeInputs({
      homePrice: 180_000,
      downPaymentPercent: 20,
      mortgageRatePercent: 4.5,
      propertyTaxRatePercent: 0.5,
      monthlyRent: 1_800,
      marginalTaxRatePercent: 0,
      timeHorizonYears: 1,
      inflationRatePercent: 0,
    }))
    const highTaxRate = computeRentVsBuy(makeInputs({
      homePrice: 180_000,
      downPaymentPercent: 20,
      mortgageRatePercent: 4.5,
      propertyTaxRatePercent: 0.5,
      monthlyRent: 1_800,
      marginalTaxRatePercent: 37,
      timeHorizonYears: 1,
      inflationRatePercent: 0,
    }))

    expect(highTaxRate.rows[0]?.ownCumulativeCost).toBeCloseTo(noTaxRate.rows[0]?.ownCumulativeCost ?? 0, 2)
  })

  it('handles zero down payment without producing invalid values', () => {
    const result = computeRentVsBuy(makeInputs({
      downPaymentPercent: 0,
      timeHorizonYears: 3,
    }))

    expect(result.rows).toHaveLength(3)
    expect(Number.isFinite(result.rows[0]?.homeEquity ?? Number.NaN)).toBe(true)
    expect(Number.isFinite(result.rows[0]?.ownCumulativeCost ?? Number.NaN)).toBe(true)
  })

  it('treats a zero-rate or zero-term mortgage as a full-cash purchase', () => {
    const result = computeRentVsBuy(makeInputs({
      homePrice: 300_000,
      downPaymentPercent: 10,
      mortgageRatePercent: 0,
      mortgageTermYears: 30,
      appreciationPercent: 0,
      sellingCostsPercent: 6,
      maintenancePercent: 0,
      propertyTaxRatePercent: 0,
      homeownersInsuranceAnnual: 0,
      monthlyRent: 2_000,
      rentersInsuranceAnnual: 0,
      timeHorizonYears: 1,
      inflationRatePercent: 0,
    }))

    expect(result.rows[0]?.homeEquity).toBeCloseTo(282_000, 2)
  })
})
