import {
  mapAfterTaxAnnualFreeCashFlowRows,
  mapAfterTaxLifetimeValueRows,
  mapAfterTaxLiquidityChartData,
  mapAfterTaxSourceBreakdownRows,
  mapAnnualFreeCashFlowRows,
  mapLifetimeValueRows,
  mapLiquidityChartData,
} from '../mappers'
import { careerCompProjectionSchema } from '../types'

// Local Node-API declarations so this test does not depend on @types/node being in `types`.
declare const __dirname: string
declare const require: (id: string) => unknown

const { readFileSync } = require('node:fs') as { readFileSync: (p: string, enc: string) => string }
const { resolve } = require('node:path') as { resolve: (...parts: string[]) => string }

// Cross-language contract: the frontend asserts the SAME committed projection the PHPUnit suite
// pins (tests/Fixtures/career-comparison/golden-projection.json), not a separate hand-authored one.
const GOLDEN_FIXTURE_PATH = resolve(__dirname, '../../../../../../tests/Fixtures/career-comparison/golden-projection.json')

describe('Career Comparison backend golden projection (cross-language contract)', () => {
  const raw: unknown = JSON.parse(readFileSync(GOLDEN_FIXTURE_PATH, 'utf8'))

  it('parses the committed PHP golden fixture against the frontend Zod projection contract', () => {
    const parsed = careerCompProjectionSchema.parse(raw)

    expect(parsed.jobs.length).toBeGreaterThan(0)
    expect(parsed.jobs.every((job) => job.annual.length === parsed.horizonYears)).toBe(true)
  })

  it('feeds the chart and table mappers from the committed golden fixture', () => {
    const parsed = careerCompProjectionSchema.parse(raw)

    expect(mapLiquidityChartData(parsed)).toHaveLength(parsed.horizonYears)
    expect(mapAnnualFreeCashFlowRows(parsed)).toHaveLength(parsed.jobs.length * parsed.horizonYears)

    const rows = mapLifetimeValueRows(parsed)
    expect(rows).toHaveLength(parsed.jobs.length)
    if (parsed.currentJobId !== null) {
      const hypothetical = rows.find((row) => !row.isCurrent)
      expect(hypothetical?.totalValueDeltaMedium).not.toBeNull()
    }
  })

  it('feeds after-tax mappers from the committed golden fixture', () => {
    const parsed = careerCompProjectionSchema.parse(raw)

    const afterTaxFcfRows = mapAfterTaxAnnualFreeCashFlowRows(parsed)
    const privateOffer2028 = afterTaxFcfRows.find((row) => row.jobId === 'hyp-1' && row.year === 2028)
    expect(privateOffer2028).toMatchObject({
      isoAmtPreference: 104500,
      estimatedAmt: 15566,
      totalEstimatedTax: 54964,
      freeCashFlow: 120036,
    })

    const afterTaxLiquidityRows = mapAfterTaxLiquidityChartData(parsed)
    expect(afterTaxLiquidityRows.find((row) => row.year === 2030)?.['hyp-1-medium']).toBe(1247449.32)
    expect(afterTaxLiquidityRows.find((row) => row.year === 2035)?.['current-medium']).toBe(1787550)

    const lifetimeRows = mapAfterTaxLifetimeValueRows(parsed)
    expect(lifetimeRows.find((row) => row.jobId === 'hyp-1')).toMatchObject({
      estimatedAmt: 69760.68,
      totalValueDeltaMedium: -251759.02,
    })

    expect(mapAfterTaxSourceBreakdownRows(parsed)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        jobId: 'hyp-1',
        sourceType: 'equity_comp_iso_bargain_element',
        amount: 104500,
      }),
    ]))
  })
})
