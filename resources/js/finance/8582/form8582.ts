/**
 * Form 8582 — Passive Activity Loss Limitations
 *
 * Limits how much passive activity loss can be deducted in a given year.
 * Passive losses can only offset passive income. Excess losses are suspended
 * and carried forward until:
 *   (a) there is offsetting passive income, or
 *   (b) the activity is fully disposed of.
 *
 * Special $25,000 rental real estate allowance (MFJ / Single / HoH):
 *   - Allowed for taxpayers who actively participate in rental real estate
 *   - Phase-out: reduced by 50% of (MAGI − $100,000)
 *   - Fully phased out at MAGI of $150,000
 *
 * MFS who lived apart all year: $12,500 allowance, phase-out $50k–$75k MAGI
 * MFS who lived together: $0 allowance (no phase-out)
 *
 * NOTE: The codebase currently does not track MFS vs MFJ — `isMarried` is
 * treated as MFJ. MFS filers will receive incorrect results until a
 * filing-status discriminator is added globally. See TODO below.
 *
 * Source: IRC §469; IRS Form 8582 instructions.
 */

import currency from 'currency.js'

import { isFK1StructuredData } from '@/components/finance/k1'
import { getK1ActivityClassification, parseK1Field } from '@/lib/finance/k1Utils'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'
import type { Form8582ActivityLine, Form8582Lines } from '@/types/finance/tax-return'

// ── Constants — MFJ / Single / HoH ──────────────────────────────────────────
export const RENTAL_SPECIAL_ALLOWANCE = 25_000
export const RENTAL_PHASEOUT_START = 100_000
export const RENTAL_PHASEOUT_END = 150_000

// ── Constants — MFS who lived apart all year ─────────────────────────────────
// TODO: Wire these up once the codebase tracks MFS vs MFJ filing status.
// When MFS+lived-together: rentalAllowance = 0, skip phase-out entirely.
// When MFS+lived-apart: use the values below.
export const RENTAL_SPECIAL_ALLOWANCE_MFS = 12_500
export const RENTAL_PHASEOUT_START_MFS = 50_000
export const RENTAL_PHASEOUT_END_MFS = 75_000

// ── K-1 → activities extraction ─────────────────────────────────────────────

export interface PalCarryforwardEntry {
  id?: number
  activity_name: string
  activity_ein?: string | null | undefined
  ordinary_carryover: number
  short_term_carryover: number
  long_term_carryover: number
}

/** Input for a directly-owned rental property (Schedule E Part I). */
export interface DirectRentalProperty {
  propertyName: string
  netIncome: number
  netLoss: number
}

interface Form8582ComputeInput {
  reviewedK1Docs: TaxDocument[]
  magi: number
  isMarried: boolean
  palCarryforwards?: PalCarryforwardEntry[] | undefined
  /** Directly-owned rental properties from Schedule E Part I. */
  scheduleERentals?: DirectRentalProperty[] | undefined
  /** When true, rental RE activities with material participation are excluded from Form 8582 (§469(c)(7)). */
  realEstateProfessional?: boolean | undefined
}

export interface ActivityInput {
  activityName: string
  ein?: string | undefined
  isRentalRealEstate: boolean
  /** Whether the taxpayer actively participates. Defaults to true for non-LP activities. */
  activeParticipation?: boolean | undefined
  currentIncome: number
  currentLoss: number
  priorYearUnallowed: number
}

/**
 * Extracts Form 8582 activities from reviewed K-1 docs, direct rentals, and PAL carryforwards.
 *
 * Box 1 = ordinary business income/loss — included only when the K-1 activity is
 * passive or unknown (conservatively defaulted to passive).
 * Box 2 = net rental real estate income/loss — eligible for $25k special allowance.
 * Box 3 = other net rental income/loss — NOT eligible for $25k allowance.
 *
 * Each K-1 with a non-zero passive Box 1 produces one activity with isRentalRealEstate = false.
 * Each K-1 with a non-zero Box 2 produces one activity with isRentalRealEstate = true.
 * Each K-1 with a non-zero Box 3 produces a separate activity with isRentalRealEstate = false.
 * Each direct rental property (Schedule E Part I) produces one activity with isRentalRealEstate = true.
 *
 * Limited partnerships (K-1 Part I) never qualify for active participation by statute.
 */
