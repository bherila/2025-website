import {
  parseCareerCompHash,
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
})
