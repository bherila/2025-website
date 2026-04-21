import currency from 'currency.js'

import { ALL_K1_CODES } from '@/components/finance/k1/k1-codes'
import { K1_CODE_ROUTING_NOTES } from '@/lib/finance/k1RoutingNotes'
import type { FK1StructuredData } from '@/types/finance/k1-data'
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
  const v = data.fields[box]?.value
  if (!v) return 0
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

export function parseK1Codes(data: FK1StructuredData, box: string): number {
  const items = data.codes[box] ?? []
  return items.reduce((acc, item) => {
    const n = parseFloat(item.value)
    return isNaN(n) ? acc : acc.add(n)
  }, currency(0)).value
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
    .add(box12 !== 0 ? -Math.abs(box12) : 0)
    .add(box13 !== 0 ? -Math.abs(box13) : 0)
    .add(box21 !== 0 ? -Math.abs(box21) : 0)
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
      const code = item.code.toUpperCase()
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

/** Returns a checklist of review completeness items for the K-1 review panel. */
export function getK1CompletenessChecklist(data: FK1StructuredData): CompletenessItem[] {
  const items: CompletenessItem[] = []

  const hasBox20Z = (data.codes['20'] ?? []).some((i) => i.code.toUpperCase() === 'Z')
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
    items.push({ item: 'Box 17 — AMT items present; Form 6251 computation not yet implemented', status: 'needs_user_action' })
  }

  if ((data.codes['14'] ?? []).length > 0) {
    items.push({ item: 'Box 14 — Self-employment income present; Schedule SE not yet computed', status: 'needs_user_action' })
  }

  if ((data.k3?.sections ?? []).length > 0) {
    items.push({ item: 'K-3 attached — verify foreign tax totals on Form 1116 tab', status: 'needs_user_action' })
  }

  const otherCodes: [string, string][] = [['11', 'F'], ['13', 'ZZ'], ['20', 'Y']]
  const hasOther = otherCodes.some(([box, code]) =>
    (data.codes[box] ?? []).some((i) => i.code.toUpperCase() === code),
  )
  if (hasOther) {
    items.push({ item: '"Other" codes present — check attached statement for categorization', status: 'needs_user_action' })
  }

  return items
}
