/**
 * K-3 → Form 1116 mapping module.
 *
 * Extracts foreign income, foreign taxes, and apportionment data from a structured
 * K-1 / K-3 document (FK1StructuredData) for use in Form 1116 (Foreign Tax Credit).
 *
 * Supports two K-3 data formats:
 *   - "Canonical" (training-data format): named field keys like line6_interestIncome
 *     with nested {rows: [{country, a-g}], lineTotal: {a-g}} for section 1,
 *     and direct {a-g} objects for section 2.
 *   - "Tool" (AI extraction format): data.rows flat array with col_* keys.
 *
 * IRS Box 16 code reference (Form 1065 K-1):
 *   A  – Name of country
 *   B  – Gross income — passive category
 *   C  – Gross income — general category
 *   I  – Foreign taxes paid or accrued
 *   J  – Foreign taxes withheld at source
 */

import currency from 'currency.js'

import type { FK1StructuredData, K3Section } from '@/types/finance/k1-data'

import type { F1116Category, ForeignTaxSummary } from './types'

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Parse a possibly-string numeric value to a number (0 if unparseable). */
function toNum(v: unknown): number {
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

// ── Column extractors for both canonical and tool format ──────────────────────

/** Column indices for canonical (a–g) and tool (col_*) formats. */
interface ColRow { a: number; b: number; c: number; d: number; e: number; f: number; g: number }

function toolRowToColRow(r: Record<string, unknown>): ColRow {
  return {
    a: toNum(r['col_a_us_source']),
    b: toNum(r['col_b_foreign_branch']),
    c: toNum(r['col_c_passive']),
    d: toNum(r['col_d_general']),
    e: toNum(r['col_e_other_901j']),
    f: toNum(r['col_f_sourced_by_partner']),
    g: toNum(r['col_g_total']),
  }
}

function canonicalObjToColRow(v: unknown): ColRow | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  return {
    a: toNum(o['a']), b: toNum(o['b']), c: toNum(o['c']),
    d: toNum(o['d']), e: toNum(o['e']), f: toNum(o['f']), g: toNum(o['g']),
  }
}

// ── K-3 Part II income breakdown ──────────────────────────────────────────────

export interface K3IncomeBreakdown {
  /** Net passive foreign income (col c, foreign countries only). */
  passiveIncome: number
  /** Net general category foreign income (col d, foreign countries only). */
  generalIncome: number
  /** Total "Sourced by Partner" amounts (col f). */
  sourcedByPartner: number
  /** True when data came from the net line (line 55) rather than summed rows. */
  isNetLine: boolean
}

/**
 * Extract passive and general foreign income from K-3 Part II.
 *
 * Priority:
 * 1. Line 55 "net income (loss)" from section 2 — exact net figure.
 * 2. Sum col_c / col_d from all non-US rows in section 1 — gross income.
 */
