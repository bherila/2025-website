/**
 * Form 8582 — Passive Activity Loss Limitations
 *
 * Limits how much passive activity loss can be deducted in a given year.
 * Passive losses can only offset passive income. Excess losses are suspended
 * and carried forward until:
 *   (a) there is offsetting passive income, or
 *   (b) the activity is fully disposed of.
 *
 * Special $25,000 rental real estate allowance:
 *   - Allowed for taxpayers who actively participate in rental real estate
 *   - Phase-out: reduced by 50% of (MAGI − $100,000)
 *   - Fully phased out at MAGI of $150,000
 *   - MFS filers who live together: $0 allowance
 *
 * Source: IRC §469; IRS Form 8582 instructions.
 */

import currency from 'currency.js'

import type { Form8582ActivityLine, Form8582Lines } from '@/types/finance/tax-return'

export const RENTAL_SPECIAL_ALLOWANCE = 25_000
export const RENTAL_PHASEOUT_START = 100_000
export const RENTAL_PHASEOUT_END = 150_000

export function computeForm8582Lines({
  activities,
  magi,
  isMarried,
}: {
  activities: { activityName: string; ein?: string | undefined; currentIncome: number; currentLoss: number; priorYearUnallowed: number }[]
  magi: number
  isMarried: boolean
}): Form8582Lines {
  const activityLines: Form8582ActivityLine[] = activities.map((a) => ({
    activityName: a.activityName,
    ein: a.ein,
    currentIncome: a.currentIncome,
    currentLoss: a.currentLoss,
    priorYearUnallowed: a.priorYearUnallowed,
    overallGainOrLoss: currency(a.currentIncome).add(a.currentLoss).add(a.priorYearUnallowed).value,
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
    return {
      activities: activityLines,
      totalPassiveIncome,
      totalPassiveLoss,
      totalPriorYearUnallowed,
      netPassiveResult,
      rentalAllowance: 0,
      totalAllowedLoss: Math.abs(totalPassiveLoss) + Math.abs(totalPriorYearUnallowed),
      totalSuspendedLoss: 0,
      isLossLimited: false,
      magi,
      isMarried,
    }
  }

  const totalLossAmount = Math.abs(netPassiveResult)

  const rentalAllowanceBase = RENTAL_SPECIAL_ALLOWANCE
  const phaseOutReduction = Math.max(0, currency(magi).subtract(RENTAL_PHASEOUT_START).multiply(0.5).value)
  const rentalAllowance = Math.max(0, currency(rentalAllowanceBase).subtract(phaseOutReduction).value)

  const effectiveAllowance = Math.min(rentalAllowance, totalLossAmount)

  const totalAllowedLoss = currency(totalPassiveIncome).add(effectiveAllowance).value
  const totalSuspendedLoss = Math.max(0, currency(totalLossAmount).subtract(totalAllowedLoss).value)

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
