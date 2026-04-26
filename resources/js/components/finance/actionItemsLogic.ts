import currency from 'currency.js'

import { isFK1StructuredData } from '@/components/finance/k1'
import { parseFieldVal } from '@/components/finance/tax-preview-primitives'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'

export type ActionItemSeverity = 'alert' | 'warn' | 'info'

export type OutstandingAlertKind =
  | 'turbotax-ftc'
  | 'suspended-deductions'
  | 'box21-no-k3'
  | 'election-items'
  | 'box-13t'
  | 'prior-year-carryforward'
  | 'large-cap-loss'

export type ResolvedItemKind = 'no-qd-election' | 'no-general-1116' | 'box-11zz-ordinary'

export interface SuspendedItem {
  fund: string
  box: string
  description: string
  amount: number
}

export interface ElectionItem {
  fund: string
  code: string
  box: string
  description: string
  amount: number
}

export interface Box13TItem {
  fund: string
  amount: number
}

export interface Box21AlertFund {
  name: string
  amount: number
}

export interface ActionItemConditionsInput {
  reviewedK1Docs: TaxDocument[]
  reviewed1099Docs: TaxDocument[]
  income1099: {
    interestIncome: currency
    dividendIncome: currency
    qualifiedDividends: currency
  }
}

export interface ActionItemConditions {
  k1Count: number
  suspendedItems: SuspendedItem[]
  totalSuspended: number
  electionItems: ElectionItem[]
  box13TItems: Box13TItem[]
  box21AlertFunds: Box21AlertFund[]
  turboTaxFTCIssue: boolean
  totalK1Box5: number
  totalK3PassiveIncome: number
  largeCapLossCarryforward: boolean
  combined: number
  noQdElectionNeeded: boolean
  niiBefore: number
  k1InvInt: number
  allXXForGeneralCategory: boolean
  hasBox11ZZ: boolean
}

export interface OutstandingAlertClassification {
  kind: OutstandingAlertKind
  severity: ActionItemSeverity
  /** Per-fund instance index for kinds that emit one alert per fund (box21-no-k3). */
  fundIndex?: number
}

export interface ResolvedItemClassification {
  kind: ResolvedItemKind
}