export function extractK3IncomeBreakdown(data: FK1StructuredData): K3IncomeBreakdown {
  const sections = data.k3?.sections ?? []

  const sec2 = sections.find(s => s.sectionId === 'part2_section2')
  const sec1 = sections.find(s => s.sectionId === 'part2_section1')

  // ── Try line 55 from section 2 first ────────────────────────────────────────
  if (sec2) {
    const d = sec2.data as Record<string, unknown>

    if (Array.isArray(d['rows'])) {
      const line55 = (d['rows'] as Array<Record<string, unknown>>).find(r => String(r['line']) === '55')
      if (line55) {
        const row = toolRowToColRow(line55)
        return { passiveIncome: row.c, generalIncome: row.d, sourcedByPartner: row.f, isNetLine: true }
      }
    } else {
      const line55Key = Object.keys(d).find(k => k.match(/^line55_/))
      if (line55Key) {
        const row = canonicalObjToColRow(d[line55Key])
        if (row) {
          return { passiveIncome: row.c, generalIncome: row.d, sourcedByPartner: row.f, isNetLine: true }
        }
      }
    }
  }

  // ── Fall back: sum non-US rows from section 1 ────────────────────────────────
  let passiveIncome = 0
  let generalIncome = 0
  let sourcedByPartner = 0

  if (sec1) {
    const d = sec1.data as Record<string, unknown>

    if (Array.isArray(d['rows'])) {
      for (const r of d['rows'] as Array<Record<string, unknown>>) {
        if (String(r['country'] ?? '') === 'US') continue
        const row = toolRowToColRow(r)
        passiveIncome += row.c
        generalIncome += row.d
        sourcedByPartner += row.f
      }
    } else {
      // Canonical format: each field has .rows with per-country data
      for (const [key, val] of Object.entries(d)) {
        if (!key.startsWith('line') || key.startsWith('line24_')) continue
        const lineData = val as Record<string, unknown>
        const rows = lineData?.['rows'] as Array<Record<string, unknown>> | undefined
        if (!rows) continue
        for (const r of rows) {
          if (String(r['country'] ?? '') === 'US') continue
          const row = canonicalObjToColRow(r)
          if (row) { passiveIncome += row.c; generalIncome += row.d; sourcedByPartner += row.f }
        }
      }
      // Use line 24 totals if available (col c already excludes US source in Part II)
      const line24Key = Object.keys(d).find(k => k.startsWith('line24_'))
      if (line24Key) {
        const totals = canonicalObjToColRow(
          (d[line24Key] as Record<string, unknown>)?.['totals']
        )
        if (totals && (totals.c !== 0 || totals.d !== 0)) {
          passiveIncome = totals.c
          generalIncome = totals.d
          sourcedByPartner = totals.f
        }
      }
    }
  }

  return { passiveIncome, generalIncome, sourcedByPartner, isNetLine: false }
}

// ── K-3 Part III Section 2 — passive asset ratio for Line 4b ─────────────────

/**
 * Extract the passive asset ratio from K-3 Part III Section 2.
 * Used for Form 1116 Line 4b (apportioned interest expense).
 *
 * Returns derivedPassiveAssetRatio if present, otherwise computes
 * passive assets ÷ total assets from line 6a or line 1.
 */
export function extractK3PassiveAssetRatio(data: FK1StructuredData): number | null {
  const sec = (data.k3?.sections ?? []).find(s => s.sectionId === 'part3_section2')
  if (!sec) return null
  const d = sec.data as Record<string, unknown>

  if (typeof d['derivedPassiveAssetRatio'] === 'number') return d['derivedPassiveAssetRatio'] as number

  // Tool format rows
  if (Array.isArray(d['rows'])) {
    const rows = d['rows'] as Array<Record<string, unknown>>
    const lineRef = rows.find(r => String(r['line']) === '6a') ?? rows.find(r => String(r['line']) === '1')
    if (lineRef) {
      const total = toNum(lineRef['col_g_total'])
      const passive = toNum(lineRef['col_c_passive'])
      return total !== 0 ? passive / total : null
    }
  }

  // Canonical format
  const line6aKey = Object.keys(d).find(k => k.match(/^line6a_/))
  const line1Key = Object.keys(d).find(k => k.match(/^line1_/))
  const refKey = line6aKey ?? line1Key
  if (refKey) {
    const row = canonicalObjToColRow(d[refKey])
    if (row && row.g !== 0) return row.c / row.g
  }
  return null
}

// ── K-3 Part II Section 2 — interest expense for Line 4b ─────────────────────

/** Lines from K-3 Part II Section 2 that contain allocable interest expense. */
const INTEREST_LINES = new Set(['39', '40', '41', '42', '43'])

/**
 * Extract the total investment interest expense from K-3 Part II Section 2
 * (lines 39–43) and compute the apportioned amount for Form 1116 Line 4b.
 */
