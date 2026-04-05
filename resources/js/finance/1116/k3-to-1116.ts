/**
 * K-3 → Form 1116 mapping module.
 *
 * Extracts foreign income and foreign taxes from a structured K-1 document
 * (FK1StructuredData) to produce a ForeignTaxSummary for the Form 1116 worksheet.
 *
 * IRS Box 16 code reference (Form 1065 K-1):
 *   A  – Name of country
 *   B  – Gross income — passive category
 *   C  – Gross income — general category
 *   I  – Foreign taxes paid or accrued
 *   J  – Foreign taxes withheld at source
 *
 * 1099-DIV Box 7 = foreign taxes paid
 * 1099-INT Box 6 = foreign taxes paid
 */

import type { FK1StructuredData } from '@/types/finance/k1-data'

import type { F1116Category, ForeignTaxSummary } from './types'

/** Parse a possibly-string numeric value to a number (0 if unparseable). */
function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return isFinite(n) ? n : 0
}

/** Extract the value for a given code from a coded box. */
function getCodeValue(codes: FK1StructuredData['codes'], box: string, code: string): number {
  const items = codes[box]
  if (!items) return 0
  const item = items.find(i => i.code.toUpperCase() === code.toUpperCase())
  return item ? toNum(item.value) : 0
}

/** Extract all foreign tax information from a structured K-1 document (Box 16). */
export function extractForeignTaxFromK1(
  data: FK1StructuredData,
  accountId?: number | null,
): ForeignTaxSummary | null {
  const foreignTaxesPaid = getCodeValue(data.codes, '16', 'I')
  const foreignTaxesWithheld = getCodeValue(data.codes, '16', 'J')
  const totalForeignTaxPaid = foreignTaxesPaid + foreignTaxesWithheld

  if (totalForeignTaxPaid === 0) return null

  const country = data.codes['16']?.find(i => i.code.toUpperCase() === 'A')?.value ?? undefined

  // Determine income category from the K-3 sections or Box 16 codes
  const passiveIncome = getCodeValue(data.codes, '16', 'B')
  const generalIncome = getCodeValue(data.codes, '16', 'C')
  const category: F1116Category = generalIncome > 0 ? 'general' : 'passive'

  const grossForeignIncome = passiveIncome + generalIncome

  return {
    totalForeignTaxPaid,
    category,
    country,
    grossForeignIncome: grossForeignIncome || undefined,
    sourceType: 'k1',
    accountId: accountId ?? null,
  }
}

/**
 * Extract foreign tax summary from a 1099-DIV parsed data object.
 * Box 7 = foreign taxes paid, Box 8 = foreign country.
 */
export function extractForeignTaxFrom1099Div(
  parsedData: Record<string, unknown>,
  accountId?: number | null,
): ForeignTaxSummary | null {
  const foreignTax = toNum(parsedData['box7_foreign_tax'] as number | string | null | undefined)
  if (foreignTax === 0) return null

  return {
    totalForeignTaxPaid: foreignTax,
    category: 'passive' as F1116Category,
    country: (parsedData['box8_foreign_country'] as string | undefined) ?? undefined,
    sourceType: '1099_div',
    accountId: accountId ?? null,
  }
}

/**
 * Extract foreign tax summary from a 1099-INT parsed data object.
 * Box 6 = foreign taxes paid, Box 7 = foreign country.
 */
export function extractForeignTaxFrom1099Int(
  parsedData: Record<string, unknown>,
  accountId?: number | null,
): ForeignTaxSummary | null {
  const foreignTax = toNum(parsedData['box6_foreign_tax'] as number | string | null | undefined)
  if (foreignTax === 0) return null

  return {
    totalForeignTaxPaid: foreignTax,
    category: 'passive' as F1116Category,
    country: (parsedData['box7_foreign_country'] as string | undefined) ?? undefined,
    sourceType: '1099_int',
    accountId: accountId ?? null,
  }
}

/**
 * Calculate the apportioned interest expense for Form 1116 Line 4b
 * using the Asset Method (IRS Publication 514).
 *
 * Apportioned Foreign Interest = Total Interest Expense
 *   × (Foreign Adjusted Basis / Total Adjusted Basis)
 *
 * Returns 0 if totalAdjustedBasis is 0 (avoid divide-by-zero).
 */
export function calculateApportionedInterest(
  totalInterestExpense: number,
  foreignAdjustedBasis: number,
  totalAdjustedBasis: number,
): { apportionedForeignInterest: number; ratio: number } {
  if (totalAdjustedBasis === 0) {
    return { apportionedForeignInterest: 0, ratio: 0 }
  }
  const ratio = foreignAdjustedBasis / totalAdjustedBasis
  const apportionedForeignInterest = totalInterestExpense * ratio
  return { apportionedForeignInterest, ratio }
}
