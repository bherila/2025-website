import { computeForm8959Lines } from '../form8959'

describe('computeForm8959Lines', () => {
  it('returns zero tax when wages are below single threshold', () => {
    const r = computeForm8959Lines(150_000, false)
    expect(r.excessWages).toBe(0)
    expect(r.additionalTax).toBe(0)
    expect(r.threshold).toBe(200_000)
  })

  it('computes 0.9% on excess over $200k (single)', () => {
    const r = computeForm8959Lines(300_000, false)
    expect(r.excessWages).toBe(100_000)
    expect(r.additionalTax).toBeCloseTo(900)
  })

  it('uses $250k threshold for MFJ', () => {
    const r = computeForm8959Lines(300_000, true)
    expect(r.threshold).toBe(250_000)
    expect(r.excessWages).toBe(50_000)
    expect(r.additionalTax).toBeCloseTo(450)
  })

  it('returns zero when wages equal threshold exactly', () => {
    const r = computeForm8959Lines(200_000, false)
    expect(r.excessWages).toBe(0)
    expect(r.additionalTax).toBe(0)
  })

  it('handles very high wages', () => {
    const r = computeForm8959Lines(2_107_541, false)
    expect(r.excessWages).toBeCloseTo(1_907_541)
    expect(r.additionalTax).toBeCloseTo(17_167.87, 0)
  })
})