export function extractForm8582Activities(
  reviewedK1Docs: TaxDocument[],
  palCarryforwards: PalCarryforwardEntry[] = [],
  scheduleERentals: DirectRentalProperty[] = [],
): ActivityInput[] {
  const k1Parsed = reviewedK1Docs
    .map((d) => ({ doc: d, data: isFK1StructuredData(d.parsed_data) ? d.parsed_data : null }))
    .filter((x): x is { doc: TaxDocument; data: FK1StructuredData } => x.data !== null)

  const activities: ActivityInput[] = []

  for (const { doc, data } of k1Parsed) {
    const baseName =
      data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership'
    const ein = data.fields['A']?.value ?? undefined

    // Detect limited partnership from K-1 Part I checkbox (field 'G2' or entity type)
    // Limited partners never qualify for active participation.
    const g2Val = (data.fields['G2']?.value ?? '').toLowerCase()
    const isLimitedPartner = g2Val === 'true' || g2Val === 'x' || g2Val === 'yes'

    const classification = getK1ActivityClassification(data)
    const box1 = parseK1Field(data, '1')
    const box2 = parseK1Field(data, '2')
    const box3 = parseK1Field(data, '3')

    if (box1 !== 0 && classification !== 'nonpassive') {
      const name = `${baseName} (ordinary business)`
      const carryforward = findCarryforward(palCarryforwards, name, ein)
      activities.push({
        activityName: name,
        ein,
        isRentalRealEstate: false,
        activeParticipation: !isLimitedPartner,
        currentIncome: Math.max(0, box1),
        currentLoss: Math.min(0, box1),
        priorYearUnallowed: carryforward,
      })
    }

    if (box2 !== 0) {
      const carryforward = findCarryforward(palCarryforwards, baseName, ein)
      activities.push({
        activityName: baseName,
        ein,
        isRentalRealEstate: true,
        activeParticipation: !isLimitedPartner,
        currentIncome: Math.max(0, box2),
        currentLoss: Math.min(0, box2),
        priorYearUnallowed: carryforward,
      })
    }

    if (box3 !== 0) {
      const name = `${baseName} (other rental)`
      const carryforward = findCarryforward(palCarryforwards, name, ein)
      activities.push({
        activityName: name,
        ein,
        isRentalRealEstate: false,
        activeParticipation: !isLimitedPartner,
        currentIncome: Math.max(0, box3),
        currentLoss: Math.min(0, box3),
        priorYearUnallowed: carryforward,
      })
    }
  }

  // Direct rental properties from Schedule E Part I
  for (const rental of scheduleERentals) {
    const carryforward = findCarryforward(palCarryforwards, rental.propertyName, undefined)
    activities.push({
      activityName: rental.propertyName,
      ein: undefined,
      isRentalRealEstate: true,
      activeParticipation: true, // Direct rentals default to active participation
      currentIncome: Math.max(0, rental.netIncome),
      currentLoss: Math.min(0, rental.netLoss),
      priorYearUnallowed: carryforward,
    })
  }

  return activities
}

function findCarryforward(
  carryforwards: PalCarryforwardEntry[],
  activityName: string,
  ein?: string | undefined,
): number {
  const match = carryforwards.find(
    (cf) => cf.activity_name === activityName || (ein && cf.activity_ein === ein),
  )
  return match ? match.ordinary_carryover : 0
}

/**
 * Compute wrapper: extracts activities from K-1 docs and direct rentals,
 * merges PAL carryforwards, and runs the Form 8582 computation.
 */
export function computeForm8582(input: Form8582ComputeInput): Form8582Lines {
  const activities = extractForm8582Activities(
    input.reviewedK1Docs,
    input.palCarryforwards ?? [],
    input.scheduleERentals ?? [],
  )
  return computeForm8582Lines({
    activities,
    magi: input.magi,
    isMarried: input.isMarried,
    realEstateProfessional: input.realEstateProfessional ?? false,
  })
}

// ── Core computation ─────────────────────────────────────────────────────────

