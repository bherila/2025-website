import currency from 'currency.js'

import {
  careerCompLtvDetailColumn,
  careerCompLtvDetailYearColumn,
} from '../CareerCompLtvDetailColumn'
import { ltvDetailRouteInstance } from '../careerCompRoute'
import { DEFAULT_CAREER_COMP_INPUTS } from '../defaults'
import { careerCompProjectionSchema } from '../types'

// Local Node-API declarations so this test does not depend on @types/node being in `types`.
declare const __dirname: string
declare const require: (id: string) => unknown

const { readFileSync } = require('node:fs') as { readFileSync: (p: string, enc: string) => string }
const { resolve } = require('node:path') as { resolve: (...parts: string[]) => string }

const GOLDEN_FIXTURE_PATH = resolve(__dirname, '../../../../../../tests/Fixtures/career-comparison/golden-projection.json')
const projection = careerCompProjectionSchema.parse(JSON.parse(readFileSync(GOLDEN_FIXTURE_PATH, 'utf8')) as unknown)

function sumAmounts(rows: readonly { amount: number }[]): number {
  return rows.reduce((total, row) => currency(total).add(row.amount).value, 0)
}

describe('CareerCompLtvDetailColumn derivation', () => {
  it('builds liquid-equity annual rows that reconcile to the selected LTV cell', () => {
    const payload = careerCompLtvDetailColumn(projection, ltvDetailRouteInstance({
      jobId: 'current',
      metric: 'liquid-equity',
      band: 'medium',
    }))

    expect(payload).not.toBeNull()
    expect(payload?.total).toBe(87478.33)
    expect(sumAmounts(payload?.rows ?? [])).toBe(87478.33)
    expect(payload?.rows.find((row) => row.year === 2027)).toMatchObject({
      amount: 40250,
      shares: 479.1667,
      drillable: true,
    })
  })

  it('builds paper-equity annual changes from the winning scenario points', () => {
    const payload = careerCompLtvDetailColumn(projection, ltvDetailRouteInstance({
      jobId: 'hyp-1',
      metric: 'paper-equity',
      band: 'medium',
    }))

    expect(payload).not.toBeNull()
    expect(payload?.description).toContain('Base case')
    expect(payload?.total).toBe(320000)
    expect(sumAmounts(payload?.rows ?? [])).toBe(320000)
    expect(payload?.rows.find((row) => row.year === 2030)).toMatchObject({
      amount: 6666.33,
      stage: 'Current',
      drillable: true,
    })
  })

  it('builds level-two paper valuation inputs for a year route', () => {
    const payload = careerCompLtvDetailYearColumn(projection, DEFAULT_CAREER_COMP_INPUTS, ltvDetailRouteInstance({
      jobId: 'hyp-1',
      metric: 'paper-equity',
      band: 'medium',
      year: 2030,
    }))

    expect(payload).not.toBeNull()
    expect(payload?.total).toBe(320000)
    expect(payload?.rows.map((row) => row.label)).toEqual(expect.arrayContaining([
      'Preferred post-money valuation',
      'Diluted ownership',
      'Common FMV',
      'Gross ownership value',
      'Exercise cost',
      'Annual paper change',
    ]))
  })

  it('builds level-two cash inputs for cash comp year routes', () => {
    const payload = careerCompLtvDetailYearColumn(projection, DEFAULT_CAREER_COMP_INPUTS, ltvDetailRouteInstance({
      jobId: 'hyp-1',
      metric: 'cash-comp',
      band: 'medium',
      year: 2030,
    }))

    expect(payload).not.toBeNull()
    expect(payload?.total).toBe(195000)
    expect(payload?.rows.map((row) => row.label)).toEqual(['Salary', 'Bonus'])
  })

  it('builds level-two total inputs with cash and annual paper change', () => {
    const payload = careerCompLtvDetailYearColumn(projection, DEFAULT_CAREER_COMP_INPUTS, ltvDetailRouteInstance({
      jobId: 'hyp-1',
      metric: 'paper-total',
      band: 'medium',
      year: 2030,
    }))

    expect(payload).not.toBeNull()
    expect(payload?.total).toBe(201666.33)
    expect(payload?.rows.map((row) => row.label)).toEqual(expect.arrayContaining([
      'Salary',
      'Bonus',
      'Annual paper change',
    ]))
  })

  it('returns null for stale LTV routes', () => {
    expect(careerCompLtvDetailColumn(projection, ltvDetailRouteInstance({
      jobId: 'missing-job',
      metric: 'cash-comp',
      band: 'medium',
    }))).toBeNull()
  })
})