export function extractK3Line4bApportionment(data: FK1StructuredData): {
  interestExpense: number
  passiveRatio: number
  line4b: number
} | null {
  const passiveRatio = extractK3PassiveAssetRatio(data)
  if (passiveRatio === null || passiveRatio === 0) return null

  const sec2 = (data.k3?.sections ?? []).find(s => s.sectionId === 'part2_section2')
  if (!sec2) return null

  const d = sec2.data as Record<string, unknown>
  let interestExpense = 0

  if (Array.isArray(d['rows'])) {
    for (const r of d['rows'] as Array<Record<string, unknown>>) {
      if (INTEREST_LINES.has(String(r['line'] ?? ''))) {
        interestExpense += toNum(r['col_g_total'])
      }
    }
  } else {
    for (const [key, val] of Object.entries(d)) {
      const lineNum = key.match(/^line(\w+?)_/)?.[1] ?? ''
      if (INTEREST_LINES.has(lineNum)) {
        const row = canonicalObjToColRow(val)
        if (row) interestExpense += row.g
      }
    }
  }

  if (interestExpense === 0) return null

  return {
    interestExpense,
    passiveRatio,
    line4b: currency(interestExpense).multiply(passiveRatio).value,
  }
}

// ── K-3 Part III Section 4 — foreign taxes ───────────────────────────────────

/** Extract total foreign taxes from K-3 Part III Section 4. */
export function extractK3ForeignTaxTotal(data: FK1StructuredData): number {
  const sec = (data.k3?.sections ?? []).find(s => s.sectionId === 'part3_section4')
  if (!sec) return 0
  const d = sec.data as Record<string, unknown>

  // Canonical format: data.line1_foreignTaxesPaid.grandTotalUSD
  const ftKey = Object.keys(d).find(k => k.includes('foreignTax') || k.includes('foreign_tax'))
  if (ftKey) {
    const ftData = d[ftKey] as Record<string, unknown> | undefined
    if (ftData) {
      const grand = toNum(ftData['grandTotalUSD'] as number | undefined)
      if (grand !== 0) return grand
      // Sum countries array
      const countries = ftData['countries'] as Array<Record<string, unknown>> | undefined
      if (countries) {
        return countries.reduce((acc, c) => acc + toNum(c['total'] ?? c['passiveForeign'] ?? c['amount_usd']), 0)
      }
    }
  }

  // Tool format: array of country objects
  if (Array.isArray(d['countries'])) {
    const grand = toNum(d['grandTotalUSD'])
    if (grand !== 0) return grand
    return (d['countries'] as Array<Record<string, unknown>>).reduce(
      (acc, c) => acc + toNum(c['amount_usd'] ?? c['total']), 0
    )
  }
  return 0
}

// ── Primary extraction functions ──────────────────────────────────────────────

/**
 * Extract all foreign tax information from a structured K-1 document.
 *
 * Uses K-3 Part II data when available (both canonical and tool formats);
 * falls back to Box 16 codes I/J for taxes and B/C for income.
 * Respects the k3Elections.sourcedByPartnerAsUSSource election.
 *
 * Returns one entry per income category (passive, general) with non-zero data.
 */