export function computeForm8582Lines({
  activities,
  magi,
  isMarried,
  realEstateProfessional = false,
}: {
  activities: ActivityInput[]
  magi: number
  isMarried: boolean
  /** When true, rental RE activities with active participation are excluded from Form 8582 entirely (§469(c)(7)). */
  realEstateProfessional?: boolean
}): Form8582Lines {
  // When taxpayer is a real estate professional, rental RE activities with active participation
  // are treated as non-passive and excluded from Form 8582 entirely.
  const filteredActivities = realEstateProfessional
    ? activities.filter((a) => !a.isRentalRealEstate || !(a.activeParticipation ?? true))
    : activities

  const activityLines: Form8582ActivityLine[] = filteredActivities.map((a) => ({
    activityName: a.activityName,
    ein: a.ein,
    isRentalRealEstate: a.isRentalRealEstate,
    activeParticipation: a.activeParticipation ?? true,
    currentIncome: a.currentIncome,
    currentLoss: a.currentLoss,
    priorYearUnallowed: a.priorYearUnallowed,
    overallGainOrLoss: currency(a.currentIncome).add(a.currentLoss).add(a.priorYearUnallowed).value,
    allowedLossThisYear: 0,
    suspendedLossCarryforward: 0,
  }))

  const totalPassiveIncome = activityLines.reduce(
    (acc, a) => acc.add(a.currentIncome),
    currency(0),
  ).value

  const totalPassiveLoss = activityLines.reduce(
    (acc, a) => acc.add(a.currentLoss),
    currency(0),
  ).value

  const totalPriorYearUnallowed = activityLines.reduce(
    (acc, a) => acc.add(a.priorYearUnallowed),
    currency(0),
  ).value

  const netPassiveResult = currency(totalPassiveIncome).add(totalPassiveLoss).add(totalPriorYearUnallowed).value

  if (netPassiveResult >= 0) {
    const totalGrossLoss = Math.abs(totalPassiveLoss) + Math.abs(totalPriorYearUnallowed)
    allocateAllowedLosses(activityLines, totalGrossLoss)
    return {
      activities: activityLines,
      totalPassiveIncome,
      totalPassiveLoss,
      totalPriorYearUnallowed,
      netPassiveResult,
      rentalAllowance: 0,
      totalAllowedLoss: totalGrossLoss,
      totalSuspendedLoss: 0,
      netDeductionToReturn: 0,
      isLossLimited: false,
      magi,
      isMarried,
      realEstateProfessional,
    }
  }

  const totalLossAmount = Math.abs(netPassiveResult)

  // Rental allowance only applies to activities where isRentalRealEstate === true
  // AND the taxpayer actively participates (§469(i)(6) — LPs never qualify).
  const rentalLossAmount = activityLines
    .filter((a) => a.isRentalRealEstate && a.activeParticipation)
    .reduce((acc, a) => acc.add(Math.abs(a.currentLoss)).add(Math.abs(a.priorYearUnallowed)), currency(0))
    .value
  const netRentalLoss = Math.max(0, rentalLossAmount - activityLines
    .filter((a) => a.isRentalRealEstate && a.activeParticipation)
    .reduce((acc, a) => acc.add(a.currentIncome), currency(0))
    .value)

  // TODO: When the codebase tracks MFS vs MFJ, apply:
  //   MFS+lived-together → rentalAllowanceBase = 0
  //   MFS+lived-apart → RENTAL_SPECIAL_ALLOWANCE_MFS / RENTAL_PHASEOUT_START_MFS / RENTAL_PHASEOUT_END_MFS
  // Currently isMarried = MFJ assumption.
  const rentalAllowanceBase = RENTAL_SPECIAL_ALLOWANCE
  const phaseOutStart = RENTAL_PHASEOUT_START
  const phaseOutReduction = Math.max(0, currency(magi).subtract(phaseOutStart).multiply(0.5).value)
  const rentalAllowance = Math.max(0, currency(rentalAllowanceBase).subtract(phaseOutReduction).value)

  // Cap allowance at the net rental loss (only rental RE activities benefit)
  const effectiveAllowance = Math.min(rentalAllowance, netRentalLoss, totalLossAmount)

  const totalAllowedLoss = currency(totalPassiveIncome).add(effectiveAllowance).value
  const totalSuspendedLoss = Math.max(0, currency(totalLossAmount).subtract(totalAllowedLoss).value)

  allocateAllowedLosses(activityLines, totalAllowedLoss)

  return {
    activities: activityLines,
    totalPassiveIncome,
    totalPassiveLoss,
    totalPriorYearUnallowed,
    netPassiveResult,
    rentalAllowance: effectiveAllowance,
    totalAllowedLoss,
    totalSuspendedLoss,
    netDeductionToReturn: totalAllowedLoss,
    isLossLimited: totalSuspendedLoss > 0,
    magi,
    isMarried,
    realEstateProfessional,
  }
}

/**
 * Proportionally allocates allowed losses back to each loss activity
 * (Form 8582 Worksheet 5). Weight = |currentLoss + priorYearUnallowed|.
 * Mutates the activity lines in place.
 */
function allocateAllowedLosses(activities: Form8582ActivityLine[], totalAllowed: number): void {
  const lossActivities = activities.filter(
    (a) => currency(a.currentLoss).add(a.priorYearUnallowed).value < 0,
  )
  const totalWeight = lossActivities.reduce(
    (acc, a) => acc.add(Math.abs(currency(a.currentLoss).add(a.priorYearUnallowed).value)),
    currency(0),
  ).value

  if (totalWeight === 0) return

  let allocatedSoFar = currency(0)
  for (let i = 0; i < lossActivities.length; i++) {
    const a = lossActivities[i]!
    const weight = Math.abs(currency(a.currentLoss).add(a.priorYearUnallowed).value)
    if (i === lossActivities.length - 1) {
      // Last activity gets the remainder to avoid rounding drift
      a.allowedLossThisYear = currency(totalAllowed).subtract(allocatedSoFar).value
    } else {
      a.allowedLossThisYear = currency(totalAllowed).multiply(weight).divide(totalWeight).value
      allocatedSoFar = allocatedSoFar.add(a.allowedLossThisYear)
    }
    a.suspendedLossCarryforward = currency(weight).subtract(a.allowedLossThisYear).value
  }
}
