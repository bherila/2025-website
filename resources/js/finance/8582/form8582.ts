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

// ── K-1 field helpers ─────────────────────────────────────────────────────────

function parseK1Field(data: FK1StructuredData, box: string): number {
  const v = data.fields[box]?.value
  if (!v) return 0
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

// ── K-1 → activities extraction ─────────────────────────────────────────────

export interface PalCarryforwardEntry {
  id?: number
  activity_name: string
  activity_ein?: string | null | undefined
  ordinary_carryover: number
  short_term_carryover: number
  long_term_carryover: number
}

interface Form8582ComputeInput {
  reviewedK1Docs: TaxDocument[]
  magi: number
  isMarried: boolean
  palCarryforwards?: PalCarryforwardEntry[] | undefined
}

function isFK1StructuredData(data: unknown): data is FK1StructuredData {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return (
    typeof d['schemaVersion'] === 'string' &&
    d['fields'] !== null && typeof d['fields'] === 'object' && !Array.isArray(d['fields']) &&
    d['codes'] !== null && typeof d['codes'] === 'object' && !Array.isArray(d['codes'])
  )
}

/**
 * Extracts Form 8582 activities from reviewed K-1 docs and PAL carryforwards.
 *
 * Box 2 = net rental real estate income/loss — eligible for $25k special allowance.
 * Box 3 = other net rental income/loss — NOT eligible for $25k allowance.
 *
 * Each K-1 with a non-zero Box 2 produces one activity with isRentalRealEstate = true.
 * Each K-1 with a non-zero Box 3 produces a separate activity with isRentalRealEstate = false.
 */
export function extractForm8582Activities(
  reviewedK1Docs: TaxDocument[],
  palCarryforwards: PalCarryforwardEntry[] = [],
): { activityName: string; ein?: string | undefined; isRentalRealEstate: boolean; currentIncome: number; currentLoss: number; priorYearUnallowed: number }[] {
  const k1Parsed = reviewedK1Docs
    .map((d) => ({ doc: d, data: isFK1StructuredData(d.parsed_data) ? d.parsed_data : null }))
    .filter((x): x is { doc: TaxDocument; data: FK1StructuredData } => x.data !== null)

  const activities: { activityName: string; ein?: string | undefined; isRentalRealEstate: boolean; currentIncome: number; currentLoss: number; priorYearUnallowed: number }[] = []

  for (const { doc, data } of k1Parsed) {
    const baseName =
      data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership'
    const ein = data.fields['A']?.value ?? undefined

    const box2 = parseK1Field(data, '2')
    const box3 = parseK1Field(data, '3')

    if (box2 !== 0) {
      const carryforward = findCarryforward(palCarryforwards, baseName, ein)
      activities.push({
        activityName: baseName,
        ein,
        isRentalRealEstate: true,
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
        currentIncome: Math.max(0, box3),
        currentLoss: Math.min(0, box3),
        priorYearUnallowed: carryforward,
      })
    }
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
 * Compute wrapper: extracts activities from K-1 docs, merges PAL carryforwards,
 * and runs the Form 8582 computation.
 */
export function computeForm8582(input: Form8582ComputeInput): Form8582Lines {
  const activities = extractForm8582Activities(
    input.reviewedK1Docs,
    input.palCarryforwards ?? [],
  )
  return computeForm8582Lines({ activities, magi: input.magi, isMarried: input.isMarried })
}

// ── Core computation ─────────────────────────────────────────────────────────

export function computeForm8582Lines({
  activities,
  magi,
  isMarried,
}: {
  activities: { activityName: string; ein?: string | undefined; isRentalRealEstate: boolean; currentIncome: number; currentLoss: number; priorYearUnallowed: number }[]
  magi: number
  isMarried: boolean
}): Form8582Lines {
  const activityLines: Form8582ActivityLine[] = activities.map((a) => ({
    activityName: a.activityName,
    ein: a.ein,
    isRentalRealEstate: a.isRentalRealEstate,
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
      isLossLimited: false,
      magi,
      isMarried,
    }
  }

  const totalLossAmount = Math.abs(netPassiveResult)

  // Rental allowance only applies to activities where isRentalRealEstate === true
  const rentalLossAmount = activityLines
    .filter((a) => a.isRentalRealEstate)
    .reduce((acc, a) => acc.add(Math.abs(a.currentLoss)).add(Math.abs(a.priorYearUnallowed)), currency(0))
    .value
  const netRentalLoss = Math.max(0, rentalLossAmount - activityLines
    .filter((a) => a.isRentalRealEstate)
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
    isLossLimited: totalSuspendedLoss > 0,
    magi,
    isMarried,
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