function pk1(data: FK1StructuredData, box: string): number {
  const v = data.fields[box]?.value
  if (!v) {
    return 0
  }
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

function partnerName(doc: TaxDocument, data: FK1StructuredData): string {
  return data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership'
}

/**
 * Single source of truth for the conditions consumed by `ActionItemsTab` and
 * the dock home view's count badge. When adding a new alert: extend the
 * conditions here, then update both `classifyOutstanding` and the renderer
 * switch in `ActionItemsTab`.
 */
export function computeActionItemConditions(input: ActionItemConditionsInput): ActionItemConditions {
  const { reviewedK1Docs, income1099 } = input

  const k1Parsed = reviewedK1Docs
    .map((d) => ({ doc: d, data: isFK1StructuredData(d.parsed_data) ? d.parsed_data : null }))
    .filter((x): x is { doc: TaxDocument; data: FK1StructuredData } => x.data !== null)

  // §67(g) suspended deductions across all K-1s
  const suspendedItems: SuspendedItem[] = k1Parsed.flatMap(({ doc, data }) => {
    const fund = partnerName(doc, data)
    return (data.codes['13'] ?? [])
      .filter((i) => i.code === 'K' || i.code === 'AE')
      .map((i) => ({
        fund,
        box: `13${i.code}`,
        description: i.notes ?? `Box 13${i.code}`,
        amount: Math.abs(parseFieldVal(i.value) ?? 0),
      }))
  })
  const totalSuspended = suspendedItems.reduce((acc, i) => acc.add(i.amount), currency(0)).value

  // Box 13 codes requiring taxpayer election (F or ZZ)
  const electionItems: ElectionItem[] = k1Parsed.flatMap(({ doc, data }) => {
    const fund = partnerName(doc, data)
    return (data.codes['13'] ?? [])
      .filter((i) => i.code === 'F' || i.code === 'ZZ')
      .map((i) => ({
        fund,
        code: i.code,
        box: `13${i.code}`,
        description:
          i.code === 'F'
            ? '§59(e)(2) expenditures — elect to amortize or deduct (Form 4562 or Sch A)'
            : 'Other deductions — check K-1 attached statement for destination',
        amount: Math.abs(parseFieldVal(i.value) ?? 0),
      }))
  })

  // Box 13T (§163(j) excess business interest) — informational carryover
  const box13TItems: Box13TItem[] = k1Parsed.flatMap(({ doc, data }) => {
    const fund = partnerName(doc, data)
    return (data.codes['13'] ?? [])
      .filter((i) => i.code === 'T')
      .map((i) => ({
        fund,
        amount: Math.abs(parseFieldVal(i.value) ?? 0),
      }))
  })

  // TurboTax FTC Line 1d issue: K-1 Box 5 > 0 and K-3 passive income < half
  const totalK1Box5 = k1Parsed.reduce((acc, { data }) => acc.add(pk1(data, '5')), currency(0)).value
  let totalK3PassiveIncomeC = currency(0)
  for (const { data } of k1Parsed) {
    const k3Sections = data.k3?.sections ?? []
    for (const sec of k3Sections) {
      if (sec.sectionId !== 'part2_section1' && sec.sectionId !== 'part2_section2') {
        continue
      }
      const rows = ((sec.data as Record<string, unknown>)?.rows as Array<Record<string, unknown>> | undefined) ?? []
      for (const row of rows) {
        const passive = parseFieldVal(String(row.col_c_passive ?? '')) ?? 0
        totalK3PassiveIncomeC = totalK3PassiveIncomeC.add(passive)
      }
    }
  }
  const totalK3PassiveIncome = totalK3PassiveIncomeC.value
  const turboTaxFTCIssue = totalK1Box5 > 0 && totalK3PassiveIncome < currency(totalK1Box5).multiply(0.5).value

  // Per-fund Box 21 alerts when no K-3 Part III Section 4 country entries
  const box21AlertFunds: Box21AlertFund[] = k1Parsed
    .filter(({ data }) => {
      const box21 = pk1(data, '21')
      if (box21 === 0) {
        return false
      }
      const k3Sections = data.k3?.sections ?? []
      const part3Sec4 = k3Sections.find((s) => s.sectionId === 'part3_section4')
      const rows = ((part3Sec4?.data as Record<string, unknown> | undefined)?.countries as unknown[] | undefined) ?? []
      return rows.length === 0
    })
    .map(({ doc, data }) => ({
      name: partnerName(doc, data),
      amount: pk1(data, '21'),
    }))

  // K-3 general category check (resolved when all "XX" or empty)
  const allXXForGeneralCategory = k1Parsed.every(({ data }) => {
    const k3Sections = data.k3?.sections ?? []
    for (const sec of k3Sections) {
      if (sec.sectionId !== 'part2_section1' && sec.sectionId !== 'part2_section2') {
        continue
      }
      const rows = ((sec.data as Record<string, unknown>)?.rows as Array<Record<string, unknown>> | undefined) ?? []
      for (const row of rows) {
        const general = parseFieldVal(String(row.col_d_general ?? '')) ?? 0
        const country = (row.country as string | undefined) ?? ''
        if (general !== 0 && country !== 'XX' && country !== '') {
          return false
        }
      }
    }
    return true
  })

  // Box 11ZZ items exist
  const hasBox11ZZ = k1Parsed.some(({ data }) => (data.codes['11'] ?? []).some((i) => i.code === 'ZZ'))

  // NII ≥ investment interest → no QD election needed
  const k1InvInt = k1Parsed.reduce((acc, { data }) => {
    const hItems = (data.codes['13'] ?? []).filter((i) => i.code === 'H' || i.code === 'G')
    return acc.add(hItems.reduce((s, i) => s.add(Math.abs(parseFieldVal(i.value) ?? 0)), currency(0)))
  }, currency(0)).value
  const niiBefore = k1Parsed
    .reduce((acc, { data }) => acc.add(pk1(data, '5')), currency(0))
    .add(income1099.interestIncome)
    .add(income1099.dividendIncome)
    .subtract(income1099.qualifiedDividends).value
  const noQdElectionNeeded = k1InvInt > 0 && niiBefore >= k1InvInt

  // Capital gain/loss carryforward
  const netST = k1Parsed.reduce((acc, { data }) => acc.add(pk1(data, '8')), currency(0)).value
  const netLT = k1Parsed.reduce(
    (acc, { data }) => acc.add(pk1(data, '9a')).add(pk1(data, '9b')).add(pk1(data, '9c')).add(pk1(data, '10')),
    currency(0),
  ).value
  const combined = currency(netST).add(netLT).value
  const largeCapLossCarryforward = combined < -3000

  return {
    k1Count: k1Parsed.length,
    suspendedItems,
    totalSuspended,
    electionItems,
    box13TItems,
    box21AlertFunds,
    turboTaxFTCIssue,
    totalK1Box5,
    totalK3PassiveIncome,
    largeCapLossCarryforward,
    combined,
    noQdElectionNeeded,
    niiBefore,
    k1InvInt,
    allXXForGeneralCategory,
    hasBox11ZZ,
  }
}

/**
 * Classifies the conditions into a flat list of outstanding alerts in the
 * order they should appear. Order matches the historical render order in
 * `ActionItemsTab`.
 */
export function classifyOutstanding(c: ActionItemConditions): OutstandingAlertClassification[] {
  const out: OutstandingAlertClassification[] = []
  if (c.turboTaxFTCIssue) {
    out.push({ kind: 'turbotax-ftc', severity: 'alert' })
  }
  if (c.suspendedItems.length > 0) {
    out.push({ kind: 'suspended-deductions', severity: 'alert' })
  }
  c.box21AlertFunds.forEach((_fund, i) => {
    out.push({ kind: 'box21-no-k3', severity: 'alert', fundIndex: i })
  })
  if (c.electionItems.length > 0) {
    out.push({ kind: 'election-items', severity: 'warn' })
  }
  if (c.box13TItems.length > 0) {
    out.push({ kind: 'box-13t', severity: 'info' })
  }
  // Always-on prior-year carryforward reminder.
  out.push({ kind: 'prior-year-carryforward', severity: 'warn' })
  if (c.largeCapLossCarryforward) {
    out.push({ kind: 'large-cap-loss', severity: 'info' })
  }
  return out
}

export function classifyResolved(c: ActionItemConditions): ResolvedItemClassification[] {
  const out: ResolvedItemClassification[] = []
  if (c.noQdElectionNeeded) {
    out.push({ kind: 'no-qd-election' })
  }
  if (c.allXXForGeneralCategory && c.k1Count > 0) {
    out.push({ kind: 'no-general-1116' })
  }
  if (c.hasBox11ZZ) {
    out.push({ kind: 'box-11zz-ordinary' })
  }
  return out
}

export interface ActionItemSeverityCounts {
  alert: number
  warn: number
  info: number
  total: number
}

export function countBySeverity(alerts: OutstandingAlertClassification[]): ActionItemSeverityCounts {
  let alert = 0
  let warn = 0
  let info = 0
  for (const a of alerts) {
    if (a.severity === 'alert') {
      alert += 1
    } else if (a.severity === 'warn') {
      warn += 1
    } else {
      info += 1
    }
  }
  return { alert, warn, info, total: alert + warn + info }
}
