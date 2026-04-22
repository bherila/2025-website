import { computeScheduleELines } from '@/components/finance/ScheduleEPreview'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'

import { computeForm8582, computeForm8582Lines, extractForm8582Activities, RENTAL_PHASEOUT_END, RENTAL_PHASEOUT_START, RENTAL_SPECIAL_ALLOWANCE, RENTAL_SPECIAL_ALLOWANCE_MFS } from '../form8582'

function makeK1Data(overrides: Partial<FK1StructuredData> = {}): FK1StructuredData {
  return {
    schemaVersion: '2026.1',
    formType: 'K-1-1065',
    fields: {},
    codes: {},
    ...overrides,
  }
}

function makeK1Doc(data: FK1StructuredData, partnerName = 'Test Partnership', id = 1): TaxDocument {
  return {
    id,
    user_id: 1,
    tax_year: 2024,
    form_type: 'k1',
    employment_entity_id: null,
    account_id: null,
    original_filename: null,
    stored_filename: null,
    s3_path: null,
    mime_type: 'application/pdf',
    file_size_bytes: 0,
    file_hash: `hash-${id}`,
    is_reviewed: true,
    notes: null,
    human_file_size: '0 B',
    download_count: 0,
    genai_job_id: null,
    genai_status: null,
    parsed_data: data,
    uploader: null,
    employment_entity: { id: id, display_name: partnerName },
    account: null,
    account_links: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }
}

const noActivities = { activities: [], magi: 100_000, isMarried: false }

