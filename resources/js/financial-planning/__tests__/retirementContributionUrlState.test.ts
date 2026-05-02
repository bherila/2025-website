import {
  parseRetirementContributionUrlState,
  serializeRetirementContributionUrlState,
} from '../retirementContributionUrlState'

describe('Retirement Contribution Calculator URL state', () => {
  it('returns the fallback year when no params are present', () => {
    const result = parseRetirementContributionUrlState('', 2025)
    expect(result.year).toBe(2025)
    expect(result.w2Income).toBe(0)
    expect(result.w2Pretax).toBe(0)
    expect(result.w2RothConversion).toBe(0)
    expect(result.includeSe).toBe(true)
    expect(result.ne).toBe(0)
    expect(result.se).toBe(0)
    expect(result.catchup).toBe(false)
    expect(result.filingStatus).toBe('single')
    expect(result.magi).toBe(0)
    expect(result.taxpayerCovered).toBe(false)
    expect(result.spouseCovered).toBe(false)
    expect(result.tradIra).toBe(0)
    expect(result.rothIra).toBe(0)
  })

  it('parses all params from a query string', () => {
    const result = parseRetirementContributionUrlState(
      'year=2025&w2Income=90000&w2Pretax=15000&w2RothConversion=2500&includeSe=0&ne=120000&se=8500&catchup=1&filingStatus=marriedFilingJointly&magi=210000&taxpayerCovered=1&spouseCovered=1&tradIra=5000&rothIra=2000',
      2025,
    )
    expect(result).toEqual({
      year: 2025,
      w2Income: 90_000,
      w2Pretax: 15_000,
      w2RothConversion: 2_500,
      includeSe: false,
      ne: 120_000,
      se: 8_500,
      catchup: true,
      filingStatus: 'marriedFilingJointly',
      magi: 210_000,
      taxpayerCovered: true,
      spouseCovered: true,
      tradIra: 5_000,
      rothIra: 2_000,
    })
  })

  it('falls back to the provided default year when year param is unknown', () => {
    const result = parseRetirementContributionUrlState('year=1999', 2025)
    expect(result.year).toBe(2025)
  })

  it('coerces non-numeric dollar params to zero', () => {
    const result = parseRetirementContributionUrlState('ne=abc&se=&w2Pretax=-50&magi=bad', 2025)
    expect(result.ne).toBe(0)
    expect(result.se).toBe(0)
    expect(result.w2Pretax).toBe(0)
    expect(result.magi).toBe(0)
  })

  it('falls back to single when filing status is unknown', () => {
    const result = parseRetirementContributionUrlState('filingStatus=invalid', 2025)
    expect(result.filingStatus).toBe('single')
  })

  it('round-trips through serialize → parse without loss', () => {
    const original = {
      year: 2024,
      w2Income: 80_000,
      w2Pretax: 5_000,
      w2RothConversion: 1_200,
      includeSe: true,
      ne: 100_000,
      se: 7_065,
      catchup: true,
      filingStatus: 'headOfHousehold' as const,
      magi: 130_000,
      taxpayerCovered: true,
      spouseCovered: false,
      tradIra: 3_500,
      rothIra: 3_500,
    }
    const result = parseRetirementContributionUrlState(serializeRetirementContributionUrlState(original), 2025)
    expect(result).toEqual(original)
  })

  it('omits zero/false values from the serialized query string', () => {
    const qs = serializeRetirementContributionUrlState({
      year: 2025,
      w2Income: 0,
      w2Pretax: 0,
      w2RothConversion: 0,
      includeSe: true,
      ne: 0,
      se: 0,
      catchup: false,
      filingStatus: 'single',
      magi: 0,
      taxpayerCovered: false,
      spouseCovered: false,
      tradIra: 0,
      rothIra: 0,
    })
    expect(qs).toBe('year=2025')
  })
})
