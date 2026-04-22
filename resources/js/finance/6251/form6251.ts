import currency from 'currency.js'

import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { Form6251Lines, ScheduleALines } from '@/types/finance/tax-return'

export const AMT_EXEMPTION: Record<number, { single: number; mfj: number }> = {
  2024: { single: 85_700, mfj: 133_300 },
  2025: { single: 88_100, mfj: 137_000 },
}

export const AMT_EXEMPTION_PHASEOUT: Record<number, { single: number; mfj: number }> = {
  2024: { single: 609_350, mfj: 1_218_700 },
  2025: { single: 626_350, mfj: 1_252_700 },
}

export const AMT_RATE_SPLIT_THRESHOLD: Record<number, { single: number; mfj: number }> = {
  2024: { single: 232_600, mfj: 232_600 },
  2025: { single: 239_100, mfj: 239_100 },
}

const DEFAULT_AMT_YEAR = 2025

function normalizeNumericString(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  const isNegative = /^\(.*\)$/.test(trimmed)
  const inner = isNegative ? trimmed.slice(1, -1) : trimmed
  const digits = inner.replace(/[$,\s]/g, '')
  return isNegative ? `-${digits}` : digits
}

function toNum(value: unknown): number {
  if (value == null || value === '') {
    return 0
  }

  if (typeof value === 'number') {
    return isFinite(value) ? value : 0
  }

  const normalized = normalizeNumericString(String(value))
  if (!normalized) {
    return 0
  }

  const parsed = parseFloat(normalized)
  return isFinite(parsed) ? parsed : 0
}

function getAmtTableValue(
  table: Record<number, { single: number; mfj: number }>,
  year: number,
  isMarried: boolean,
): number {
  const row = table[year] ?? table[DEFAULT_AMT_YEAR] ?? { single: 0, mfj: 0 }
  return isMarried ? row.mfj : row.single
}

function line2aTaxesOrStandardDeduction(
  scheduleA: Pick<ScheduleALines, 'saltDeduction' | 'standardDeduction' | 'shouldItemize'> | undefined,
): { amount: number; source: 'salt_deduction' | 'standard_deduction' | 'none' } {
  if (!scheduleA) {
    return { amount: 0, source: 'none' }
  }

  if (scheduleA.shouldItemize) {
    return { amount: scheduleA.saltDeduction, source: 'salt_deduction' }
  }

  return { amount: scheduleA.standardDeduction, source: 'standard_deduction' }
}

export interface ComputeForm6251Input {
  taxableIncome: number
  year: number
  isMarried?: boolean
  k1Data: { data: FK1StructuredData; label: string }[]
  scheduleA?: Pick<ScheduleALines, 'saltDeduction' | 'standardDeduction' | 'shouldItemize'>
  regularTax: number
  regularForeignTaxCredit?: number
  amtForeignTaxCredit?: number
  otherPreferences?: {
    investmentInterestAdjustment?: number
    passiveActivityAdjustment?: number
    lossLimitationAdjustment?: number
    intangibleDrillingCostsAdjustment?: number
    otherAdjustments?: number
  }
}

