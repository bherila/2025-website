'use client'

import currency from 'currency.js'
import { SquareArrowOutUpRight } from 'lucide-react'
import { useMemo, useState } from 'react'

import { isFK1StructuredData } from '@/components/finance/k1/k1-types'
import { AmountCell, parseFieldVal } from '@/components/finance/tax-preview-primitives'
import { extractK3ForeignTaxTotal } from '@/finance/1116/k3-to-1116'
import { getK1PartnerName } from '@/lib/finance/k1Utils'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'

interface K3AllInOneViewProps {
  k1Docs: TaxDocument[]
  onReviewDoc: (docId: number) => void
}

interface K3Column {
  doc: TaxDocument
  data: FK1StructuredData
  partnerName: string
}

type Category = 'us' | 'passive' | 'general' | 'total'

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'us', label: 'U.S. Source' },
  { key: 'passive', label: 'Passive' },
  { key: 'general', label: 'General' },
  { key: 'total', label: 'Total' },
]

interface Part2Agg {
  description: string
  us: number
  passive: number
  general: number
  total: number
}

interface ColRow {
  us: number
  passive: number
  general: number
  total: number
}

function num(value: unknown): number {
  if (typeof value === 'number') {
    return value
  }
  return parseFieldVal(String(value ?? '')) ?? 0
}

/** Normalizes a K-3 Part II row to category amounts, summing all columns when no explicit total. */
function colRowFrom(row: Record<string, unknown>, kind: 'tool' | 'canonical'): ColRow {
  if (kind === 'tool') {
    const explicit = row.col_g_total
    const total = explicit !== undefined && explicit !== ''
      ? num(explicit)
      : Object.entries(row).reduce(
          (acc, [key, value]) => (key.startsWith('col_') && !key.startsWith('col_g') ? acc.add(num(value)) : acc),
          currency(0),
        ).value
    return { us: num(row.col_a_us_source), passive: num(row.col_c_passive), general: num(row.col_d_general), total }
  }
  // Canonical per-country rows use single-letter column keys a–g.
  const total = row.g !== undefined && row.g !== ''
    ? num(row.g)
    : currency(0).add(num(row.a)).add(num(row.b)).add(num(row.c)).add(num(row.d)).add(num(row.e)).add(num(row.f)).value
  return { us: num(row.a), passive: num(row.c), general: num(row.d), total }
}

function addAgg(byLine: Map<string, Part2Agg>, line: string, description: string, cr: ColRow): void {
  const prev = byLine.get(line)
  if (prev) {
    prev.us = currency(prev.us).add(cr.us).value
    prev.passive = currency(prev.passive).add(cr.passive).value
    prev.general = currency(prev.general).add(cr.general).value
    prev.total = currency(prev.total).add(cr.total).value
    if (!prev.description && description) {
      prev.description = description
    }
  } else {
    byLine.set(line, { description, ...cr })
  }
}

/**
 * Part II foreign income aggregated by K-3 line for a single K-1. Handles both the
 * flat tool shape (`section.data.rows`) and the canonical shape (`section.data`
 * keyed by `lineN_<desc>` objects each holding per-country `.rows`).
 */
function part2ByLine(data: FK1StructuredData): Map<string, Part2Agg> {
  const byLine = new Map<string, Part2Agg>()
  for (const section of data.k3?.sections ?? []) {
    if (section.sectionId !== 'part2_section1' && section.sectionId !== 'part2_section2') {
      continue
    }
    const sectionData = (section.data ?? {}) as Record<string, unknown>
    if (Array.isArray(sectionData.rows)) {
      for (const row of sectionData.rows as Array<Record<string, unknown>>) {
        const description = String(row.description ?? row.line_description ?? '').trim()
        const line = String(row.line ?? description ?? '').trim() || '—'
        addAgg(byLine, line, description, colRowFrom(row, 'tool'))
      }
      continue
    }
    for (const [key, value] of Object.entries(sectionData)) {
      if (!key.startsWith('line') || typeof value !== 'object' || value === null) {
        continue
      }
      const match = key.match(/^line(\w+?)_(.*)$/)
      const line = match?.[1] ?? key
      const description = (match?.[2] ?? '').replace(/_/g, ' ').trim()
      const lineData = value as Record<string, unknown>
      const rows = lineData.rows as Array<Record<string, unknown>> | undefined
      if (Array.isArray(rows)) {
        for (const row of rows) {
          addAgg(byLine, line, description, colRowFrom(row, 'canonical'))
        }
      } else {
        const fallback = (lineData.totals ?? lineData) as Record<string, unknown>
        addAgg(byLine, line, description, colRowFrom(fallback, 'canonical'))
      }
    }
  }
  return byLine
}

