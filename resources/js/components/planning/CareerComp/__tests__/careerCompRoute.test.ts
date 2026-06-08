import {
  liquidityDetailRouteInstance,
  ltvDetailRouteInstance,
  parseCareerCompHash,
  parseLiquidityDetailRouteInstance,
  parseLtvDetailRouteInstance,
  serializeCareerCompRoute,
} from '../careerCompRoute'

describe('careerCompRoute', () => {
  it('parses empty hashes as an empty route', () => {
    expect(parseCareerCompHash('')).toEqual({ columns: [] })
    expect(parseCareerCompHash('#')).toEqual({ columns: [] })
    expect(parseCareerCompHash('#/')).toEqual({ columns: [] })
  })

  it('parses top-level form and result columns', () => {
    expect(parseCareerCompHash('#/offers/ltv-table')).toEqual({
      columns: [{ id: 'offers' }, { id: 'ltv-table' }],
    })
    expect(parseCareerCompHash('#/model-assumptions')).toEqual({
      columns: [{ id: 'model-assumptions' }],
    })
    expect(parseCareerCompHash('#/liquidity-over-time')).toEqual({
      columns: [{ id: 'liquidity-over-time' }],
    })
  })

  it('keeps the legacy after-tax liquidity hash parseable for page-level remapping', () => {
    expect(parseCareerCompHash('#/after-tax-liquidity')).toEqual({
      columns: [{ id: 'after-tax-liquidity' }],
    })
  })

  it('parses grant and valuation detail instances', () => {
    expect(parseCareerCompHash('#/offers/grant-rsu:hyp-1%3Ahyp-1-rsu-1/valuation-timeline:hyp-1')).toEqual({
      columns: [
        { id: 'offers' },
        { id: 'grant-rsu', instance: 'hyp-1:hyp-1-rsu-1' },
        { id: 'valuation-timeline', instance: 'hyp-1' },
      ],
    })
  })

  it('drops unknown column ids', () => {
    expect(parseCareerCompHash('#/offers/not-real/after-tax-fcf')).toEqual({
      columns: [{ id: 'offers' }, { id: 'after-tax-fcf' }],
    })
  })

  it('serializes routes with encoded detail instances', () => {
    expect(
      serializeCareerCompRoute({
        columns: [
          { id: 'offers' },
          { id: 'grant-opt', instance: 'hyp-1:hyp-1-opt-1' },
        ],
      }),
    ).toBe('#/offers/grant-opt:hyp-1%3Ahyp-1-opt-1')
  })

  it('round-trips LTV detail route instances', () => {
    const detailInstance = ltvDetailRouteInstance({ jobId: 'hyp-1', metric: 'liquid-total', band: 'medium' })
    const yearInstance = ltvDetailRouteInstance({ jobId: 'hyp-1', metric: 'liquid-total', band: 'medium', year: 2028 })

    expect(parseLtvDetailRouteInstance(detailInstance)).toEqual({
      jobId: 'hyp-1',
      metric: 'liquid-total',
      band: 'medium',
    })
    expect(parseLtvDetailRouteInstance(yearInstance, { requireYear: true })).toEqual({
      jobId: 'hyp-1',
      metric: 'liquid-total',
      band: 'medium',
      year: 2028,
    })
    expect(parseCareerCompHash(`#/ltv-table/ltv-detail:${encodeURIComponent(detailInstance)}/ltv-detail-year:${encodeURIComponent(yearInstance)}`)).toEqual({
      columns: [
        { id: 'ltv-table' },
        { id: 'ltv-detail', instance: detailInstance },
        { id: 'ltv-detail-year', instance: yearInstance },
      ],
    })
  })

  it('round-trips liquidity detail route instances', () => {
    const detailInstance = liquidityDetailRouteInstance({ jobId: 'hyp-1', year: 2028, band: 'medium', mode: 'afterTax' })

    expect(parseLiquidityDetailRouteInstance(detailInstance)).toEqual({
      jobId: 'hyp-1',
      year: 2028,
      band: 'medium',
      mode: 'afterTax',
    })
    expect(parseLiquidityDetailRouteInstance('jobId=hyp-1&band=medium&mode=afterTax')).toBeNull()
    expect(parseCareerCompHash(`#/liquidity-over-time/liquidity-detail:${encodeURIComponent(detailInstance)}`)).toEqual({
      columns: [
        { id: 'liquidity-over-time' },
        { id: 'liquidity-detail', instance: detailInstance },
      ],
    })
  })
})
