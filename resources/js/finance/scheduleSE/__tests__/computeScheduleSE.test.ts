import { computeScheduleSELines } from '../computeScheduleSE'

describe('computeScheduleSELines', () => {
  it('computes Schedule SE for a single K-1 Box 14A entry', () => {
    const result = computeScheduleSELines({
      entries: [{ label: 'Acme LP — Box 14A', amount: 100_000, sourceType: 'k1_box14_a' }],
      year: 2024,
    })

    expect(result.netEarningsFromSE).toBe(100_000)
    expect(result.seTaxableEarnings).toBeCloseTo(92_350, 2)
    expect(result.socialSecurityTax).toBeCloseTo(11_451.4, 2)
    expect(result.medicareTax).toBeCloseTo(2_677.15, 2)
    expect(result.seTax).toBeCloseTo(14_128.55, 2)
    expect(result.deductibleSeTax).toBeCloseTo(7_064.28, 2)
  })

  it('sums multiple K-1 sources together', () => {
    const result = computeScheduleSELines({
      entries: [
        { label: 'LP 1 — Box 14A', amount: 40_000, sourceType: 'k1_box14_a' },
        { label: 'LP 2 — Box 14A', amount: 60_000, sourceType: 'k1_box14_a' },
      ],
      year: 2024,
    })

    expect(result.netEarningsFromSE).toBe(100_000)
    expect(result.entries).toHaveLength(2)
    expect(result.seTax).toBeCloseTo(14_128.55, 2)
  })

  it('caps the Social Security portion at the wage base', () => {
    const result = computeScheduleSELines({
      entries: [{ label: 'Large business', amount: 300_000, sourceType: 'schedule_c' }],
      year: 2024,
    })

    expect(result.seTaxableEarnings).toBeCloseTo(277_050, 2)
    expect(result.socialSecurityTaxableEarnings).toBe(168_600)
    expect(result.socialSecurityTax).toBeCloseTo(20_906.4, 2)
    expect(result.medicareTax).toBeCloseTo(8_034.45, 2)
  })

  it('computes additional Medicare tax when the threshold is crossed', () => {
    const result = computeScheduleSELines({
      entries: [{ label: 'Large business', amount: 250_000, sourceType: 'schedule_c' }],
      year: 2024,
    })

    expect(result.additionalMedicareTaxableEarnings).toBeCloseTo(30_875, 2)
    expect(result.additionalMedicareTax).toBeCloseTo(277.88, 2)
  })

  it('handles Box 14C farm income like other self-employment income', () => {
    const result = computeScheduleSELines({
      entries: [{ label: 'Farm LP — Box 14C', amount: 12_000, sourceType: 'k1_box14_c' }],
      year: 2024,
    })

    expect(result.netEarningsFromSE).toBe(12_000)
    expect(result.seTaxableEarnings).toBeCloseTo(11_082, 2)
    expect(result.seTax).toBeCloseTo(1_695.55, 2)
  })
})