export function extractForeignTaxSummaries(
  data: FK1StructuredData,
  accountId?: number | null,
): ForeignTaxSummary[] {
  const box21 = toNum(data.fields['21']?.value)
  const box16I = getCodeValue(data.codes, '16', 'I')
  const box16J = getCodeValue(data.codes, '16', 'J')
  // When Box 21 and Box 16 I/J are absent, fall back to K-3 Part III Section 4 (common for fund K-1s).
  const boxTotal = currency(box21 > 0 ? box21 : box16I).add(box16J).value
  const totalForeignTaxPaid = boxTotal !== 0 ? boxTotal : extractK3ForeignTaxTotal(data)

  const breakdown = extractK3IncomeBreakdown(data)
  const electionSBPasUS = data.k3Elections?.sourcedByPartnerAsUSSource ?? false

  // When foreign tax is zero and there's no col-f income requiring Form 1116 reporting, skip.
  if (totalForeignTaxPaid === 0 && (breakdown.sourcedByPartner === 0 || electionSBPasUS)) return []

  // When the SBP election is NOT active, col_f (sourced-by-partner) amounts are
  // treated as foreign-source and added to passive income for Form 1116 purposes.
  // When the election IS active, they are US-source — excluded from foreign income.
  const effectivePassiveIncome = electionSBPasUS
    ? breakdown.passiveIncome
    : currency(breakdown.passiveIncome).add(breakdown.sourcedByPartner).value

  const results: ForeignTaxSummary[] = []

  if (effectivePassiveIncome !== 0 || breakdown.generalIncome !== 0) {
    // Passive category
    if (effectivePassiveIncome !== 0) {
      results.push({
        totalForeignTaxPaid,
        category: 'passive',
        grossForeignIncome: effectivePassiveIncome,
        sourcedByPartner: breakdown.sourcedByPartner,
        electionSBPasUS,
        sourceType: 'k1',
        accountId: accountId ?? null,
      })
    }
    // General category (separate Form 1116 if present)
    if (breakdown.generalIncome !== 0) {
      results.push({
        totalForeignTaxPaid: 0, // taxes typically tracked as passive for most partnerships
        category: 'general',
        grossForeignIncome: breakdown.generalIncome,
        sourcedByPartner: 0,
        electionSBPasUS,
        sourceType: 'k1',
        accountId: accountId ?? null,
      })
    }
  } else {
    // No K-3 Part II data — fall back to Box 16 B/C
    const passiveIncome = getCodeValue(data.codes, '16', 'B')
    const generalIncome = getCodeValue(data.codes, '16', 'C')
    const category: F1116Category = generalIncome > 0 ? 'general' : 'passive'
    const grossForeignIncome = currency(passiveIncome).add(generalIncome).value
    const countryCode = data.codes['16']?.find(i => i.code.toUpperCase() === 'A')?.value
    results.push({
      totalForeignTaxPaid,
      category,
      country: countryCode ?? undefined,
      grossForeignIncome: grossForeignIncome > 0 ? grossForeignIncome : undefined,
      sourceType: 'k1',
      accountId: accountId ?? null,
    })
  }

  return results
}

/** @deprecated Use extractForeignTaxSummaries instead. Kept for backward compat. */
export function extractForeignTaxFromK1(
  data: FK1StructuredData,
  accountId?: number | null,
): ForeignTaxSummary | null {
  const summaries = extractForeignTaxSummaries(data, accountId)
  return summaries.find(s => s.category === 'passive') ?? summaries[0] ?? null
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
 */
export function calculateApportionedInterest(
  totalInterestExpense: number,
  foreignAdjustedBasis: number,
  totalAdjustedBasis: number,
): { apportionedForeignInterest: number; ratio: number } {
  if (totalAdjustedBasis === 0) return { apportionedForeignInterest: 0, ratio: 0 }
  const ratio = currency(foreignAdjustedBasis).divide(totalAdjustedBasis).value
  const apportionedForeignInterest = currency(totalInterestExpense).multiply(ratio).value
  return { apportionedForeignInterest, ratio }
}

// ── NIIT helpers ──────────────────────────────────────────────────────────────

/**
 * Compute Net Investment Income (NII) components from K-1 data.
 * NII = passive foreign income + interest + dividends + capital gains.
 * Form 8960: NIIT = 3.8% × min(NII, MAGI − threshold).
 */
export function extractK1NIIComponents(data: FK1StructuredData): {
  passiveIncome: number
  interestIncome: number
  dividends: number
  capitalGains: number
  totalNII: number
} {
  const field = (box: string) => toNum(data.fields[box]?.value)
  const breakdown = extractK3IncomeBreakdown(data)

  const passiveIncome = breakdown.passiveIncome
  // Box 5 interest is generally US-source — exclude from NII unless K-3 shows otherwise
  const interestIncome = 0
  const dividends = field('6a') // ordinary dividends are NII
  const capitalGains = currency(field('8')).add(field('9a')).value // ST + LT

  return {
    passiveIncome,
    interestIncome,
    dividends,
    capitalGains,
    totalNII: currency(passiveIncome).add(interestIncome).add(dividends).add(capitalGains).value,
  }
}

// ── Re-export Section for consumers ──────────────────────────────────────────

export type { ForeignTaxSummary } from './types'
export type { K3Section }
