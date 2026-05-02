import currency from 'currency.js'

import { ALL_K1_CODES } from '@/components/finance/k1/k1-codes'
import { K1_CODE_ROUTING_NOTES } from '@/lib/finance/k1RoutingNotes'
import { parseMoney, parseMoneyOrZero, sumMoneyValues } from '@/lib/finance/money'
import type { FK1StructuredData, K1CodeItem } from '@/types/finance/k1-data'
import { isFK1StructuredData } from '@/types/finance/k1-data'

/**
 * Returns the K-3 "Sourced by Partner" election state for a K-1 document.
 * Accepts `unknown` so it works with both typed FK1StructuredData and the
 * untyped `parsed_data` / `editData` coming from the review modal.
 */
export function getSbpElection(data: unknown): boolean {
  if (!isFK1StructuredData(data)) return false
  return data.k3Elections?.sourcedByPartnerAsUSSource ?? false
}

export function parseK1Field(data: FK1StructuredData, box: string): number {
  return parseMoneyOrZero(data.fields[box]?.value)
}

export function parseK1Codes(data: FK1StructuredData, box: string): number {
  return sumMoneyValues((data.codes[box] ?? []).map((item) => item.value))
}

export function normalizeK1Code(code: string): string {
  return code.trim().toUpperCase()
}

export function isK1Code(code: string, expectedCode: string): boolean {
  return normalizeK1Code(code) === normalizeK1Code(expectedCode)
}

export function getK1CodeItems(data: FK1StructuredData, box: string, code: string): K1CodeItem[] {
  return (data.codes[box] ?? []).filter((item) => isK1Code(item.code, code))
}

export function getK1PartnerName(data: FK1StructuredData, fallback = 'Partnership'): string {
  return data.fields['B']?.value?.split('\n')[0] ?? fallback
}

export function sumK1CodeItems(data: FK1StructuredData, box: string, code: string): number {
  return sumMoneyValues(getK1CodeItems(data, box, code).map((item) => item.value))
}

export function sumAbsK1CodeItems(data: FK1StructuredData, box: string, code: string): number {
  // Box 13 deduction helpers intentionally treat reported values as positive magnitudes.
  return getK1CodeItems(data, box, code)
    .reduce((acc, item) => acc.add(Math.abs(parseMoneyOrZero(item.value))), currency(0)).value
}

/**
 * Classifies a Box 11 Code S (non-portfolio capital gain/loss) line as
 * short-term or long-term using the partnership's supplemental-statement
 * notes. AQR-style K-1s annotate each sub-line with text like
 * "Net short-term capital loss" or "Net long-term capital gain, assets held
 * more than 3 years"; this helper extracts that character so the amount can
 * route to Schedule D line 5 (ST) or line 12 (LT).
 *
 * Returns undefined when the notes are missing or ambiguous, leaving the
 * caller to surface a warning rather than silently misclassify.
 */
export function classify11SCharacter(notes?: string | null): 'short' | 'long' | undefined {
  if (!notes) return undefined
  const hasShort = /\b(?:short[-\s]+term|st(?=\s+capital\b))\b/i.test(notes)
  const hasLong = /\b(?:long[-\s]+term|lt(?=\s+capital\b))\b/i.test(notes)
  if (hasShort && !hasLong) return 'short'
  if (hasLong && !hasShort) return 'long'
  return undefined
}

/**
 * Resolves the ST/LT character of a Box 11S sub-line: the user-supplied
 * `character` override wins; otherwise the supplemental-statement notes are
 * scanned for a "short term" / "long term" phrase.
 */
export function resolve11SCharacter(item: { character?: 'short' | 'long'; notes?: string }): 'short' | 'long' | undefined {
  return item.character ?? classify11SCharacter(item.notes)
}

