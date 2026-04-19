/**
 * Form 8960 — Net Investment Income Tax (NIIT)
 *
 * 3.8% tax on the lesser of:
 *   (a) Net Investment Income, or
 *   (b) MAGI − threshold ($200k single / $250k MFJ)
 *
 * NII (Part I) components:
 *   Line 1  : Taxable interest (Schedule B)
 *   Line 2  : Ordinary dividends (Schedule B)
 *   Line 5a : Net capital gains (from Schedule D line 19 / Form 4797)
 *   Line 4a : Gross passive income from partnerships/S-corps (Schedule E)
 *   (minus)
 *   Line 9a : Investment interest expense (Form 4952 line 6)
 *
 * Note: QBI deduction does NOT reduce NII.
 * Note: W-2 wages and SE income are NOT NII.
 *
 * Source: IRC §1411; IRS Form 8960 instructions.
 */

import currency from 'currency.js'

export const NIIT_THRESHOLD = {
  single: 200_000,
  mfj: 250_000,
} as const

export type { Form8960Lines } from '@/types/finance/tax-return'
import type { Form8960Lines } from '@/types/finance/tax-return'

export interface Form8960NiiComponent {
  label: string
  amount: number
}

export function computeForm8960Lines({
  taxableInterest,
  ordinaryDividends,
  netCapGainsRaw,
  passiveIncome,
  investmentInterestExpense,
  magi,
  isMarried,
  interestSources = [],
  dividendSources = [],
  passiveSources = [],
}: {
  taxableInterest: number
  ordinaryDividends: number
  /** Raw Schedule D line 16 value (may be negative). */
  netCapGainsRaw: number
  passiveIncome: number
  /** Positive number — will be applied as a deduction. */
  investmentInterestExpense: number
  magi: number
  isMarried: boolean
  interestSources?: { label: string; amount: number }[]
  dividendSources?: { label: string; amount: number }[]
  passiveSources?: { label: string; amount: number }[]
}): Form8960Lines {
  // Capital gains contribute to NII only when positive; losses don't reduce NII below 0
  const netCapGains = Math.max(0, netCapGainsRaw)

  const grossNII = currency(taxableInterest)
    .add(ordinaryDividends)
    .add(netCapGains)
    .add(passiveIncome).value

  const totalDeductions = investmentInterestExpense
  const netInvestmentIncome = Math.max(0, currency(grossNII).subtract(totalDeductions).value)

  const threshold = isMarried ? NIIT_THRESHOLD.mfj : NIIT_THRESHOLD.single
  const magiExcess = Math.max(0, currency(magi).subtract(threshold).value)
  const niitBase = Math.min(netInvestmentIncome, magiExcess)
  const niitTax = currency(niitBase).multiply(0.038).value

  const components: Form8960NiiComponent[] = [
    { label: 'Taxable interest (Schedule B)', amount: taxableInterest },
    { label: 'Ordinary dividends (Schedule B)', amount: ordinaryDividends },
    { label: 'Net capital gains (Schedule D)', amount: netCapGains },
    ...(passiveIncome !== 0 ? [{ label: 'Net passive income (K-1 Schedule E)', amount: passiveIncome }] : []),
    ...(investmentInterestExpense > 0 ? [{ label: 'Less: investment interest expense (Form 4952)', amount: -investmentInterestExpense }] : []),
  ]

  return {
    taxableInterest,
    ordinaryDividends,
    netCapGains,
    passiveIncome,
    investmentInterestExpense,
    grossNII,
    totalDeductions,
    netInvestmentIncome,
    magi,
    threshold,
    magiExcess,
    niitTax,
    components,
    interestSources,
    dividendSources,
    passiveSources,
  }
}
