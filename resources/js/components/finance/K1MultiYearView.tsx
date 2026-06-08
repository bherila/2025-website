'use client'

import { AlertTriangle, Link2Off, SquareArrowOutUpRight } from 'lucide-react'
import { useMemo, useState } from 'react'

import K1K3SourceValueModal, { type K1K3SourceValue } from '@/components/finance/K1K3SourceValueModal'
import { stickyComparisonTableClasses } from '@/components/finance/k1K3StickyComparisonTable'
import { AmountCell } from '@/components/finance/tax-preview-primitives'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  getK1SourceValueOverride,
  hasK1SourceValueOverride,
  withK1SourceValueOverride,
} from '@/lib/finance/k1Utils'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'

import {
  buildSections,
  firstLine,
  type K1Column,
  k1ColumnsFromDocs,
  type K1Row,
  k3ForeignTaxSourceValues,
  moneyFillClass,
} from './k1ComparisonModel'

interface K1MultiYearViewProps {
  k1Docs: TaxDocument[]
  availableYears: number[]
  onReviewDoc: (docId: number, focusFieldId?: string) => void
  onSaveParsedData: (docId: number, parsedData: FK1StructuredData) => Promise<void>
}

interface AccountOption {
  key: string
  label: string
  detail: string
}

interface SourceValueContext {
  column: K1Column
  row: K1Row
  modal: K1K3SourceValue
  sourceFieldId?: string
}

const YEAR_COLUMN_WIDTH_CLASS = 'w-[150px]'

function docAccountKey(doc: TaxDocument, column: K1Column): string {
  const linkedAccountId = doc.account_id ?? (doc.account_links ?? []).find((link) => link.account_id !== null)?.account_id
  if (linkedAccountId !== null && linkedAccountId !== undefined) {
    return `account:${linkedAccountId}`
  }

  if (column.ein && column.ein !== '—') {
    return `ein:${firstLine(column.ein) ?? column.ein}`
  }

  return `name:${column.extractedName.toLocaleLowerCase()}`
}

function isUnlinkedDoc(doc: TaxDocument): boolean {
  return doc.account_id === null && !(doc.account_links ?? []).some((link) => link.account_id !== null)
}

function buildAccountOptions(columns: K1Column[]): AccountOption[] {
  const options = new Map<string, AccountOption>()

  for (const column of columns) {
    const key = docAccountKey(column.doc, column)
    if (!options.has(key)) {
      options.set(key, {
        key,
        label: column.accountName,
        detail: column.ein && column.ein !== '—' ? column.ein : column.extractedName,
      })
    }
  }

  return [...options.values()].sort((a, b) => a.label.localeCompare(b.label))
}

function columnsByOldestYear(columns: K1Column[], selectedAccountKey: string, years: number[]): Array<K1Column | null> {
  const sortedYears = [...years].sort((a, b) => a - b)

  return sortedYears.map((year) => {
    const matches = columns.filter((column) => column.doc.tax_year === year && docAccountKey(column.doc, column) === selectedAccountKey)
    return matches.sort((a, b) => Number(b.doc.is_reviewed) - Number(a.doc.is_reviewed) || b.doc.id - a.doc.id)[0] ?? null
  })
}