describe('extractForm8582Activities', () => {
  it('includes passive LP Box 1 loss and suspends it when no passive income offsets it', () => {
    const reviewedK1Docs = [
      makeK1Doc(makeK1Data({
        fields: {
          A: { value: '12-3456789' },
          B: { value: 'Passive LP Fund' },
          G: { value: 'Limited Partner' },
          G2: { value: 'true' },
          '1': { value: '-12000' },
        },
      }), 'Passive LP Fund'),
    ]

    const activities = extractForm8582Activities(reviewedK1Docs)

    expect(activities).toEqual([
      expect.objectContaining({
        activityName: 'Passive LP Fund (ordinary business)',
        ein: '12-3456789',
        isRentalRealEstate: false,
        activeParticipation: false,
        currentIncome: 0,
        currentLoss: -12000,
      }),
    ])

    const result = computeForm8582({ reviewedK1Docs, magi: 200_000, isMarried: false })
    expect(result.totalPassiveLoss).toBe(-12_000)
    expect(result.totalAllowedLoss).toBe(0)
    expect(result.totalSuspendedLoss).toBe(12_000)
    expect(result.activities[0]!.activityName).toBe('Passive LP Fund (ordinary business)')
    expect(result.activities[0]!.suspendedLossCarryforward).toBe(12_000)
  })

  it('skips nonpassive GP Box 1 loss from Form 8582 while keeping it in Schedule E nonpassive totals', () => {
    const reviewedK1Docs = [
      makeK1Doc(makeK1Data({
        fields: {
          B: { value: 'General Partner LLC' },
          G: { value: 'General Partner' },
          '1': { value: '-5000' },
        },
      }), 'General Partner LLC'),
    ]

    expect(extractForm8582Activities(reviewedK1Docs)).toEqual([])

    const form8582 = computeForm8582({ reviewedK1Docs, magi: 150_000, isMarried: false })
    expect(form8582.activities).toEqual([])
    expect(form8582.totalPassiveLoss).toBe(0)

    const scheduleE = computeScheduleELines(reviewedK1Docs)
    expect(scheduleE.totalBox1).toBe(-5_000)
    expect(scheduleE.totalNonpassive).toBe(-5_000)
  })

  it('treats unknown-classification Box 1 as passive by default', () => {
    const reviewedK1Docs = [
      makeK1Doc(makeK1Data({
        fields: {
          B: { value: 'Unknown Activity Fund' },
          '1': { value: '-7000' },
        },
      }), 'Unknown Activity Fund'),
    ]

    const result = computeForm8582({ reviewedK1Docs, magi: 180_000, isMarried: false })

    expect(result.activities).toHaveLength(1)
    expect(result.activities[0]!.activityName).toBe('Unknown Activity Fund (ordinary business)')
    expect(result.totalPassiveLoss).toBe(-7_000)
    expect(result.totalSuspendedLoss).toBe(7_000)
  })

  it('nets passive Box 1 income and loss across multiple K-1 activities before suspending any excess', () => {
    const reviewedK1Docs = [
      makeK1Doc(makeK1Data({
        fields: {
          B: { value: 'Passive Gain Fund' },
          G: { value: 'Limited Partner' },
          '1': { value: '9000' },
        },
      }), 'Passive Gain Fund', 1),
      makeK1Doc(makeK1Data({
        fields: {
          B: { value: 'Passive Loss Fund' },
          G: { value: 'Limited Partner' },
          '1': { value: '-6000' },
        },
      }), 'Passive Loss Fund', 2),
    ]

    const result = computeForm8582({ reviewedK1Docs, magi: 200_000, isMarried: false })

    expect(result.totalPassiveIncome).toBe(9_000)
    expect(result.totalPassiveLoss).toBe(-6_000)
    expect(result.netPassiveResult).toBe(3_000)
    expect(result.totalAllowedLoss).toBe(6_000)
    expect(result.totalSuspendedLoss).toBe(0)
    expect(result.activities.find((activity) => activity.activityName === 'Passive Loss Fund (ordinary business)')!.allowedLossThisYear).toBe(6_000)
  })

  it('treats trader-in-securities Box 1 activity as nonpassive and excludes it from Form 8582', () => {
    const reviewedK1Docs = [
      makeK1Doc(makeK1Data({
        fields: {
          B: { value: 'Trader Fund LP' },
          partnershipPosition_traderInSecurities: { value: 'true' },
          '1': { value: '-4500' },
        },
      }), 'Trader Fund LP'),
    ]

    const result = computeForm8582({ reviewedK1Docs, magi: 180_000, isMarried: false })

    expect(result.activities).toEqual([])
    expect(result.totalPassiveLoss).toBe(0)
    expect(computeScheduleELines(reviewedK1Docs).totalNonpassive).toBe(-4_500)
  })
})

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

  // ── netDeductionToReturn tests (B.9) ──────────────────────────────────────

  it('netDeductionToReturn is 0 when income exceeds losses (no net deduction)', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'LP A', isRentalRealEstate: false, currentIncome: 50_000, currentLoss: 0, priorYearUnallowed: 0 },
        { activityName: 'LP B', isRentalRealEstate: false, currentIncome: 0, currentLoss: -30_000, priorYearUnallowed: 0 },
      ],
      magi: 100_000,
      isMarried: false,
    })
    expect(r.netPassiveResult).toBe(20_000)
    expect(r.netDeductionToReturn).toBe(0)
  })

  it('netDeductionToReturn equals totalAllowedLoss when losses are limited', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'Rental', isRentalRealEstate: true, currentIncome: 0, currentLoss: -30_000, priorYearUnallowed: 0 },
      ],
      magi: 80_000,
      isMarried: false,
    })
    expect(r.netDeductionToReturn).toBe(r.totalAllowedLoss)
    expect(r.netDeductionToReturn).toBe(25_000)
  })

  // ── Active participation tests (B.7 / D.1) ──────────────────────────────

  it('denies $25k allowance when rental activity has no active participation (LP)', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'LP Rental', isRentalRealEstate: true, activeParticipation: false, currentIncome: 0, currentLoss: -30_000, priorYearUnallowed: 0 },
      ],
      magi: 50_000,
      isMarried: false,
    })
    // isRentalRealEstate=true but activeParticipation=false → no $25k allowance
    expect(r.rentalAllowance).toBe(0)
    expect(r.totalAllowedLoss).toBe(0)
    expect(r.totalSuspendedLoss).toBe(30_000)
    expect(r.isLossLimited).toBe(true)
  })

  it('grants $25k allowance only to active-participation rental activities in mixed portfolio', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'Active Rental', isRentalRealEstate: true, activeParticipation: true, currentIncome: 0, currentLoss: -20_000, priorYearUnallowed: 0 },
        { activityName: 'LP Rental', isRentalRealEstate: true, activeParticipation: false, currentIncome: 0, currentLoss: -20_000, priorYearUnallowed: 0 },
      ],
      magi: 80_000,
      isMarried: false,
    })
    // Only active rental qualifies for $25k allowance
    expect(r.rentalAllowance).toBe(20_000) // capped at net active rental loss of $20k
    expect(r.totalAllowedLoss).toBe(20_000)
    expect(r.totalSuspendedLoss).toBe(20_000) // LP rental loss fully suspended
  })

  it('defaults activeParticipation to true when not specified', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'Rental', isRentalRealEstate: true, currentIncome: 0, currentLoss: -10_000, priorYearUnallowed: 0 },
      ],
      magi: 80_000,
      isMarried: false,
    })
    expect(r.activities[0]!.activeParticipation).toBe(true)
    expect(r.rentalAllowance).toBe(10_000)
    expect(r.isLossLimited).toBe(false)
  })

  // ── Real estate professional tests (B.8 / D.1) ────────────────────────────

  it('excludes rental RE activities with active participation when realEstateProfessional = true', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'Direct Rental', isRentalRealEstate: true, activeParticipation: true, currentIncome: 0, currentLoss: -50_000, priorYearUnallowed: 0 },
        { activityName: 'LP Fund', isRentalRealEstate: false, activeParticipation: true, currentIncome: 0, currentLoss: -10_000, priorYearUnallowed: 0 },
      ],
      magi: 80_000,
      isMarried: false,
      realEstateProfessional: true,
    })
    // Direct Rental excluded (RE pro + active participation)
    // Only LP Fund remains in Form 8582
    expect(r.activities).toHaveLength(1)
    expect(r.activities[0]!.activityName).toBe('LP Fund')
    expect(r.totalPassiveLoss).toBe(-10_000)
    expect(r.totalSuspendedLoss).toBe(10_000)
    expect(r.realEstateProfessional).toBe(true)
  })

  it('keeps LP rental activities even when realEstateProfessional = true (no active participation)', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'LP Rental', isRentalRealEstate: true, activeParticipation: false, currentIncome: 0, currentLoss: -30_000, priorYearUnallowed: 0 },
      ],
      magi: 80_000,
      isMarried: false,
      realEstateProfessional: true,
    })
    // LP Rental: isRentalRealEstate=true but activeParticipation=false → NOT excluded
    expect(r.activities).toHaveLength(1)
    expect(r.totalSuspendedLoss).toBe(30_000)
  })

  it('returns empty when RE professional has only active rental RE activities', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'Rental A', isRentalRealEstate: true, activeParticipation: true, currentIncome: 0, currentLoss: -50_000, priorYearUnallowed: 0 },
        { activityName: 'Rental B', isRentalRealEstate: true, activeParticipation: true, currentIncome: 5_000, currentLoss: 0, priorYearUnallowed: 0 },
      ],
      magi: 80_000,
      isMarried: false,
      realEstateProfessional: true,
    })
    expect(r.activities).toHaveLength(0)
    expect(r.totalPassiveIncome).toBe(0)
    expect(r.totalPassiveLoss).toBe(0)
  })

  // ── Direct rental property tests (B.6 / D.1) ──────────────────────────────

  it('single direct rental with $15k loss, no K-1s → full allowance, no suspension', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: '123 Main St', isRentalRealEstate: true, activeParticipation: true, currentIncome: 0, currentLoss: -15_000, priorYearUnallowed: 0 },
      ],
      magi: 80_000,
      isMarried: false,
    })
    expect(r.rentalAllowance).toBe(15_000)
    expect(r.totalAllowedLoss).toBe(15_000)
    expect(r.totalSuspendedLoss).toBe(0)
    expect(r.isLossLimited).toBe(false)
  })

  it('mixed direct rental + K-1 Box 2 — both counted against $25k pool', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: '123 Main St (direct)', isRentalRealEstate: true, activeParticipation: true, currentIncome: 0, currentLoss: -15_000, priorYearUnallowed: 0 },
        { activityName: 'K-1 Rental', isRentalRealEstate: true, activeParticipation: true, currentIncome: 0, currentLoss: -15_000, priorYearUnallowed: 0 },
      ],
      magi: 80_000,
      isMarried: false,
    })
    // Both are rental RE with active participation → combined $30k loss against $25k pool
    expect(r.rentalAllowance).toBe(25_000)
    expect(r.totalAllowedLoss).toBe(25_000)
    expect(r.totalSuspendedLoss).toBe(5_000)
    expect(r.isLossLimited).toBe(true)
  })

  // ── MAGI boundary tests (D.2) ────────────────────────────────────────────

  it('MAGI exactly at phaseout start gives full allowance (boundary)', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'Rental', isRentalRealEstate: true, currentIncome: 0, currentLoss: -50_000, priorYearUnallowed: 0 },
      ],
      magi: RENTAL_PHASEOUT_START,
      isMarried: false,
    })
    expect(r.rentalAllowance).toBe(RENTAL_SPECIAL_ALLOWANCE)
  })

  it('MAGI $1 above phaseout start reduces allowance by $0.50', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'Rental', isRentalRealEstate: true, currentIncome: 0, currentLoss: -50_000, priorYearUnallowed: 0 },
      ],
      magi: RENTAL_PHASEOUT_START + 1,
      isMarried: false,
    })
    // 50% × $1 = $0.50 reduction → allowance = $24,999.50
    expect(r.rentalAllowance).toBe(24_999.5)
  })

  it('MAGI exactly at phaseout end gives zero allowance (boundary)', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'Rental', isRentalRealEstate: true, currentIncome: 0, currentLoss: -50_000, priorYearUnallowed: 0 },
      ],
      magi: RENTAL_PHASEOUT_END,
      isMarried: false,
    })
    expect(r.rentalAllowance).toBe(0)
    expect(r.totalSuspendedLoss).toBe(50_000)
  })

  it('MAGI $1 below phaseout end gives $0.50 allowance', () => {
    const r = computeForm8582Lines({
      activities: [
        { activityName: 'Rental', isRentalRealEstate: true, currentIncome: 0, currentLoss: -50_000, priorYearUnallowed: 0 },
      ],
      magi: RENTAL_PHASEOUT_END - 1,
      isMarried: false,
    })
    // 50% × ($149,999 - $100,000) = $24,999.50 reduction → allowance = $0.50
    expect(r.rentalAllowance).toBe(0.5)
  })
})
