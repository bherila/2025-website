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

export interface Form8960NiiComponent {
  label: string
  amount: number
}

export interface Form8960Lines {
  /** Part I — NII components */
  taxableInterest: number
  ordinaryDividends: number
  /** Net capital gains (Schedule D line 19, capped at 0 — losses don't reduce NII below 0). */
  netCapGains: number
  /** Net passive income from K-1 partnerships (Schedule E passive). */
  passiveIncome: number
  /** Investment interest expense deduction (Form 4952 line 6, negative). */
  investmentInterestExpense: number
  /** Part I Line 8 — Total NII before deductions. */
  grossNII: number
  /** Part II — Total deductions (investment interest expense). */
  totalDeductions: number
  /** Part III Line 12 — Net Investment Income. */
  netInvestmentIncome: number
  /** MAGI (estimated as total income). */
  magi: number
  /** Threshold ($200k single / $250k MFJ). */
  threshold: number
  /** MAGI − threshold (0 if below threshold). */
  magiExcess: number
  /** NIIT = 3.8% × min(NII, magiExcess). */
  niitTax: number
  /** Individual NII line items for display. */
  components: Form8960NiiComponent[]
}

export function computeForm8960Lines({
  taxableInterest,
  ordinaryDividends,
  netCapGainsRaw,
  passiveIncome,
  investmentInterestExpense,
  magi,
  isMarried,
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
  }
}
