'use client'

import currency from 'currency.js'
import { AlertTriangle, SquareArrowOutUpRight } from 'lucide-react'
import { useMemo, useState } from 'react'

import { isFK1StructuredData } from '@/components/finance/k1/k1-types'
import K1K3SourceValueModal, { type K1K3SourceValue } from '@/components/finance/K1K3SourceValueModal'
import { stickyComparisonTableClasses } from '@/components/finance/k1K3StickyComparisonTable'
import { AmountCell, parseFieldVal } from '@/components/finance/tax-preview-primitives'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { extractK3ForeignTaxTotal } from '@/finance/1116/k3-to-1116'
import {
  getK1PartnerName,
  getK1SourceValueOverride,
  hasK1SourceValueOverride,
  k3ForeignTaxTotalOverrideKey,
  k3Part2OverrideKey,
  k3Part3OverrideKey,
  parseK1SourceValueOverride,
  withK1SourceValueOverride,
} from '@/lib/finance/k1Utils'
import {
  k3ForeignTaxTotalSourceFieldId,
  k3Part2SourceFieldId,
  k3Part3CountrySourceFieldId,
} from '@/lib/finance/taxSourceFieldIds'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'

interface K3AllInOneViewProps {
  k1Docs: TaxDocument[]
  onReviewDoc: (docId: number, focusFieldId?: string) => void
  onSaveParsedData: (docId: number, parsedData: FK1StructuredData) => Promise<void>
}

interface K3Column {
  doc: TaxDocument
  data: FK1StructuredData
  accountName: string
  extractedName: string
}

type Category = 'us' | 'foreign' | 'sourcedByPartner' | 'passive' | 'general' | 'total'

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'us', label: 'U.S. Source' },
  { key: 'foreign', label: 'Foreign Source' },
  { key: 'sourcedByPartner', label: 'Sourced by Partner' },
  { key: 'passive', label: 'Passive' },
  { key: 'general', label: 'General' },
  { key: 'total', label: 'Total' },
]

interface Part2Agg {
  description: string
  us: number
  foreign: number
  sourcedByPartner: number
  passive: number
  general: number
  total: number
}

interface K3CellValue {
  value: number | null
  sourceValue: number | null
  overrideKey?: string
  sourceFieldId?: string
  shadowed?: boolean
  shadowedValues?: Array<{ label: string; value: number | string | null }>
}

interface ColRow {
  us: number
  foreign: number
  sourcedByPartner: number
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

function withoutSourceValueOverrides(data: FK1StructuredData): FK1StructuredData {
  const { sourceValueOverrides: _sourceValueOverrides, ...rest } = data
  return rest
}

function sourceAccountName(doc: TaxDocument, data: FK1StructuredData): string {
  const linkedAccount = (doc.account_links ?? []).find((link) => link.account?.acct_name)?.account?.acct_name
  return doc.account?.acct_name
    ?? linkedAccount
    ?? getK1PartnerName(data, doc.employment_entity?.display_name ?? 'Partnership')
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
    const foreignBranch = num(row.col_b_foreign_branch)
    const passive = num(row.col_c_passive)
    const general = num(row.col_d_general)
    const other901j = num(row.col_e_other_901j)
    const sourcedByPartner = num(row.col_f_sourced_by_partner)
    return {
      us: num(row.col_a_us_source),
      foreign: currency(foreignBranch).add(passive).add(general).add(other901j).value,
      sourcedByPartner,
      passive,
      general,
      total,
    }
  }
  // Canonical per-country rows use single-letter column keys a–g.
  const total = row.g !== undefined && row.g !== ''
    ? num(row.g)
    : currency(0).add(num(row.a)).add(num(row.b)).add(num(row.c)).add(num(row.d)).add(num(row.e)).add(num(row.f)).value
  const foreignBranch = num(row.b)
  const passive = num(row.c)
  const general = num(row.d)
  const other901j = num(row.e)
  const sourcedByPartner = num(row.f)
  return {
    us: num(row.a),
    foreign: currency(foreignBranch).add(passive).add(general).add(other901j).value,
    sourcedByPartner,
    passive,
    general,
    total,
  }
}