export function isTraderFundK1(data: FK1StructuredData): boolean {
  const structuredTraderStatus = data.fields['partnershipPosition_traderInSecurities']?.value
  if (structuredTraderStatus === 'true') return true
  if (structuredTraderStatus === 'false') return false

  const haystack = [
    data.raw_text,
    ...(data.warnings ?? []),
    ...Object.values(data.codes).flatMap((items) => items.map((item) => item.notes ?? '')),
  ].join(' ').toLowerCase()

  const hasNegatedTraderInSecurities = /\b(?:not|isn't|is not|was not|no)\s+(?:a\s+)?trader in securities\b/i.test(haystack)
  if (hasNegatedTraderInSecurities) {
    return [
      'trader deductions',
      'trading activities',
      'trading in financial instruments',
      'trading in financial instruments/commodities',
    ].some((needle) => haystack.includes(needle))
  }

  return [
    'trader in securities',
    'trader deductions',
    'trading activities',
    'trading in financial instruments',
    'trading in financial instruments/commodities',
  ].some((needle) => haystack.includes(needle))
}

export function routesInvestmentInterestToScheduleE(item: K1CodeItem): boolean {
  const notes = item.notes?.toLowerCase() ?? ''
  return notes.includes('schedule e') && notes.includes('nonpassive')
}

export interface K1Form461Disclosure {
  capitalGains: number
  capitalLosses: number
  otherIncome: number
  otherDeductions: number
  net: number
}

function noteAmount(notes: string, label: string): number | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = notes.match(new RegExp(`${escaped}:\\s*(\\(?-?\\$?[\\d,]+(?:\\.\\d+)?\\)?)`, 'i'))
  if (!match?.[1]) return null
  return parseMoney(match[1])
}

export function extractK1Form461Disclosure(data: FK1StructuredData): K1Form461Disclosure | null {
  const item = getK1CodeItems(data, '20', 'AJ')[0]
  const notes = item?.notes
  if (!notes) return null

  const capitalGains = noteAmount(notes, 'Capital gains from trade or business')
  const capitalLosses = noteAmount(notes, 'Capital losses from trade or business')
  const otherIncome = noteAmount(notes, 'Other income from trade or business')
  const otherDeductions = noteAmount(notes, 'Other deductions from trade or business')

  if (capitalGains === null || capitalLosses === null || otherIncome === null || otherDeductions === null) {
    return null
  }

  return {
    capitalGains,
    capitalLosses,
    otherIncome,
    otherDeductions,
    net: currency(capitalGains).add(capitalLosses).add(otherIncome).add(otherDeductions).value,
  }
}

export function k1NetIncome(data: FK1StructuredData): number {
  // Box 6b (qualified dividends) is a subset of Box 6a (ordinary dividends) — exclude to avoid double-counting.
  const INCOME_BOXES = ['1', '2', '3', '4', '5', '6a', '6c', '7', '8', '9a', '9b', '9c', '10']
  const incomeTotal = INCOME_BOXES.reduce((acc, box) => acc.add(parseK1Field(data, box)), currency(0))
    .add(parseK1Codes(data, '11'))
  const box12 = parseK1Field(data, '12')
  const box13 = parseK1Codes(data, '13')
  const box21 = parseK1Field(data, '21')
  const deductionTotal = currency(0)
    .subtract(Math.abs(box12))
    .subtract(Math.abs(box13))
    .subtract(Math.abs(box21))
  return incomeTotal.add(deductionTotal).value
}

// ── Review panel helpers ──────────────────────────────────────────────────────

const CODED_BOXES = ['11', '13', '14', '15', '16', '17', '18', '19', '20']

export interface UnroutedCode {
  box: string
  code: string
  label: string
  value: string
}

/** Returns every coded K-1 item that has no entry in K1_CODE_ROUTING_NOTES — i.e., not yet routed to any form. */
export function getUnroutedCodes(data: FK1StructuredData): UnroutedCode[] {
  const results: UnroutedCode[] = []
  for (const box of CODED_BOXES) {
    for (const item of data.codes[box] ?? []) {
      const code = normalizeK1Code(item.code)
      if (K1_CODE_ROUTING_NOTES[box]?.[code] === undefined) {
        results.push({ box, code, label: ALL_K1_CODES[box]?.[code] ?? `Code ${code}`, value: item.value })
      }
    }
  }
  return results
}