export function computeForm6251Lines({
  taxableIncome,
  year,
  isMarried = false,
  k1Data,
  scheduleA,
  regularTax,
  regularForeignTaxCredit = 0,
  amtForeignTaxCredit,
  otherPreferences,
}: ComputeForm6251Input): Form6251Lines {
  const sourceEntries: Form6251Lines['sourceEntries'] = []

  let line2dDepletion = 0
  let line2kDispositionOfProperty = 0
  let line2lPost1986Depreciation = 0
  let line2mPassiveActivities = otherPreferences?.passiveActivityAdjustment ?? 0
  const line2nLossLimitations = otherPreferences?.lossLimitationAdjustment ?? 0
  let line2tIntangibleDrillingCosts = otherPreferences?.intangibleDrillingCostsAdjustment ?? 0
  let line3OtherAdjustments = otherPreferences?.otherAdjustments ?? 0

  const manualReviewReasons = new Set<string>()

  for (const { data, label } of k1Data) {
    for (const item of data.codes['17'] ?? []) {
      const code = item.code.toUpperCase()
      const rawAmount = toNum(item.value)

      if (rawAmount === 0) {
        continue
      }

      if (code === 'A') {
        line2lPost1986Depreciation = currency(line2lPost1986Depreciation).add(rawAmount).value
        sourceEntries.push({ label, code, line: '2l', amount: rawAmount, description: 'Post-1986 depreciation adjustment' })
        continue
      }

      if (code === 'B') {
        line2kDispositionOfProperty = currency(line2kDispositionOfProperty).add(rawAmount).value
        sourceEntries.push({ label, code, line: '2k', amount: rawAmount, description: 'Adjusted gain or loss' })
        continue
      }

      if (code === 'C') {
        line2dDepletion = currency(line2dDepletion).add(rawAmount).value
        sourceEntries.push({ label, code, line: '2d', amount: rawAmount, description: 'Depletion (other than oil & gas)' })
        continue
      }

      if (code === 'D') {
        line2tIntangibleDrillingCosts = currency(line2tIntangibleDrillingCosts).add(rawAmount).value
        sourceEntries.push({
          label,
          code,
          line: '2t',
          amount: rawAmount,
          description: 'Oil, gas, and geothermal gross income',
          requiresStatementReview: true,
        })
        manualReviewReasons.add('Box 17 codes D/E require the attached statement to confirm the net Form 6251 line 2t amount.')
        continue
      }

      if (code === 'E') {
        const deductionAmount = rawAmount > 0 ? -rawAmount : rawAmount
        line2tIntangibleDrillingCosts = currency(line2tIntangibleDrillingCosts).add(deductionAmount).value
        sourceEntries.push({
          label,
          code,
          line: '2t',
          amount: deductionAmount,
          description: 'Oil, gas, and geothermal deductions',
          requiresStatementReview: true,
        })
        manualReviewReasons.add('Box 17 codes D/E require the attached statement to confirm the net Form 6251 line 2t amount.')
        continue
      }

      if (code === 'F') {
        line3OtherAdjustments = currency(line3OtherAdjustments).add(rawAmount).value
        sourceEntries.push({
          label,
          code,
          line: '3',
          amount: rawAmount,
          description: 'Other AMT items',
          requiresStatementReview: true,
        })
        manualReviewReasons.add('Box 17 code F may require a partnership statement to place the amount on the exact AMT line.')
        continue
      }

      if (code === 'G') {
        line3OtherAdjustments = currency(line3OtherAdjustments).add(rawAmount).value
        sourceEntries.push({
          label,
          code,
          line: '3',
          amount: rawAmount,
          description: 'Legacy other AMT item',
          requiresStatementReview: true,
        })
        manualReviewReasons.add('Legacy Box 17 code G was preserved for backward compatibility and should be reviewed against the attached statement.')
        continue
      }

      if (code === 'H') {
        line2mPassiveActivities = currency(line2mPassiveActivities).add(rawAmount).value
        sourceEntries.push({
          label,
          code,
          line: '2m',
          amount: rawAmount,
          description: 'Legacy passive activity loss adjustment',
          requiresStatementReview: true,
        })
        manualReviewReasons.add('Legacy Box 17 code H was preserved for backward compatibility and should be reviewed against the attached statement.')
        continue
      }

      line3OtherAdjustments = currency(line3OtherAdjustments).add(rawAmount).value
      sourceEntries.push({
        label,
        code,
        line: '3',
        amount: rawAmount,
        description: 'Unmapped AMT item',
        requiresStatementReview: true,
      })
      manualReviewReasons.add(`Box 17 code ${code} is not explicitly mapped and should be reviewed manually.`)
    }
  }

  const line2a = line2aTaxesOrStandardDeduction(scheduleA)
  const line2cInvestmentInterest = otherPreferences?.investmentInterestAdjustment ?? 0
  const adjustmentTotal = currency(line2a.amount)
    .add(line2cInvestmentInterest)
    .add(line2dDepletion)
    .add(line2kDispositionOfProperty)
    .add(line2lPost1986Depreciation)
    .add(line2mPassiveActivities)
    .add(line2nLossLimitations)
    .add(line2tIntangibleDrillingCosts)
    .add(line3OtherAdjustments).value

  const amti = currency(taxableIncome).add(adjustmentTotal).value
  const exemptionBase = getAmtTableValue(AMT_EXEMPTION, year, isMarried)
  const exemptionPhaseoutThreshold = getAmtTableValue(AMT_EXEMPTION_PHASEOUT, year, isMarried)
  const exemptionReduction = Math.max(0, currency(amti).subtract(exemptionPhaseoutThreshold).multiply(0.25).value)
  const exemption = Math.max(0, currency(exemptionBase).subtract(exemptionReduction).value)
  const amtTaxBase = Math.max(0, currency(amti).subtract(exemption).value)
  const amtRateSplitThreshold = getAmtTableValue(AMT_RATE_SPLIT_THRESHOLD, year, isMarried)
  const amtBeforeForeignCredit = amtTaxBase <= amtRateSplitThreshold
    ? currency(amtTaxBase).multiply(0.26).value
    : currency(amtRateSplitThreshold).multiply(0.26).add(
        currency(amtTaxBase).subtract(amtRateSplitThreshold).multiply(0.28),
      ).value

  const effectiveAmtForeignTaxCredit = Math.min(
    Math.max(0, amtForeignTaxCredit ?? regularForeignTaxCredit),
    amtBeforeForeignCredit,
  )
  const tentativeMinTax = Math.max(0, currency(amtBeforeForeignCredit).subtract(effectiveAmtForeignTaxCredit).value)
  const regularTaxAfterCredits = Math.max(0, currency(regularTax).subtract(Math.max(0, regularForeignTaxCredit)).value)
  const amt = Math.max(0, currency(tentativeMinTax).subtract(regularTaxAfterCredits).value)

  return {
    line1TaxableIncome: taxableIncome,
    line2aTaxesOrStandardDeduction: line2a.amount,
    line2aSource: line2a.source,
    line2cInvestmentInterest,
    line2dDepletion,
    line2kDispositionOfProperty,
    line2lPost1986Depreciation,
    line2mPassiveActivities,
    line2nLossLimitations,
    line2tIntangibleDrillingCosts,
    line3OtherAdjustments,
    adjustmentTotal,
    amti,
    exemption,
    exemptionBase,
    exemptionReduction,
    exemptionPhaseoutThreshold,
    amtTaxBase,
    amtRateSplitThreshold,
    amtBeforeForeignCredit,
    line8AmtForeignTaxCredit: effectiveAmtForeignTaxCredit,
    tentativeMinTax,
    regularTax,
    regularForeignTaxCredit,
    regularTaxAfterCredits,
    amt,
    filingStatus: isMarried ? 'mfj' : 'single',
    sourceEntries,
    requiresStatementReview: manualReviewReasons.size > 0,
    manualReviewReasons: Array.from(manualReviewReasons),
  }
}
