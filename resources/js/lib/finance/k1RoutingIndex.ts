/**
 * K-1 destination routing — derived from the per-fund tax facts, NOT hand-authored.
 *
 * K-1 line treatment is fund-type / footnote dependent (standard vs VC vs trader
 * fund), so a static box→destination table would be wrong. The PHP facts builders
 * already apply that logic and emit a `TaxFactSource` for every consumed line,
 * carrying `taxDocumentId`, `box`, `code`, and a stable `routing` enum string.
 * This module inverts those sources into a `(taxDocumentId, box, code)` lookup and
 * maps the finite `TaxFactRouting` enum to a registry `FormId` for drill-down.
 */

import type { FormId } from '@/components/finance/tax-preview/formRegistry'
import type { TaxFactSource, TaxPreviewFacts } from '@/types/generated/tax-preview-facts'

export interface K1CellRouting {
  /** Raw `TaxFactRouting` enum value, e.g. "schedule_d_line_5". */
  routing: string
  /** Human explanation emitted by the builder; used as the chip tooltip. */
  routingReason: string | null
  /** Prettified destination label, e.g. "Sch D line 5". */
  label: string
  /** Registry form to drill into; undefined ⇒ render as a plain (non-clickable) chip. */
  formId?: FormId
}

/** Lookup key for a single K-1 line: doc + box + (normalized) code. */
export function k1CellKey(taxDocumentId: number, box: string, code: string | null | undefined): string {
  const normalizedCode = code ? code.trim().toUpperCase() : ''
  return `${taxDocumentId}|${box.trim()}|${normalizedCode}`
}

/** Strips the routing-disposition qualifiers so the form prefix can be matched. */
function canonicalRouting(routing: string): string {
  return routing
    .replace(/^excluded_/, '')
    .replace(/^default_/, '')
    .replace(/^needs_review_/, '')
}

/**
 * Maps a `TaxFactRouting` enum value to the registry form it lands on. Forms
 * without a registry column (8829, 8959, 8960) return undefined and render as
 * plain text chips.
 */
export function routingToFormId(routing: string): FormId | undefined {
  const canonical = canonicalRouting(routing)
  // Order: longer / more specific prefixes first (schedule_se before schedule_e).
  const prefixes: [string, FormId][] = [
    ['form_1040', 'form-1040'],
    ['form_1116', 'form-1116'],
    ['form_4952', 'form-4952'],
    ['form_4797', 'form-4797'],
    ['form_8995', 'form-8995'],
    ['schedule_1', 'sch-1'],
    ['sch_1', 'sch-1'],
    ['schedule_3', 'sch-3'],
    ['schedule_a', 'sch-a'],
    ['schedule_b', 'sch-b'],
    ['schedule_c', 'sch-c'],
    ['schedule_d', 'sch-d'],
    ['schedule_se', 'sch-se'],
    ['schedule_e', 'sch-e'],
    ['schedule_f', 'sch-f'],
  ]
  for (const [prefix, formId] of prefixes) {
    if (canonical.startsWith(prefix)) {
      return formId
    }
  }
  return undefined
}

/** Prettifies a routing enum value into a compact destination label. */
export function routingLabel(routing: string): string {
  return canonicalRouting(routing)
    .split('_')
    .map((part) => {
      if (part === 'form') {
        return 'Form'
      }
      if (part === 'schedule' || part === 'sch') {
        return 'Sch'
      }
      if (part === 'se') {
        return 'SE'
      }
      if (part === 'line' || part === 'part') {
        return part
      }
      if (/^[a-z]$/.test(part)) {
        return part.toUpperCase()
      }
      return part
    })
    .join(' ')
}

function isTaxFactSource(value: unknown): value is TaxFactSource {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sourceType' in value &&
    'routing' in value &&
    'box' in value &&
    'taxDocumentId' in value &&
    'code' in value
  )
}

function addSource(index: Map<string, K1CellRouting[]>, source: TaxFactSource): void {
  if (source.taxDocumentId === null || source.box === null || source.routing === null) {
    return
  }
  const key = k1CellKey(source.taxDocumentId, source.box, source.code)
  const list = index.get(key) ?? []
  if (list.some((entry) => entry.routing === source.routing)) {
    return
  }
  const formId = routingToFormId(source.routing)
  list.push({
    routing: source.routing,
    routingReason: source.routingReason,
    label: routingLabel(source.routing),
    ...(formId ? { formId } : {}),
  })
  index.set(key, list)
}

/**
 * Walks every `*Sources` array across `taxFacts` (recursively, so new builder
 * source arrays are picked up automatically) and groups the K-1 sources by
 * `(taxDocumentId, box, code)`, deduped by routing.
 */
export function buildK1RoutingIndex(taxFacts: TaxPreviewFacts | null): Map<string, K1CellRouting[]> {
  const index = new Map<string, K1CellRouting[]>()
  if (!taxFacts) {
    return index
  }
  const seen = new Set<object>()
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const element of node) {
        if (isTaxFactSource(element)) {
          addSource(index, element)
        } else {
          visit(element)
        }
      }
      return
    }
    if (typeof node === 'object' && node !== null) {
      if (seen.has(node)) {
        return
      }
      seen.add(node)
      for (const value of Object.values(node)) {
        visit(value)
      }
    }
  }
  visit(taxFacts)
  return index
}