export default function K1MultiYearView({
  k1Docs,
  availableYears,
  onReviewDoc,
  onSaveParsedData,
}: K1MultiYearViewProps): React.ReactElement {
  const [selectedAccountKey, setSelectedAccountKey] = useState<string | null>(null)
  const [sourceValueContext, setSourceValueContext] = useState<SourceValueContext | null>(null)

  const allColumns = useMemo(() => k1ColumnsFromDocs(k1Docs), [k1Docs])
  const options = useMemo(() => buildAccountOptions(allColumns), [allColumns])
  const effectiveAccountKey = selectedAccountKey ?? options[0]?.key ?? null
  const years = useMemo(() => [...availableYears].sort((a, b) => a - b), [availableYears])
  const yearColumns = useMemo(
    () => effectiveAccountKey ? columnsByOldestYear(allColumns, effectiveAccountKey, years) : [],
    [allColumns, effectiveAccountKey, years],
  )
  const presentColumns = useMemo(() => yearColumns.filter((column): column is K1Column => column !== null), [yearColumns])
  const sections = useMemo(() => buildSections(presentColumns), [presentColumns])

  async function saveSourceOverride(value: string | null): Promise<void> {
    if (!sourceValueContext?.row.overrideKey) {
      return
    }

    const { column, row } = sourceValueContext
    const overrideKey = row.overrideKey
    if (!overrideKey) {
      return
    }
    const sourceValue = row.sourceValue(column.data)
    const nextData = withK1SourceValueOverride(
      column.data,
      overrideKey,
      value === null
        ? null
        : {
            value,
            originalValue: sourceValue === null ? null : String(sourceValue),
            label: `${row.boxRef ? `${row.boxRef} ` : ''}${row.label}`,
            updatedAt: new Date().toISOString(),
          },
    )

    await onSaveParsedData(column.doc.id, nextData)
    setSourceValueContext(null)
  }

  if (options.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No parsed K-1s are available yet. Parse or review a K-1 to populate the multi-year view.
      </div>
    )
  }

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

      <div className="space-y-3">
        <div className="space-y-2">
          <div>
            <h2 className="text-lg font-semibold">Multi-Year K-1</h2>
            <p className="text-xs text-muted-foreground">
              Pick one K-1 account or partnership to compare line items across every available tax year.
            </p>
          </div>
          <label className="block max-w-xl text-xs font-medium text-muted-foreground">
            Account / Partnership picker
            <select
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={effectiveAccountKey ?? ''}
              onChange={(event) => setSelectedAccountKey(event.target.value)}
            >
              {options.map((option) => (
                <option key={option.key} value={option.key}>{option.label} — {option.detail}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Link2Off className="h-3.5 w-3.5 text-warning" aria-hidden /> Unlinked K-1</span>
            <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5 text-warning" aria-hidden /> Parsed but not reviewed</span>
          </div>
        </div>

        <div className={stickyComparisonTableClasses.scrollContainer}>
          <table className={stickyComparisonTableClasses.table}>
            <thead>
              <tr className={stickyComparisonTableClasses.headerRow}>
                <th className="sticky top-0 left-0 z-30 w-24 bg-muted px-3 py-2 text-left font-semibold shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Line</th>
                <th className={`${stickyComparisonTableClasses.headerCell} left-24 z-30 w-[260px] text-left`}>Description</th>
                {years.map((year, index) => {
                  const column = yearColumns[index] ?? null
                  return (
                    <th key={year} className={`${stickyComparisonTableClasses.headerCell} ${YEAR_COLUMN_WIDTH_CLASS} text-right`}>
                      {column ? (
                        <button
                          type="button"
                          className="inline-flex items-center justify-end gap-1 hover:underline"
                          onClick={() => onReviewDoc(column.doc.id)}
                          title={`Open ${year} K-1 source`}
                        >
                          {year}
                          {isUnlinkedDoc(column.doc) ? <Link2Off className="h-3 w-3 text-warning" aria-label="Unlinked K-1" /> : null}
                          {!column.doc.is_reviewed ? <AlertTriangle className="h-3 w-3 text-warning" aria-label="Parsed but not reviewed" /> : null}
                        </button>
                      ) : (
                        <span>{year}</span>
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <MultiYearSectionRows
                  key={section.title}
                  title={section.title}
                  rows={section.rows}
                  years={years}
                  yearColumns={yearColumns}
                  onOpenSourceValue={setSourceValueContext}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function MultiYearSectionRows({
  title,
  rows,
  years,
  yearColumns,
  onOpenSourceValue,
}: {
  title: string
  rows: K1Row[]
  years: number[]
  yearColumns: Array<K1Column | null>
  onOpenSourceValue: (context: SourceValueContext) => void
}): React.ReactElement {
  return (
    <>
      <tr className="bg-info/10">
        <th scope="rowgroup" className="sticky left-0 z-10 w-24 bg-info/10 px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-info-foreground">{title}</th>
        <td colSpan={yearColumns.length + 1} className={stickyComparisonTableClasses.sectionFillCell} aria-hidden="true" />
      </tr>
      {rows.map((row) => (
        <tr key={row.key} className="border-b border-dashed border-border/50 hover:bg-muted/10">
          <td className="sticky left-0 z-20 w-24 bg-background px-3 py-1.5 text-[12px] text-muted-foreground align-top shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">{row.boxRef ?? '—'}</td>
          <td className="sticky left-24 z-20 w-[260px] bg-background px-3 py-1.5 text-[13px] align-top shadow-[1px_0_0_hsl(var(--border))]">{row.label}</td>
          {yearColumns.map((column, index) => (
            <MultiYearValueCell key={`${row.key}-${years[index] ?? column?.doc.id ?? 'unknown'}`} row={row} column={column} onOpenSourceValue={onOpenSourceValue} />
          ))}
        </tr>
      ))}
    </>
  )
}

function MultiYearValueCell({
  row,
  column,
  onOpenSourceValue,
}: {
  row: K1Row
  column: K1Column | null
  onOpenSourceValue: (context: SourceValueContext) => void
}): React.ReactElement {
  if (!column) {
    return <td className={`${YEAR_COLUMN_WIDTH_CLASS} px-3 py-1.5 text-right align-top`} />
  }

  const value = row.value(column.data)
  const sourceValue = row.sourceValue(column.data)
  const override = row.overrideKey ? getK1SourceValueOverride(column.data, row.overrideKey) : null

  if (row.kind === 'text') {
    const displayValue = typeof value === 'string' ? value : null
    return (
      <td className={`${YEAR_COLUMN_WIDTH_CLASS} px-3 py-1.5 text-right text-[12px] text-muted-foreground align-top`}>
        {displayValue ? (
          <button
            type="button"
            className="max-w-[126px] truncate text-right hover:text-foreground hover:underline"
            onClick={() => onOpenSourceValue({
              column,
              row,
              ...(row.sourceFieldId ? { sourceFieldId: row.sourceFieldId } : {}),
              modal: {
                title: row.boxRef ? `K-1 ${row.boxRef}` : 'K-1 source value',
                subtitle: `${column.accountName} · ${column.doc.tax_year}`,
                label: row.label,
                kind: 'text',
                sourceValue,
                effectiveValue: displayValue,
                override,
              },
            })}
          >
            {displayValue}
          </button>
        ) : null}
      </td>
    )
  }

  const numeric = typeof value === 'number' ? value : null
  const hasOverride = row.overrideKey ? hasK1SourceValueOverride(column.data, row.overrideKey) : false
  const shadowedValues = row.key === 'k3-foreign-tax' && hasOverride ? k3ForeignTaxSourceValues(column.data) : []

  return (
    <td className={`${YEAR_COLUMN_WIDTH_CLASS} px-3 py-1.5 text-right align-top ${moneyFillClass(numeric)}`}>
      {numeric === null ? null : (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onOpenSourceValue({
                column,
                row,
                ...(row.sourceFieldId ? { sourceFieldId: row.sourceFieldId } : {}),
                modal: {
                  title: row.boxRef ? `K-1 ${row.boxRef}` : 'K-1 source value',
                  subtitle: `${column.accountName} · ${column.doc.tax_year}`,
                  label: row.label,
                  kind: 'money',
                  sourceValue,
                  effectiveValue: numeric,
                  override,
                  shadowedValues,
                },
              })}
              className="group/cell inline-flex items-center gap-1 hover:underline"
            >
              <AmountCell val={numeric} />
              {hasOverride ? (
                <AlertTriangle size={11} className="text-warning" aria-label="Overridden source value" />
              ) : (
                <SquareArrowOutUpRight size={10} className="opacity-0 transition-opacity group-hover/cell:opacity-60" aria-hidden />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>Inspect source value</TooltipContent>
        </Tooltip>
      )}
    </td>
  )
}
