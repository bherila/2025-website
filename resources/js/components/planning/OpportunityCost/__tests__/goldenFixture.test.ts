import { mapAnnualFreeCashFlowRows, mapLifetimeValueRows, mapLiquidityChartData } from '../mappers'
import { opportunityCostProjectionSchema } from '../types'

// Local Node-API declarations so this test does not depend on @types/node being in `types`.
declare const __dirname: string
declare const require: (id: string) => unknown

const { readFileSync } = require('node:fs') as { readFileSync: (p: string, enc: string) => string }
const { resolve } = require('node:path') as { resolve: (...parts: string[]) => string }

// Cross-language contract: the frontend asserts the SAME committed projection the PHPUnit suite
// pins (tests/Fixtures/opportunity-cost/golden-projection.json), not a separate hand-authored one.
const GOLDEN_FIXTURE_PATH = resolve(__dirname, '../../../../../../tests/Fixtures/opportunity-cost/golden-projection.json')

describe('Opportunity Cost backend golden projection (cross-language contract)', () => {
  const raw: unknown = JSON.parse(readFileSync(GOLDEN_FIXTURE_PATH, 'utf8'))

  it('parses the committed PHP golden fixture against the frontend Zod projection contract', () => {
    const parsed = opportunityCostProjectionSchema.parse(raw)

    expect(parsed.jobs.length).toBeGreaterThan(0)
    expect(parsed.jobs.every((job) => job.annual.length === parsed.horizonYears)).toBe(true)
  })

  it('feeds the chart and table mappers from the committed golden fixture', () => {
    const parsed = opportunityCostProjectionSchema.parse(raw)

    expect(mapLiquidityChartData(parsed)).toHaveLength(parsed.horizonYears)
    expect(mapAnnualFreeCashFlowRows(parsed)).toHaveLength(parsed.jobs.length * parsed.horizonYears)

    const rows = mapLifetimeValueRows(parsed)
    expect(rows).toHaveLength(parsed.jobs.length)
    if (parsed.currentJobId !== null) {
      const hypothetical = rows.find((row) => !row.isCurrent)
      expect(hypothetical?.totalValueDeltaMedium).not.toBeNull()
    }
  })
})
