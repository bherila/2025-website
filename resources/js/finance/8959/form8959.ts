/**
 * Form 8959 — Additional Medicare Tax
 *
 * 0.9% tax on wages/SE income above the threshold. Applies to:
 *   - W-2 wages (Part I)
 *   - Self-employment income (Part II, not computed here — requires SE income)
 *
 * Threshold (not inflation-adjusted):
 *   Single / MFS / HOH : $200,000
 *   MFJ                : $250,000
 *
 * Source: IRC §3101(b)(2); IRS Form 8959 instructions.
 */

import currency from 'currency.js'

export const ADDITIONAL_MEDICARE_THRESHOLD = {
  single: 200_000,
  mfj: 250_000,
} as const

import type { Form8959Lines } from '@/types/finance/tax-return'

export function computeForm8959Lines(
  wages: number,
  isMarried: boolean,
  sources: { label: string; wages: number }[] = [],
): Form8959Lines {
  const threshold = isMarried ? ADDITIONAL_MEDICARE_THRESHOLD.mfj : ADDITIONAL_MEDICARE_THRESHOLD.single
  const excessWages = currency(Math.max(0, currency(wages).subtract(threshold).value)).value
  const additionalTax = currency(excessWages).multiply(0.009).value
  return { wages, threshold, excessWages, additionalTax, sources }
}
