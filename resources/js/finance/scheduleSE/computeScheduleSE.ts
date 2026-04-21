import currency from 'currency.js'

import type { fin_payslip } from '@/components/payslip/payslipDbCols'
import type { TaxDocument, W2ParsedData } from '@/types/finance/tax-document'

export interface ScheduleSESourceEntry {
  label: string
  amount: number
  sourceType: 'k1_box14_a' | 'k1_box14_c' | 'schedule_c'
}

export interface ScheduleSELines {
  entries: ScheduleSESourceEntry[]
  netEarningsFromSE: number
  seTaxableEarnings: number
  socialSecurityWageBase: number
  socialSecurityWages: number
  remainingSocialSecurityWageBase: number
  socialSecurityTaxableEarnings: number
  socialSecurityTax: number
  medicareWages: number
  medicareTaxableEarnings: number
  medicareTax: number
  additionalMedicareThreshold: number
  additionalMedicareTaxableEarnings: number
  additionalMedicareTax: number
  seTax: number
  deductibleSeTax: number
}

const SE_EARNINGS_FACTOR = 0.9235
const SOCIAL_SECURITY_RATE = 0.124
const MEDICARE_RATE = 0.029
const ADDITIONAL_MEDICARE_RATE = 0.009

const SOCIAL_SECURITY_WAGE_BASE: Record<number, number> = {
  2018: 128_400,
  2019: 132_900,
  2020: 137_700,
  2021: 142_800,
  2022: 147_000,
  2023: 160_200,
  2024: 168_600,
  2025: 176_100,
}

export const ADDITIONAL_MEDICARE_THRESHOLD = {
  single: 200_000,
  mfj: 250_000,
} as const

function socialSecurityWageBase(year: number): number {
  return SOCIAL_SECURITY_WAGE_BASE[year] ?? SOCIAL_SECURITY_WAGE_BASE[2025] ?? 176_100
}

function sumW2Field(reviewedW2Docs: TaxDocument[], field: keyof W2ParsedData, fallbackField?: keyof W2ParsedData): number {
  return reviewedW2Docs.reduce((acc, doc) => {
    const parsed = doc.parsed_data as W2ParsedData | null
    const primary = parsed?.[field]
    const fallback = fallbackField ? parsed?.[fallbackField] : null
    const numericValue = typeof primary === 'number'
      ? primary
      : typeof fallback === 'number'
        ? fallback
        : 0
    return currency(acc).add(numericValue).value
  }, 0)
}

function sumPayslipField(payslips: fin_payslip[], field: keyof fin_payslip): number {
  return payslips.reduce((acc, row) => currency(acc).add(Number(row[field] ?? 0)).value, 0)
}

export function computeSocialSecurityWages(reviewedW2Docs: TaxDocument[], payslips: fin_payslip[] = []): number {
  if (reviewedW2Docs.length > 0) {
    return sumW2Field(reviewedW2Docs, 'box3_ss_wages', 'box1_wages')
  }

  return sumPayslipField(payslips, 'taxable_wages_oasdi')
}

export function computeMedicareWages(reviewedW2Docs: TaxDocument[], payslips: fin_payslip[] = []): number {
  if (reviewedW2Docs.length > 0) {
    return sumW2Field(reviewedW2Docs, 'box5_medicare_wages', 'box1_wages')
  }

  return sumPayslipField(payslips, 'taxable_wages_medicare')
}

export function computeScheduleSELines({
  entries,
  year,
  isMarried = false,
  socialSecurityWages = 0,
  medicareWages = 0,
}: {
  entries: ScheduleSESourceEntry[]
  year: number
  isMarried?: boolean
  socialSecurityWages?: number
  medicareWages?: number
}): ScheduleSELines {
  const netEarningsFromSE = entries.reduce((acc, entry) => currency(acc).add(entry.amount).value, 0)
  const seTaxableEarnings = currency(Math.max(0, netEarningsFromSE)).multiply(SE_EARNINGS_FACTOR).value

  const wageBase = socialSecurityWageBase(year)
  const remainingSocialSecurityWageBase = Math.max(0, currency(wageBase).subtract(socialSecurityWages).value)
  const socialSecurityTaxableEarnings = Math.min(seTaxableEarnings, remainingSocialSecurityWageBase)
  const socialSecurityTax = currency(socialSecurityTaxableEarnings).multiply(SOCIAL_SECURITY_RATE).value

  const medicareTaxableEarnings = seTaxableEarnings
  const medicareTax = currency(medicareTaxableEarnings).multiply(MEDICARE_RATE).value

  const additionalMedicareThreshold = isMarried
    ? ADDITIONAL_MEDICARE_THRESHOLD.mfj
    : ADDITIONAL_MEDICARE_THRESHOLD.single
  const remainingAdditionalMedicareThreshold = Math.max(0, currency(additionalMedicareThreshold).subtract(medicareWages).value)
  const additionalMedicareTaxableEarnings = Math.max(0, currency(medicareTaxableEarnings).subtract(remainingAdditionalMedicareThreshold).value)
  const additionalMedicareTax = currency(additionalMedicareTaxableEarnings).multiply(ADDITIONAL_MEDICARE_RATE).value

  const seTax = currency(socialSecurityTax).add(medicareTax).value
  const deductibleSeTax = currency(seTax).divide(2).value

  return {
    entries,
    netEarningsFromSE,
    seTaxableEarnings,
    socialSecurityWageBase: wageBase,
    socialSecurityWages,
    remainingSocialSecurityWageBase,
    socialSecurityTaxableEarnings,
    socialSecurityTax,
    medicareWages,
    medicareTaxableEarnings,
    medicareTax,
    additionalMedicareThreshold,
    additionalMedicareTaxableEarnings,
    additionalMedicareTax,
    seTax,
    deductibleSeTax,
  }
}
