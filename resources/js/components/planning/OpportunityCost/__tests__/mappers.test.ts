import { sampleOpportunityCostProjection } from '../__fixtures__/sampleProjection'
import { mapAnnualFreeCashFlowRows, mapLifetimeValueRows, mapLiquidityChartData, mapLiquiditySeries } from '../mappers'

describe('Opportunity Cost mappers', () => {
  it('maps liquidity data and non-color band encodings', () => {
    const rows = mapLiquidityChartData(sampleOpportunityCostProjection)
    const series = mapLiquiditySeries(sampleOpportunityCostProjection)

    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({ year: 2026, 'current-low': 30000, 'hyp-1-medium': 55000 })
    expect(series).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'current-low', strokeDasharray: '2 4' }),
      expect.objectContaining({ key: 'current-medium', strokeDasharray: undefined }),
      expect.objectContaining({ key: 'current-high', strokeDasharray: '8 4' }),
    ]))
  })

  it('maps annual free cash flow rows', () => {
    expect(mapAnnualFreeCashFlowRows(sampleOpportunityCostProjection)[5]).toMatchObject({
      year: 2028,
      jobId: 'hyp-1',
      freeCashFlow: 305000,
      exerciseOutlay: 10000,
    })
  })

  it('maps lifetime rows using server deltas', () => {
    expect(mapLifetimeValueRows(sampleOpportunityCostProjection)[1]).toMatchObject({
      jobId: 'hyp-1',
      totalValueMedium: 888000,
      cashCompDelta: 90000,
      totalValueDeltaMedium: 165000,
    })
  })
})