/** Returns the activity classification for Form 8582 / §469 passive-loss purposes. */
export function getK1ActivityClassification(data: FK1StructuredData): 'passive' | 'nonpassive' | 'unknown' {
  if (data.fields['partnershipPosition_traderInSecurities']?.value === 'true') return 'nonpassive'
  const partnerType = (data.fields['G']?.value ?? data.fields['G_partnerType']?.value ?? '').toLowerCase()
  if (partnerType.includes('general') || partnerType.includes(' gp')) return 'nonpassive'
  if (partnerType.includes('limited') || partnerType.includes(' lp')) return 'passive'
  return 'unknown'
}

export interface CompletenessItem {
  item: string
  status: 'ok' | 'missing' | 'needs_user_action'
}

// ── Multi-K-1 incomplete-computation signals ──────────────────────────────────

/** Returns entity names of reviewed K-1s that have Box 17 AMT items. */
export function getK1sWithAMTItems(k1s: FK1StructuredData[]): string[] {
  return k1s
    .filter((d) => (d.codes['17'] ?? []).length > 0)
    .map((d) => d.fields['B']?.value?.split('\n')[0] ?? 'Unknown entity')
}

/** Returns entity names of reviewed K-1s that have Box 14 self-employment codes. */
export function getK1sWithSEItems(k1s: FK1StructuredData[]): string[] {
  return k1s
    .filter((d) => (d.codes['14'] ?? []).some((item) => {
      const code = normalizeK1Code(item.code)
      return code === 'A' || code === 'C'
    }))
    .map((d) => d.fields['B']?.value?.split('\n')[0] ?? 'Unknown entity')
}

/** Returns entity names of reviewed K-1s that have negative Box 1 losses that may need passive-loss review. */
export function getK1sWithPassiveLosses(k1s: FK1StructuredData[]): string[] {
  return k1s
    .filter((d) => {
      const box1 = parseK1Field(d, '1')
      if (box1 >= 0) return false
      return getK1ActivityClassification(d) !== 'nonpassive'
    })
    .map((d) => d.fields['B']?.value?.split('\n')[0] ?? 'Unknown entity')
}

/** Returns a checklist of review completeness items for the K-1 review panel. */
export function getK1CompletenessChecklist(data: FK1StructuredData): CompletenessItem[] {
  const items: CompletenessItem[] = []
  const box1 = parseK1Field(data, '1')
  const classification = getK1ActivityClassification(data)

  if (box1 !== 0 && classification === 'unknown') {
    items.push({
      item: 'Box 1 ordinary business income/loss is treated as passive by default — confirm partner classification for Form 8582',
      status: 'needs_user_action',
    })
  }

  const hasBox20Z = (data.codes['20'] ?? []).some((i) => isK1Code(i.code, 'Z'))
  if (hasBox20Z) {
    const hasStatementA = data.statementA != null
    items.push({
      item: hasStatementA
        ? 'Box 20Z — §199A/QBI: Statement A extracted (W-2 wages, UBIA, SSTB flag)'
        : 'Box 20Z — §199A/QBI: Statement A not yet extracted (W-2 wages, UBIA, SSTB flag)',
      status: hasStatementA ? 'ok' : 'missing',
    })
  }

  if ((data.codes['17'] ?? []).length > 0) {
    items.push({ item: 'Box 17 — AMT items present; review Form 6251 and any attached AMT statement items', status: 'needs_user_action' })
  }

  if ((data.codes['14'] ?? []).length > 0) {
    items.push({ item: 'Box 14 — Self-employment income present; review the Schedule SE tab', status: 'needs_user_action' })
  }

  if ((data.k3?.sections ?? []).length > 0) {
    items.push({ item: 'K-3 attached — verify foreign tax totals on Form 1116 tab', status: 'needs_user_action' })
  }

  const otherCodes: [string, string][] = [['11', 'F'], ['13', 'ZZ'], ['20', 'Y']]
  const hasOther = otherCodes.some(([box, code]) =>
    (data.codes[box] ?? []).some((i) => isK1Code(i.code, code)),
  )
  if (hasOther) {
    items.push({ item: '"Other" codes present — check attached statement for categorization', status: 'needs_user_action' })
  }

  return items
}