/**
 * Part III §4 foreign taxes aggregated by country for a single K-1. Handles both
 * the canonical nested shape (`data.line1_foreignTaxesPaid.countries`) and the
 * flat tool shape (`data.countries`).
 */
function part3ByCountry(data: FK1StructuredData): Map<string, number> {
  const byCountry = new Map<string, number>()
  const section = data.k3?.sections?.find((s) => s.sectionId === 'part3_section4')
  const sectionData = (section?.data ?? {}) as Record<string, unknown>
  const nestedKey = Object.keys(sectionData).find((key) => key.includes('foreignTax') || key.includes('foreign_tax'))
  const nested = nestedKey ? (sectionData[nestedKey] as Record<string, unknown> | undefined) : undefined
  const countries = ((nested?.countries ?? sectionData.countries) as Array<Record<string, unknown>> | undefined) ?? []
  for (const entry of countries) {
    // Canonical country breakdowns key the country by ISO `code` (e.g. DE/JP).
    const country = String(entry.country ?? entry.code ?? '').trim() || '—'
    const amount = num(entry.amount_usd ?? entry.total ?? entry.passiveForeign)
    byCountry.set(country, currency(byCountry.get(country) ?? 0).add(amount).value)
  }
  // Some K-1s carry only a grand total with no country breakdown — still surface
  // the amount as a single fallback row rather than hiding the taxes entirely.
  if (byCountry.size === 0) {
    const grandTotal = extractK3ForeignTaxTotal(data)
    if (grandTotal !== 0) {
      byCountry.set('(total — no country breakdown)', grandTotal)
    }
  }
  return byCountry
}

/** Numeric-aware sort of K-3 line keys ("1","2","10", then text). */
function compareLines(a: string, b: string): number {
  const na = Number.parseInt(a, 10)
  const nb = Number.parseInt(b, 10)
  const aNum = Number.isFinite(na)
  const bNum = Number.isFinite(nb)
  if (aNum && bNum) {
    return na - nb
  }
  if (aNum !== bNum) {
    return aNum ? -1 : 1
  }
  return a.localeCompare(b)
}

function fillClass(value: number | null): string {
  if (value === null || value === 0) {
    return ''
  }
  return value > 0 ? 'bg-success/5' : 'bg-destructive/5'
}

function ValueCell({ value, docId, onReviewDoc }: { value: number | null; docId: number; onReviewDoc: (id: number) => void }) {
  return (
    <td className={`px-3 py-1.5 text-right align-top ${fillClass(value)}`}>
      {value === null ? (
        <AmountCell val={null} />
      ) : (
        <button
          type="button"
          onClick={() => onReviewDoc(docId)}
          className="group/cell inline-flex items-center gap-1 hover:underline"
          title="Open K-1 source"
        >
          <AmountCell val={value} />
          <SquareArrowOutUpRight size={10} className="opacity-0 transition-opacity group-hover/cell:opacity-60" aria-hidden />
        </button>
      )}
    </td>
  )
}

