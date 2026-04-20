import { computeForm8582Lines, RENTAL_PHASEOUT_END, RENTAL_PHASEOUT_START, RENTAL_SPECIAL_ALLOWANCE } from '../form8582'

const noActivities = { activities: [], magi: 100_000, isMarried: false }

describe('computeForm8582Lines', () => {
  it('returns zeros when no activities exist', () => {
    const r = computeForm8582Lines(noActivities)
    expect(r.activities).toHaveLength(0)
    expect(r.totalPassiveIncome).toBe(0)
    expect(r.totalPassiveLoss).toBe(0)
    expect(r.netPassiveResult).toBe(0)
    expect(r.isLossLimited).toBe(false)
  })

  it('allows all losses when passive income exceeds passive losses', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'LP A', currentIncome: 50_000, currentLoss: 0, priorYearUnallowed: 0 },
        { activityName: 'LP B', currentIncome: 0, currentLoss: -30_000, priorYearUnallowed: 0 },
      ],
      magi: 100_000,
      isMarried: false,
    })
    expect(r.netPassiveResult).toBe(20_000)
    expect(r.isLossLimited).toBe(false)
    expect(r.totalSuspendedLoss).toBe(0)
  })

  it('suspends losses when passive losses exceed passive income (high MAGI)', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'LP A', currentIncome: 10_000, currentLoss: 0, priorYearUnallowed: 0 },
        { activityName: 'LP B', currentIncome: 0, currentLoss: -50_000, priorYearUnallowed: 0 },
      ],
      magi: 200_000,
      isMarried: false,
    })
    expect(r.netPassiveResult).toBe(-40_000)
    expect(r.isLossLimited).toBe(true)
    expect(r.rentalAllowance).toBe(0)
    expect(r.totalAllowedLoss).toBe(10_000)
    expect(r.totalSuspendedLoss).toBe(30_000)
  })

  it('applies $25k rental real estate special allowance when MAGI <= $100k', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'Rental', currentIncome: 0, currentLoss: -30_000, priorYearUnallowed: 0 },
      ],
      magi: 80_000,
      isMarried: false,
    })
    expect(r.netPassiveResult).toBe(-30_000)
    expect(r.rentalAllowance).toBe(RENTAL_SPECIAL_ALLOWANCE)
    expect(r.totalAllowedLoss).toBe(25_000)
    expect(r.totalSuspendedLoss).toBe(5_000)
    expect(r.isLossLimited).toBe(true)
  })

  it('phases out rental allowance between $100k and $150k MAGI', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'Rental', currentIncome: 0, currentLoss: -50_000, priorYearUnallowed: 0 },
      ],
      magi: 120_000,
      isMarried: false,
    })
    // Phase-out: 50% × ($120k - $100k) = $10k reduction → allowance = $15k
    expect(r.rentalAllowance).toBe(15_000)
    expect(r.totalAllowedLoss).toBe(15_000)
    expect(r.totalSuspendedLoss).toBe(35_000)
  })

  it('fully phases out rental allowance at MAGI >= $150k', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'Rental', currentIncome: 0, currentLoss: -50_000, priorYearUnallowed: 0 },
      ],
      magi: RENTAL_PHASEOUT_END,
      isMarried: false,
    })
    expect(r.rentalAllowance).toBe(0)
    expect(r.totalAllowedLoss).toBe(0)
    expect(r.totalSuspendedLoss).toBe(50_000)
  })

  it('includes prior-year unallowed losses in computation', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'LP A', currentIncome: 10_000, currentLoss: -5_000, priorYearUnallowed: -20_000 },
      ],
      magi: RENTAL_PHASEOUT_START,
      isMarried: false,
    })
    // Net: 10k - 5k - 20k = -15k
    expect(r.netPassiveResult).toBe(-15_000)
    expect(r.totalPriorYearUnallowed).toBe(-20_000)
    // Allowance = full $25k, but loss is only $15k → capped at $15k
    expect(r.rentalAllowance).toBe(15_000)
    expect(r.totalAllowedLoss).toBe(25_000) // 10k income + 15k allowance
    expect(r.totalSuspendedLoss).toBe(0)
  })

  it('caps rental allowance at actual loss amount', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'Rental', currentIncome: 0, currentLoss: -10_000, priorYearUnallowed: 0 },
      ],
      magi: 80_000,
      isMarried: false,
    })
    // $25k allowance available, but loss is only $10k
    expect(r.rentalAllowance).toBe(10_000)
    expect(r.totalAllowedLoss).toBe(10_000)
    expect(r.totalSuspendedLoss).toBe(0)
    expect(r.isLossLimited).toBe(false)
  })

  it('handles multiple activities with mixed income and losses', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'Fund A', currentIncome: 20_000, currentLoss: 0, priorYearUnallowed: 0 },
        { activityName: 'Fund B', currentIncome: 0, currentLoss: -15_000, priorYearUnallowed: 0 },
        { activityName: 'Fund C', currentIncome: 0, currentLoss: -30_000, priorYearUnallowed: 0 },
      ],
      magi: 80_000,
      isMarried: false,
    })
    // Net: 20k - 15k - 30k = -25k
    expect(r.totalPassiveIncome).toBe(20_000)
    expect(r.totalPassiveLoss).toBe(-45_000)
    expect(r.netPassiveResult).toBe(-25_000)
    // Allowance: full $25k (MAGI < $100k), capped at total loss of $25k
    expect(r.rentalAllowance).toBe(25_000)
    expect(r.totalAllowedLoss).toBe(45_000) // 20k income + 25k allowance
    expect(r.totalSuspendedLoss).toBe(0)
  })

  it('correctly computes per-activity overallGainOrLoss', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'LP A', currentIncome: 5_000, currentLoss: -8_000, priorYearUnallowed: -2_000 },
      ],
      magi: 50_000,
      isMarried: false,
    })
    expect(r.activities).toHaveLength(1)
    expect(r.activities[0]!.overallGainOrLoss).toBe(-5_000)
  })

  it('exports phase-out constants correctly', () => {
    expect(RENTAL_SPECIAL_ALLOWANCE).toBe(25_000)
    expect(RENTAL_PHASEOUT_START).toBe(100_000)
    expect(RENTAL_PHASEOUT_END).toBe(150_000)
  })
})
