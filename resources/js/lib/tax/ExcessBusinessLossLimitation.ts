// ExcessBusinessLossLimitation.ts
// Calculates the maximum excess business loss limitation for a given tax year.
// See IRC 461(l)(3) and inflation adjustments.

export interface ExcessBusinessLossLimitationOptions {
  taxYear: number
  isSingle?: boolean // true for single, false for married filing jointly
  costOfLivingAdjustment?: number // For future years, default 1.03
}

const KNOWN_LIMITS = [
  { tax_year: 2018, single_filers: 250000, married_filing_jointly: 500000 },
  { tax_year: 2019, single_filers: 255000, married_filing_jointly: 510000 },
  { tax_year: 2020, single_filers: 259000, married_filing_jointly: 518000 },
  { tax_year: 2021, single_filers: 262000, married_filing_jointly: 524000 },
  { tax_year: 2022, single_filers: 270000, married_filing_jointly: 540000 },
  { tax_year: 2023, single_filers: 289000, married_filing_jointly: 578000 },
  { tax_year: 2024, single_filers: 305000, married_filing_jointly: 610000 },
  { tax_year: 2025, single_filers: 317000, married_filing_jointly: 634000 },
]

/**
 * Returns the maximum excess business loss limitation for a given year.
 * For future years, applies cost-of-living adjustment to the 2025 value.
 * Note: P.L. 119-21 changes the inflation adjustment base year from 2017 to 2024
 * for tax years beginning after December 31, 2025.
 * @param options { taxYear, isSingle, costOfLivingAdjustment }
 * @returns {number} Limitation amount (rounded to nearest $1,000)
 */
export function ExcessBusinessLossLimitation({
  taxYear,
  isSingle = true,
  costOfLivingAdjustment = 1.03,
}: ExcessBusinessLossLimitationOptions): number {
  // If year is in table, return known value
  const known = KNOWN_LIMITS.find((row) => row.tax_year === taxYear)
  if (known) {
    return isSingle ? known.single_filers : known.married_filing_jointly
  }

  // For future years, use 2025 as base and apply inflation
  const baseYear = 2025
  const baseSingle = 317000
  const baseMarried = 634000

  if (taxYear > baseYear) {
    const yearsSinceBase = taxYear - baseYear
    const multiplier = Math.pow(costOfLivingAdjustment, yearsSinceBase)
    const raw = (isSingle ? baseSingle : baseMarried) * multiplier
    // Round to nearest $1,000, but ensure minimum value is $1,000
    const rounded = Math.round(raw / 1000) * 1000
    return Math.max(rounded, 1000)
  }

  // For years before 2018, use 2018 value
  return isSingle ? 250000 : 500000
}
