import { parseSolo401kUrlState, serializeSolo401kUrlState } from '../solo401kUrlState'

describe('Solo 401(k) URL state', () => {
  it('returns the fallback year when no params are present', () => {
    const result = parseSolo401kUrlState('', 2025)
    expect(result.year).toBe(2025)
    expect(result.ne).toBe(0)
    expect(result.se).toBe(0)
    expect(result.w2).toBe(0)
    expect(result.catchup).toBe(false)
  })

  it('parses all params from a query string', () => {
    const result = parseSolo401kUrlState('year=2025&ne=120000&se=8500&w2=15000&catchup=1', 2025)
    expect(result).toEqual({ year: 2025, ne: 120_000, se: 8_500, w2: 15_000, catchup: true })
  })

  it('falls back to the provided default year when year param is unknown', () => {
    const result = parseSolo401kUrlState('year=1999', 2025)
    expect(result.year).toBe(2025)
  })

  it('coerces non-numeric dollar params to zero', () => {
    const result = parseSolo401kUrlState('ne=abc&se=&w2=-50', 2025)
    expect(result.ne).toBe(0)
    expect(result.se).toBe(0)
    expect(result.w2).toBe(0)
  })

  it('round-trips through serialize → parse without loss', () => {
    const original = { year: 2024, ne: 100_000, se: 7_065, w2: 5_000, catchup: true }
    const result = parseSolo401kUrlState(serializeSolo401kUrlState(original), 2025)
    expect(result).toEqual(original)
  })

  it('omits zero/false values from the serialized query string', () => {
    const qs = serializeSolo401kUrlState({ year: 2025, ne: 0, se: 0, w2: 0, catchup: false })
    expect(qs).toBe('year=2025')
  })
})
