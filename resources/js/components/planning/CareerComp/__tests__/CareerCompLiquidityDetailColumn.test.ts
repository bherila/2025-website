import currency from 'currency.js'

import { sampleCareerCompProjection } from '../__fixtures__/sampleProjection'
import { careerCompLiquidityDetailColumn } from '../CareerCompLiquidityDetailColumn'
import { liquidityDetailRouteInstance } from '../careerCompRoute'
import type { CareerCompProjection } from '../types'

function sumMoney(values: readonly number[]): number {
  return values.reduce((total, value) => currency(total).add(value).value, 0)
}

function projectionWithAfterTax(projection: CareerCompProjection): CareerCompProjection {
  return {
    ...projection,
    jobs: projection.jobs.map((job) => {
      const afterTaxAnnual = job.annual.map((annual) => {
        const totalEstimatedTax = job.id === 'hyp-1' ? 30000 : 20000

        return {
          year: annual.year,
          taxableCompIncome: 0,
          totalTaxableIncome: 0,
          nsoOrdinaryIncome: 0,
          isoAmtPreference: 0,
          equitySaleProceeds: annual.shareSaleProceeds,
          equityCapitalGain: annual.equityCapitalGain,
          estimatedRegularTax: totalEstimatedTax,
          estimatedAmt: 0,
          totalEstimatedTax,
          freeCashFlow: currency(annual.freeCashFlow).subtract(totalEstimatedTax).value,
          sourceIds: [],
        }
      })

      return {
        ...job,
        afterTax: {
          annual: afterTaxAnnual,
          lifetime: {
            taxableCompIncome: 0,
            totalTaxableIncome: 0,
            nsoOrdinaryIncome: 0,
            isoAmtPreference: 0,
            equitySaleProceeds: sumMoney(afterTaxAnnual.map((annual) => annual.equitySaleProceeds)),
            equityCapitalGain: sumMoney(afterTaxAnnual.map((annual) => annual.equityCapitalGain)),
            estimatedRegularTax: sumMoney(afterTaxAnnual.map((annual) => annual.estimatedRegularTax)),
            estimatedAmt: 0,
            totalEstimatedTax: sumMoney(afterTaxAnnual.map((annual) => annual.totalEstimatedTax)),
            freeCashFlow: sumMoney(afterTaxAnnual.map((annual) => annual.freeCashFlow)),
            totalValue: job.lifetime.totalValue,
          },
          sources: [],
          form6251: [],
        },
      }
    }),
  }
}

function sumAmounts(rows: readonly { amount: number }[]): number {
  return rows.reduce((total, row) => currency(total).add(row.amount).value, 0)
}

describe('CareerCompLiquidityDetailColumn derivation', () => {
  it('builds a before-tax liquidity breakdown from mapper and projection values', () => {
    const payload = careerCompLiquidityDetailColumn(sampleCareerCompProjection, liquidityDetailRouteInstance({
      jobId: 'hyp-1',
      year: 2027,
      band: 'medium',
      mode: 'preTax',
    }))

    expect(payload).not.toBeNull()
    expect(payload?.title).toBe('Offer 1 2027 before-tax liquidity')
    expect(payload?.finalAmount).toBe(116000)
    expect(sumAmounts(payload?.includedRows ?? [])).toBe(116000)
    expect(payload?.includedRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Med cumulative liquid equity', amount: 116000 }),
    ]))
    expect(payload?.contextRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Cumulative cash compensation', amount: 465000 }),
      expect.objectContaining({ label: 'Cumulative exercise outlay', amount: -20000 }),
    ]))
  })

  it('builds an after-tax liquidity breakdown without duplicating tax math', () => {
    const projection = projectionWithAfterTax(sampleCareerCompProjection)
    const payload = careerCompLiquidityDetailColumn(projection, liquidityDetailRouteInstance({
      jobId: 'hyp-1',
      year: 2028,
      band: 'medium',
      mode: 'afterTax',
    }))

    expect(payload).not.toBeNull()
    expect(payload?.title).toBe('Offer 1 2028 after-tax liquidity')
    expect(payload?.finalAmount).toBe(918000)
    expect(sumAmounts(payload?.includedRows ?? [])).toBe(918000)
    expect(payload?.includedRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'After-tax cash-flow base', amount: 735000 }),
      expect.objectContaining({ label: 'Med cumulative liquid equity', amount: 183000 }),
    ]))
    expect(payload?.contextRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Backend tax adjustment reflected', amount: -90000 }),
      expect.objectContaining({ label: 'Medium equity proceeds removed', amount: -25000 }),
    ]))
  })

  it('returns null when a liquidity detail route is stale', () => {
    expect(careerCompLiquidityDetailColumn(sampleCareerCompProjection, liquidityDetailRouteInstance({
      jobId: 'missing-job',
      year: 2027,
      band: 'medium',
      mode: 'preTax',
    }))).toBeNull()

    expect(careerCompLiquidityDetailColumn(sampleCareerCompProjection, liquidityDetailRouteInstance({
      jobId: 'hyp-1',
      year: 2027,
      band: 'medium',
      mode: 'afterTax',
    }))).toBeNull()
  })
})
