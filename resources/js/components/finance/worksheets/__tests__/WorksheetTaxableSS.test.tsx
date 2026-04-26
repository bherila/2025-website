import { computeTaxableSs } from '../WorksheetTaxableSS'

describe('computeTaxableSs', () => {
  it('returns zero when no SS benefits are entered', () => {
    const result = computeTaxableSs({
      isMarried: false,
      ssaGrossBenefits: 0,
      modifiedAgiExcludingSs: 100_000,
      taxExemptInterest: 0,
    })
    expect(result.taxableAmount).toBe(0)
    expect(result.inclusionRate).toBe(0)
  })

  it('fully excludes SS when provisional income is at or below the tier-1 threshold (single)', () => {
    // Single tier-1 threshold = 25,000. Provisional = 18,000 + 0 + (12,000 / 2) = 24,000.
    const result = computeTaxableSs({
      isMarried: false,
      ssaGrossBenefits: 12_000,
      modifiedAgiExcludingSs: 18_000,
      taxExemptInterest: 0,
    })
    expect(result.taxableAmount).toBe(0)
  })

  it('includes 50% of tier-1 excess when provisional is between tier-1 and tier-2 (MFJ)', () => {
    // MFJ: tier-1 = 32,000, tier-2 = 44,000.
    // Provisional = 30,000 + 0 + (10,000 / 2) = 35,000. Tier-1 excess = 3,000.
    // Taxable = min(½ SS = 5,000, ½ × 3,000 = 1,500) = 1,500.
    const result = computeTaxableSs({
      isMarried: true,
      ssaGrossBenefits: 10_000,
      modifiedAgiExcludingSs: 30_000,
      taxExemptInterest: 0,
    })
    expect(result.taxableAmount).toBe(1_500)
  })

  it('includes 85% of tier-2 excess plus the capped tier-1 band when provisional is above tier-2 (single)', () => {
    // Single: tier-1 = 25,000, tier-2 = 34,000. Band = 9,000, half = 4,500.
    // Provisional = 80,000 + 0 + (20,000 / 2) = 90,000. Tier-2 excess = 56,000.
    // Taxable = min(½ SS = 10,000, 4,500) + 85% × 56,000 = 4,500 + 47,600 = 52,100.
    // Cap = 85% × 20,000 = 17,000. Final = 17,000.
    const result = computeTaxableSs({
      isMarried: false,
      ssaGrossBenefits: 20_000,
      modifiedAgiExcludingSs: 80_000,
      taxExemptInterest: 0,
    })
    expect(result.taxableAmount).toBe(17_000)
    expect(result.inclusionRate).toBeCloseTo(0.85, 4)
  })

  it('includes tax-exempt interest in the provisional income calculation', () => {
    // Without tax-exempt, provisional = 20,000 + 0 + 5,000 = 25,000 → 0 taxable.
    // With 10,000 tax-exempt → provisional = 35,000, tier-1 excess = 10,000, taxable = 5,000 (½ SS).
    const result = computeTaxableSs({
      isMarried: true,
      ssaGrossBenefits: 10_000,
      modifiedAgiExcludingSs: 20_000,
      taxExemptInterest: 10_000,
    })
    expect(result.provisionalIncome).toBe(35_000)
    expect(result.taxableAmount).toBeGreaterThan(0)
  })

  it('never exceeds 85% of gross benefits', () => {
    const result = computeTaxableSs({
      isMarried: false,
      ssaGrossBenefits: 30_000,
      modifiedAgiExcludingSs: 500_000,
      taxExemptInterest: 0,
    })
    expect(result.taxableAmount).toBeLessThanOrEqual(30_000 * 0.85 + 0.01)
  })
})