function PivotTable({
  title,
  columns,
  rows,
  onReviewDoc,
  topAccessory,
}: {
  title: string
  columns: K3Column[]
  rows: Array<{ key: string; label: string; cell: (column: K3Column) => number | null }>
  onReviewDoc: (docId: number) => void
  topAccessory?: React.ReactNode
}) {
  if (rows.length === 0) {
    return null
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-info">{title}</h3>
        {topAccessory}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 text-xs">
              <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left font-semibold">Line / Country</th>
              {columns.map((column) => (
                <th key={column.doc.id} className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                  {column.partnerName}
                </th>
              ))}
              <th className="border-l border-border/60 bg-primary/5 px-3 py-2 text-right font-semibold text-primary">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const values = columns.map((column) => row.cell(column))
              const total = values.reduce((acc, value) => acc.add(value ?? 0), currency(0)).value
              return (
                <tr key={row.key} className="border-b border-dashed border-border/50 hover:bg-muted/10">
                  <td className="sticky left-0 z-10 bg-background px-3 py-1.5 text-[13px] align-top">{row.label}</td>
                  {columns.map((column, index) => (
                    <ValueCell key={column.doc.id} value={values[index] ?? null} docId={column.doc.id} onReviewDoc={onReviewDoc} />
                  ))}
                  <td className="border-l border-border/60 bg-primary/5 px-3 py-1.5 text-right align-top">
                    <AmountCell val={total} className="font-semibold" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function K3AllInOneView({ k1Docs, onReviewDoc }: K3AllInOneViewProps): React.ReactElement {
  const [category, setCategory] = useState<Category>('total')

  const columns = useMemo<K3Column[]>(() => {
    return k1Docs
      .map((doc) => {
        if (!isFK1StructuredData(doc.parsed_data)) {
          return null
        }
        const data = doc.parsed_data
        if ((data.k3?.sections?.length ?? 0) === 0) {
          return null
        }
        return { doc, data, partnerName: getK1PartnerName(data, doc.employment_entity?.display_name ?? 'Partnership') }
      })
      .filter((column): column is K3Column => column !== null)
  }, [k1Docs])

  const part2 = useMemo(() => columns.map((column) => ({ column, byLine: part2ByLine(column.data) })), [columns])
  const part3 = useMemo(() => columns.map((column) => ({ column, byCountry: part3ByCountry(column.data) })), [columns])

  if (columns.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No K-3 (Schedule K-3) data found on the reviewed K-1s for this year.
      </div>
    )
  }

  const part2Lines = [...new Set(part2.flatMap(({ byLine }) => [...byLine.keys()]))].sort(compareLines)
  const part2Rows = part2Lines.map((line) => {
    const agg = part2.map(({ byLine }) => byLine.get(line)).find((value) => value !== undefined)
    const label = agg?.description || `Line ${line}`
    return {
      key: line,
      label,
      cell: (column: K3Column) => {
        const cell = part2.find((entry) => entry.column.doc.id === column.doc.id)?.byLine.get(line)
        return cell ? cell[category] : null
      },
    }
  })

  const part3Countries = [...new Set(part3.flatMap(({ byCountry }) => [...byCountry.keys()]))].sort((a, b) => a.localeCompare(b))
  const part3Rows = part3Countries.map((country) => ({
    key: country,
    label: country,
    cell: (column: K3Column) => part3.find((entry) => entry.column.doc.id === column.doc.id)?.byCountry.get(country) ?? null,
  }))

  const categoryTabs = (
    <div className="inline-flex rounded-md border border-border/60 p-0.5 text-xs">
      {CATEGORIES.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => setCategory(tab.key)}
          className={`rounded px-2 py-1 ${category === tab.key ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">All-in-One K-3</h2>
        <p className="text-xs text-muted-foreground">
          Schedule K-3 foreign income and taxes across {columns.length} partnership{columns.length === 1 ? '' : 's'}. Use
          the category tabs to switch the Part II basket; click a value to open its K-1 source.
        </p>
      </div>

      <PivotTable
        title="K-3 Part II — Foreign Income"
        columns={columns}
        rows={part2Rows}
        onReviewDoc={onReviewDoc}
        topAccessory={categoryTabs}
      />

      <PivotTable
        title="K-3 Part III §4 — Foreign Taxes (USD by country)"
        columns={columns}
        rows={part3Rows}
        onReviewDoc={onReviewDoc}
      />
    </div>
  )
}
