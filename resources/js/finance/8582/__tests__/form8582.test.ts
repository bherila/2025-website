import { computeForm8582Lines, RENTAL_PHASEOUT_END, RENTAL_PHASEOUT_START, RENTAL_SPECIAL_ALLOWANCE, RENTAL_SPECIAL_ALLOWANCE_MFS } from '../form8582'

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
        { activityName: 'LP A', isRentalRealEstate: false, currentIncome: 50_000, currentLoss: 0, priorYearUnallowed: 0 },
        { activityName: 'LP B', isRentalRealEstate: false, currentIncome: 0, currentLoss: -30_000, priorYearUnallowed: 0 },
      ],
      magi: 100_000,
      isMarried: false,
    })
    expect(r.netPassiveResult).toBe(20_000)
    expect(r.isLossLimited).toBe(false)
    expect(r.totalSuspendedLoss).toBe(0)
  })

  it('suspends losses when passive losses exceed passive income (high MAGI, non-rental)', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'LP A', isRentalRealEstate: false, currentIncome: 10_000, currentLoss: 0, priorYearUnallowed: 0 },
        { activityName: 'LP B', isRentalRealEstate: false, currentIncome: 0, currentLoss: -50_000, priorYearUnallowed: 0 },
      ],
      magi: 200_000,
      isMarried: false,
    })
    expect(r.netPassiveResult).toBe(-40_000)
    expect(r.isLossLimited).toBe(true)
    // Non-rental activities get NO rental allowance
    expect(r.rentalAllowance).toBe(0)
    expect(r.totalAllowedLoss).toBe(10_000)
    expect(r.totalSuspendedLoss).toBe(30_000)
  })

  it('applies $25k rental real estate special allowance when MAGI <= $100k', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'Rental', isRentalRealEstate: true, currentIncome: 0, currentLoss: -30_000, priorYearUnallowed: 0 },
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
        { activityName: 'Rental', isRentalRealEstate: true, currentIncome: 0, currentLoss: -50_000, priorYearUnallowed: 0 },
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
        { activityName: 'Rental', isRentalRealEstate: true, currentIncome: 0, currentLoss: -50_000, priorYearUnallowed: 0 },
      ],
      magi: RENTAL_PHASEOUT_END,
      isMarried: false,
    })
    expect(r.rentalAllowance).toBe(0)
    expect(r.totalAllowedLoss).toBe(0)
    expect(r.totalSuspendedLoss).toBe(50_000)
  })

  it('gives full rental allowance at MAGI exactly equal to phaseout start', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'Rental', isRentalRealEstate: true, currentIncome: 0, currentLoss: -50_000, priorYearUnallowed: 0 },
      ],
      magi: RENTAL_PHASEOUT_START,
      isMarried: false,
    })
    expect(r.rentalAllowance).toBe(RENTAL_SPECIAL_ALLOWANCE)
    expect(r.totalAllowedLoss).toBe(25_000)
    expect(r.totalSuspendedLoss).toBe(25_000)
  })

  it('caps rental allowance at actual rental loss amount', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'Rental', isRentalRealEstate: true, currentIncome: 0, currentLoss: -10_000, priorYearUnallowed: 0 },
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

  it('does NOT apply rental allowance to non-rental LP activities (B.2 fix)', () => {
    // LP A is a limited partnership, not rental RE → no $25k allowance
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'LP A', isRentalRealEstate: false, currentIncome: 0, currentLoss: -30_000, priorYearUnallowed: 0 },
      ],
      magi: 50_000,
      isMarried: false,
    })
    expect(r.rentalAllowance).toBe(0)
    expect(r.totalAllowedLoss).toBe(0)
    expect(r.totalSuspendedLoss).toBe(30_000)
    expect(r.isLossLimited).toBe(true)
  })

  it('applies rental allowance only to rental activities in mixed portfolio (B.2/B.3 fix)', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'Rental', isRentalRealEstate: true, currentIncome: 0, currentLoss: -30_000, priorYearUnallowed: 0 },
        { activityName: 'LP Fund', isRentalRealEstate: false, currentIncome: 0, currentLoss: -30_000, priorYearUnallowed: 0 },
      ],
      magi: 50_000,
      isMarried: false,
    })
    // $25k allowance available, but only rental loss of $30k qualifies
    // Net rental loss = $30k, allowance capped at $25k
    expect(r.rentalAllowance).toBe(25_000)
    expect(r.totalAllowedLoss).toBe(25_000) // 0 income + 25k allowance
    expect(r.totalSuspendedLoss).toBe(35_000) // 5k rental + 30k LP
  })

  it('includes prior-year unallowed losses with rental activities', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'Rental', isRentalRealEstate: true, currentIncome: 10_000, currentLoss: -5_000, priorYearUnallowed: -20_000 },
      ],
      magi: RENTAL_PHASEOUT_START,
      isMarried: false,
    })
    // Net: 10k - 5k - 20k = -15k
    expect(r.netPassiveResult).toBe(-15_000)
    expect(r.totalPriorYearUnallowed).toBe(-20_000)
    // Net rental loss = |(-5k) + (-20k)| - 10k = 15k; allowance capped at 15k
    expect(r.rentalAllowance).toBe(15_000)
    expect(r.totalAllowedLoss).toBe(25_000) // 10k income + 15k allowance
    expect(r.totalSuspendedLoss).toBe(0)
  })

  it('handles multiple activities with mixed income and losses', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'Rental A', isRentalRealEstate: true, currentIncome: 20_000, currentLoss: 0, priorYearUnallowed: 0 },
        { activityName: 'Rental B', isRentalRealEstate: true, currentIncome: 0, currentLoss: -15_000, priorYearUnallowed: 0 },
        { activityName: 'LP C', isRentalRealEstate: false, currentIncome: 0, currentLoss: -30_000, priorYearUnallowed: 0 },
      ],
      magi: 80_000,
      isMarried: false,
    })
    // Net: 20k - 15k - 30k = -25k
    expect(r.totalPassiveIncome).toBe(20_000)
    expect(r.totalPassiveLoss).toBe(-45_000)
    expect(r.netPassiveResult).toBe(-25_000)
    // Net rental loss = 15k - 20k = 0 (rental income covers rental loss)
    // So rental allowance can't add anything beyond the income offset
    expect(r.rentalAllowance).toBe(0)
    expect(r.totalAllowedLoss).toBe(20_000) // just the passive income
    expect(r.totalSuspendedLoss).toBe(5_000)
  })

  it('correctly computes per-activity overallGainOrLoss', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'Rental', isRentalRealEstate: true, currentIncome: 5_000, currentLoss: -8_000, priorYearUnallowed: -2_000 },
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
    expect(RENTAL_SPECIAL_ALLOWANCE_MFS).toBe(12_500)
  })

  // ── Per-activity allocation tests (A.3 / D.3) ──────────────────────────────

  it('allocates allowed/suspended losses proportionally per activity (Worksheet 5)', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'Rental A', isRentalRealEstate: true, currentIncome: 0, currentLoss: -20_000, priorYearUnallowed: 0 },
        { activityName: 'Rental B', isRentalRealEstate: true, currentIncome: 0, currentLoss: -30_000, priorYearUnallowed: 0 },
      ],
      magi: 80_000,
      isMarried: false,
    })
    // Net loss = 50k, rental allowance = 25k, income = 0 → allowed = 25k, suspended = 25k
    expect(r.totalAllowedLoss).toBe(25_000)
    expect(r.totalSuspendedLoss).toBe(25_000)

    // Rental A: weight 20k/50k = 40% → allowed = 10k, suspended = 10k
    expect(r.activities[0]!.allowedLossThisYear).toBe(10_000)
    expect(r.activities[0]!.suspendedLossCarryforward).toBe(10_000)

    // Rental B: weight 30k/50k = 60% → allowed = 15k, suspended = 15k
    expect(r.activities[1]!.allowedLossThisYear).toBe(15_000)
    expect(r.activities[1]!.suspendedLossCarryforward).toBe(15_000)
  })

  it('per-activity allocation sums reconcile to totals exactly (D.3)', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'Rental A', isRentalRealEstate: true, currentIncome: 0, currentLoss: -7_000, priorYearUnallowed: -3_000 },
        { activityName: 'Rental B', isRentalRealEstate: true, currentIncome: 0, currentLoss: -13_000, priorYearUnallowed: 0 },
        { activityName: 'LP C', isRentalRealEstate: false, currentIncome: 0, currentLoss: -5_000, priorYearUnallowed: 0 },
      ],
      magi: 120_000,
      isMarried: false,
    })

    // Verify per-activity sums match totals
    const sumAllowed = r.activities.reduce((acc, a) => acc + a.allowedLossThisYear, 0)
    const sumSuspended = r.activities.reduce((acc, a) => acc + a.suspendedLossCarryforward, 0)
    expect(sumAllowed).toBeCloseTo(r.totalAllowedLoss, 2)
    expect(sumSuspended).toBeCloseTo(r.totalSuspendedLoss, 2)

    // Also verify each activity: allowed + suspended = |loss + priorYear|
    for (const a of r.activities) {
      const totalLoss = Math.abs(a.currentLoss + a.priorYearUnallowed)
      if (totalLoss > 0) {
        expect(a.allowedLossThisYear + a.suspendedLossCarryforward).toBeCloseTo(totalLoss, 2)
      }
    }
  })

  it('per-activity allocation is zero for income-only activities', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'Income Fund', isRentalRealEstate: false, currentIncome: 10_000, currentLoss: 0, priorYearUnallowed: 0 },
        { activityName: 'Loss Fund', isRentalRealEstate: false, currentIncome: 0, currentLoss: -20_000, priorYearUnallowed: 0 },
      ],
      magi: 200_000,
      isMarried: false,
    })
    expect(r.activities[0]!.allowedLossThisYear).toBe(0)
    expect(r.activities[0]!.suspendedLossCarryforward).toBe(0)
    expect(r.activities[1]!.allowedLossThisYear).toBe(10_000)
    expect(r.activities[1]!.suspendedLossCarryforward).toBe(10_000)
  })
})