function addAgg(byLine: Map<string, Part2Agg>, line: string, description: string, cr: ColRow): void {
  const prev = byLine.get(line)
  if (prev) {
    prev.us = currency(prev.us).add(cr.us).value
    prev.foreign = currency(prev.foreign).add(cr.foreign).value
    prev.sourcedByPartner = currency(prev.sourcedByPartner).add(cr.sourcedByPartner).value
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
  for (const [line, agg] of byLine) {
    for (const category of CATEGORIES) {
      const override = parseK1SourceValueOverride(data, k3Part2OverrideKey(line, category.key))
      if (override !== null) {
        agg[category.key] = override
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
    const extracted = num(entry.amount_usd ?? entry.total ?? entry.passiveForeign)
    const amount = parseK1SourceValueOverride(data, k3Part3OverrideKey(country)) ?? extracted
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

function part3CountrySourceValues(data: FK1StructuredData): Array<{ label: string; value: number }> {
  const byCountry = part3ByCountry(withoutSourceValueOverrides(data))
  return [...byCountry.entries()].map(([label, value]) => ({ label, value }))
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

function ValueCell({
  cell,
  column,
  rowLabel,
  onOpenSourceValue,
}: {
  cell: K3CellValue
  column: K3Column
  rowLabel: string
  onOpenSourceValue: (context: SourceValueContext) => void
}) {
  const override = cell.overrideKey ? getK1SourceValueOverride(column.data, cell.overrideKey) : null
  const hasOverride = override !== null
  return (
    <td className={`w-[180px] px-3 py-1.5 text-right align-top ${fillClass(cell.value)} ${cell.shadowed ? 'text-muted-foreground line-through decoration-muted-foreground/80' : ''}`}>
      {cell.value === null ? (
        <AmountCell val={null} />
      ) : (
        <button
          type="button"
          onClick={() => onOpenSourceValue({
            column,
            ...(cell.overrideKey ? { overrideKey: cell.overrideKey } : {}),
            ...(cell.sourceFieldId ? { sourceFieldId: cell.sourceFieldId } : {}),
            modal: {
              title: 'K-3 source value',
              subtitle: column.accountName,
              label: rowLabel,
              kind: 'money',
              sourceValue: cell.sourceValue,
              effectiveValue: cell.value,
              override,
              canOverride: cell.overrideKey !== undefined,
              ...(cell.shadowedValues ? { shadowedValues: cell.shadowedValues } : {}),
            },
          })}
          className="group/cell inline-flex items-center gap-1 hover:underline"
          title="Inspect source value"
        >
          <AmountCell val={cell.value} />
          {hasOverride ? (
            <AlertTriangle size={11} className="text-warning" aria-label="Overridden source value" />
          ) : (
            <SquareArrowOutUpRight size={10} className="opacity-0 transition-opacity group-hover/cell:opacity-60" aria-hidden />
          )}
        </button>
      )}
    </td>
  )
}

interface SourceValueContext {
  column: K3Column
  overrideKey?: string
  sourceFieldId?: string
  modal: K1K3SourceValue
}

function PivotTable({
  title,
  columns,
  rows,
  onOpenSourceValue,
  topAccessory,
}: {
  title: string
  columns: K3Column[]
  rows: Array<{ key: string; label: string; cell: (column: K3Column) => K3CellValue }>
  onOpenSourceValue: (context: SourceValueContext) => void
  topAccessory?: React.ReactNode
}) {
  if (rows.length === 0) {
    return null
  }
  return (
    <div className="space-y-1.5">
      {topAccessory ? <div className="flex justify-end">{topAccessory}</div> : null}
      <div className={stickyComparisonTableClasses.scrollContainer}>
        <table className={stickyComparisonTableClasses.table}>
          <thead>
            <tr className={stickyComparisonTableClasses.headerRow}>
              <th className={stickyComparisonTableClasses.cornerHeaderCell}>Line / Country</th>
              {columns.map((column) => (
                <th key={column.doc.id} className={`${stickyComparisonTableClasses.headerCell} w-[180px] text-right`}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="ml-auto max-w-[156px] cursor-default truncate">{column.accountName}</div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <div className="space-y-1 text-xs">
                        <div>Account: {column.accountName}</div>
                        <div>Extracted K-1 name: {column.extractedName}</div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </th>
              ))}
              <th className={stickyComparisonTableClasses.totalHeaderCell}>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-info/10">
              <th scope="rowgroup" className={stickyComparisonTableClasses.sectionFirstColumnCell}>
                {title}
              </th>
              <td colSpan={columns.length + 1} className={stickyComparisonTableClasses.sectionFillCell} aria-hidden="true" />
            </tr>
            {rows.map((row) => {
              const cells = columns.map((column) => row.cell(column))
              const total = cells.reduce((acc, cell) => acc.add(cell.shadowed ? 0 : (cell.value ?? 0)), currency(0)).value
              return (
                <tr key={row.key} className="border-b border-dashed border-border/50 hover:bg-muted/10">
                  <td className={`${stickyComparisonTableClasses.firstColumnCell} text-[13px] align-top`}>
                    <div className="max-w-[236px] truncate">{row.label}</div>
                  </td>
                  {columns.map((column, index) => (
                    <ValueCell
                      key={column.doc.id}
                      cell={cells[index]!}
                      column={column}
                      rowLabel={row.label}
                      onOpenSourceValue={onOpenSourceValue}
                    />
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

export default function K3AllInOneView({ k1Docs, onReviewDoc, onSaveParsedData }: K3AllInOneViewProps): React.ReactElement {
  const [category, setCategory] = useState<Category>('total')
  const [sourceValueContext, setSourceValueContext] = useState<SourceValueContext | null>(null)

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
        return {
          doc,
          data,
          accountName: sourceAccountName(doc, data),
          extractedName: getK1PartnerName(data, doc.employment_entity?.display_name ?? 'Partnership'),
        }
      })
      .filter((column): column is K3Column => column !== null)
  }, [k1Docs])

  const part2 = useMemo(() => columns.map((column) => ({ column, byLine: part2ByLine(column.data) })), [columns])
  const part2Source = useMemo(
    () => columns.map((column) => ({ column, byLine: part2ByLine(withoutSourceValueOverrides(column.data)) })),
    [columns],
  )
  const part3 = useMemo(() => columns.map((column) => ({ column, byCountry: part3ByCountry(column.data) })), [columns])
  const part3Source = useMemo(
    () => columns.map((column) => ({ column, byCountry: part3ByCountry(withoutSourceValueOverrides(column.data)) })),
    [columns],
  )

  async function saveSourceOverride(value: string | null): Promise<void> {
    if (!sourceValueContext) {
      return
    }

    const { column, overrideKey, modal } = sourceValueContext
    if (!overrideKey) {
      return
    }

    const nextData = withK1SourceValueOverride(
      column.data,
      overrideKey,
      value === null
        ? null
        : {
            value,
            originalValue: modal.sourceValue === null ? null : String(modal.sourceValue),
            label: modal.label,
            updatedAt: new Date().toISOString(),
          },
    )

    await onSaveParsedData(column.doc.id, nextData)
    setSourceValueContext(null)
  }

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
        const sourceCell = part2Source.find((entry) => entry.column.doc.id === column.doc.id)?.byLine.get(line)
        const overrideKey = category === 'foreign' || category === 'total'
          ? undefined
          : k3Part2OverrideKey(line, category)
        return {
          value: cell ? cell[category] : null,
          sourceValue: sourceCell ? sourceCell[category] : null,
          ...(overrideKey ? { overrideKey } : {}),
          sourceFieldId: k3Part2SourceFieldId(line),
        }
      },
    }
  })

  const part3Countries = [...new Set(part3.flatMap(({ byCountry }) => [...byCountry.keys()]))].sort((a, b) => a.localeCompare(b))
  const part3Rows = [
    {
      key: '__foreign_tax_total',
      label: 'Foreign tax total (used)',
      cell: (column: K3Column): K3CellValue => {
        const aggregateOverride = hasK1SourceValueOverride(column.data, k3ForeignTaxTotalOverrideKey())
        return {
          value: extractK3ForeignTaxTotal(column.data),
          sourceValue: extractK3ForeignTaxTotal(withoutSourceValueOverrides(column.data)),
          overrideKey: k3ForeignTaxTotalOverrideKey(),
          sourceFieldId: k3ForeignTaxTotalSourceFieldId(),
          shadowedValues: aggregateOverride ? part3CountrySourceValues(column.data) : [],
        }
      },
    },
    ...part3Countries.map((country) => ({
      key: country,
      label: country,
      cell: (column: K3Column): K3CellValue => {
        const aggregateOverride = hasK1SourceValueOverride(column.data, k3ForeignTaxTotalOverrideKey())
        return {
          value: part3.find((entry) => entry.column.doc.id === column.doc.id)?.byCountry.get(country) ?? null,
          sourceValue: part3Source.find((entry) => entry.column.doc.id === column.doc.id)?.byCountry.get(country) ?? null,
          overrideKey: k3Part3OverrideKey(country),
          sourceFieldId: k3Part3CountrySourceFieldId(country),
          shadowed: aggregateOverride,
        }
      },
    })),
  ]

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
    <>
      <K1K3SourceValueModal
        value={sourceValueContext?.modal ?? null}
        onOpenChange={(open) => {
          if (!open) {
            setSourceValueContext(null)
          }
        }}
        onGoToSource={() => {
          if (!sourceValueContext) {
            return
          }
          const docId = sourceValueContext.column.doc.id
          const { sourceFieldId } = sourceValueContext
          setSourceValueContext(null)
          onReviewDoc(docId, sourceFieldId)
        }}
        onSaveOverride={saveSourceOverride}
      />

      <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">All-in-One K-3</h2>
        <p className="text-xs text-muted-foreground">
          Schedule K-3 foreign income and taxes across {columns.length} partnership{columns.length === 1 ? '' : 's'}. Use
          the category tabs to switch the Part II basket; click a value to inspect the source.
        </p>
      </div>

      <PivotTable
        title="K-3 Part II — Foreign Income"
        columns={columns}
        rows={part2Rows}
        onOpenSourceValue={setSourceValueContext}
        topAccessory={categoryTabs}
      />

      <PivotTable
        title="K-3 Part III §4 — Foreign Taxes (USD by country)"
        columns={columns}
        rows={part3Rows}
        onOpenSourceValue={setSourceValueContext}
      />
    </div>
    </>
  )
}
