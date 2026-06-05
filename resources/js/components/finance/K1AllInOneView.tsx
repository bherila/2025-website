'use client'

import currency from 'currency.js'
import { AlertTriangle, ArrowRight, FileSpreadsheet, SquareArrowOutUpRight } from 'lucide-react'
import { useMemo, useState } from 'react'

import { ALL_K1_CODES } from '@/components/finance/k1/k1-codes'
import { K1_SPEC } from '@/components/finance/k1/k1-spec'
import { isFK1StructuredData } from '@/components/finance/k1/k1-types'
import K1K3SourceValueModal, { type K1K3SourceValue } from '@/components/finance/K1K3SourceValueModal'
import { stickyComparisonTableClasses } from '@/components/finance/k1K3StickyComparisonTable'
import type { DrillTarget } from '@/components/finance/tax-preview/formRegistry'
import { AmountCell } from '@/components/finance/tax-preview-primitives'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { extractK3ForeignTaxTotal } from '@/finance/1116/k3-to-1116'
import { buildK1RoutingIndex, k1CellKey, type K1CellRouting } from '@/lib/finance/k1RoutingIndex'
import { K1_CODE_ROUTING_NOTES, K1_ROUTING_NOTES } from '@/lib/finance/k1RoutingNotes'
import {
  getK1CodeItems,
  getK1PartnerName,
  getK1SourceValueOverride,
  hasK1SourceValueOverride,
  k1CodeOverrideKey,
  k1FieldOverrideKey,
  k3ForeignTaxTotalOverrideKey,
  normalizeK1Code,
  parseK1Field,
  sumK1CodeItems,
  withK1SourceValueOverride,
} from '@/lib/finance/k1Utils'
import { parseMoneyOrZero, sumMoneyValues } from '@/lib/finance/money'
import {
  k1CodeSourceFieldId,
  k1FieldSourceFieldId,
  k3ForeignTaxTotalSourceFieldId,
} from '@/lib/finance/taxSourceFieldIds'
import type { FK1StructuredData, K1CodeItem } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'
import { type TaxPreviewXlsxExporter, XLSX_GRID_MAX_COLUMNS, type XlsxGridCellValue, type XlsxGridColumn, type XlsxGridSheet } from '@/types/finance/xlsx-export'
import type { TaxPreviewFacts } from '@/types/generated/tax-preview-facts'

import K1CodesModal from './k1/K1CodesModal'

interface K1AllInOneViewProps {
  k1Docs: TaxDocument[]
  taxFacts: TaxPreviewFacts | null
  onReviewDoc: (docId: number, focusFieldId?: string) => void
  onDrill: (target: DrillTarget) => void
  onSaveParsedData: (docId: number, parsedData: FK1StructuredData) => Promise<void>
  onExportXlsx?: TaxPreviewXlsxExporter
  isExportingXlsx?: boolean
}

interface K1Column {
  doc: TaxDocument
  data: FK1StructuredData
  accountName: string
  extractedName: string
  ein: string
}

interface K1Row {
  key: string
  label: string
  boxRef?: string
  /** IRS box used for routing lookup (omitted for non-routable rows). */
  box?: string
  code?: string | null
  kind: 'money' | 'text'
  routable: boolean
  fromHint?: string
  overrideKey?: string
  sourceFieldId?: string
  /** Per-doc cell value. */
  value: (data: FK1StructuredData) => number | string | null
  /** Extracted source value before an All-in-One source override is applied. */
  sourceValue: (data: FK1StructuredData) => number | string | null
  /** Static destination override (e.g. K-3 foreign taxes always route to Form 1116). */
  staticDestinations?: K1CellRouting[]
}

interface K1Section {
  title: string
  rows: K1Row[]
}

const ENTITY_BOXES = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H1', 'H2', 'I1', 'I2', 'I3'])
const K1_GRID_FIXED_COLUMN_COUNT = 3
const K1_GRID_MAX_DOCUMENT_COLUMNS = XLSX_GRID_MAX_COLUMNS - K1_GRID_FIXED_COLUMN_COUNT

/** Extracts the "<< source" half of a routing note for the From column. */
function fromHint(box: string, code: string | null | undefined): string | undefined {
  const note = code
    ? K1_CODE_ROUTING_NOTES[box]?.[normalizeK1Code(code)]
    : K1_ROUTING_NOTES[box]
  if (!note) {
    return undefined
  }
  const match = note.match(/<<\s*([^|]+)/)
  return match?.[1]?.trim()
}

/** First line of a possibly multi-line field value. */
function firstLine(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }
  return value.split('\n')[0]?.trim() ?? null
}

function withoutSourceValueOverrides(data: FK1StructuredData): FK1StructuredData {
  const { sourceValueOverrides: _sourceValueOverrides, ...rest } = data
  return rest
}

function extractedK1Field(data: FK1StructuredData, box: string): number {
  return parseMoneyOrZero(data.fields[box]?.value)
}

function extractedK1CodeTotal(data: FK1StructuredData, box: string, code: string): number {
  return sumMoneyValues(getK1CodeItems(data, box, code).map((item) => item.value))
}

function sourceAccountName(doc: TaxDocument, data: FK1StructuredData): string {
  const linkedAccount = (doc.account_links ?? []).find((link) => link.account?.acct_name)?.account?.acct_name
  return doc.account?.acct_name
    ?? linkedAccount
    ?? getK1PartnerName(data, doc.employment_entity?.display_name ?? 'Partnership')
}

function k1ColumnsFromDocs(k1Docs: TaxDocument[]): K1Column[] {
  return k1Docs
    .map((doc) => {
      if (!isFK1StructuredData(doc.parsed_data)) {
        return null
      }
      const data = doc.parsed_data
      return {
        doc,
        data,
        accountName: sourceAccountName(doc, data),
        extractedName: getK1PartnerName(data, doc.employment_entity?.display_name ?? 'Partnership'),
        ein: data.fields['A']?.value ?? '—',
      }
    })
    .filter((column): column is K1Column => column !== null)
}

function moneyFillClass(value: number | null): string {
  if (value === null || value === 0) {
    return ''
  }
  return value > 0 ? 'bg-success/5' : 'bg-destructive/5'
}

function k3ForeignTaxSourceValues(data: FK1StructuredData): Array<{ label: string; value: number }> {
  const section = data.k3?.sections?.find((entry) => entry.sectionId === 'part3_section4')
  const sectionData = (section?.data ?? {}) as Record<string, unknown>
  const nestedKey = Object.keys(sectionData).find((key) => key.includes('foreignTax') || key.includes('foreign_tax'))
  const nested = nestedKey ? sectionData[nestedKey] as Record<string, unknown> | undefined : undefined
  const countries = ((nested?.countries ?? sectionData.countries) as Array<Record<string, unknown>> | undefined) ?? []

  return countries.map((entry) => ({
    label: String(entry.country ?? entry.code ?? '—').trim() || '—',
    value: parseMoneyOrZero(entry.amount_usd ?? entry.total ?? entry.passiveForeign),
  }))
}

function buildSections(columns: K1Column[]): K1Section[] {
  const entityRows: K1Row[] = []
  const capitalRows: K1Row[] = []

  for (const spec of K1_SPEC.filter((s) => s.side === 'left')) {
    const row: K1Row = {
      key: `box-${spec.box}`,
      label: spec.concise,
      boxRef: spec.box,
      kind: 'text',
      routable: false,
      sourceFieldId: k1FieldSourceFieldId(spec.box),
      value: (data) => firstLine(data.fields[spec.box]?.value),
      sourceValue: (data) => data.fields[spec.box]?.value ?? null,
    }
    if (ENTITY_BOXES.has(spec.box)) {
      entityRows.push(row)
    } else {
      capitalRows.push(row)
    }
  }

  const incomeRows: K1Row[] = []
  for (const spec of K1_SPEC.filter((s) => s.side === 'right')) {
    if (spec.fieldType === 'buttonDetails') {
      // Expand one sub-row per distinct code present across any fund.
      const codes = new Set<string>()
      for (const col of columns) {
        for (const item of col.data.codes[spec.box] ?? []) {
          codes.add(normalizeK1Code(item.code))
        }
      }
      const codeLabels = ALL_K1_CODES[spec.box] ?? {}
      for (const code of [...codes].sort()) {
        const hint = fromHint(spec.box, code)
        incomeRows.push({
          key: `box-${spec.box}-${code}`,
          label: codeLabels[code] ?? `Code ${code}`,
          boxRef: `${spec.box}${code}`,
          box: spec.box,
          code,
          kind: 'money',
          routable: true,
          ...(hint ? { fromHint: hint } : {}),
          overrideKey: k1CodeOverrideKey(spec.box, code),
          sourceFieldId: k1CodeSourceFieldId(spec.box, code),
          value: (data) => sumK1CodeItems(data, spec.box, code),
          sourceValue: (data) => extractedK1CodeTotal(data, spec.box, code),
        })
      }
    } else {
      const hint = fromHint(spec.box, null)
      incomeRows.push({
        key: `box-${spec.box}`,
        label: spec.concise,
        boxRef: spec.box,
        box: spec.box,
        kind: 'money',
        routable: true,
        ...(hint ? { fromHint: hint } : {}),
        overrideKey: k1FieldOverrideKey(spec.box),
        sourceFieldId: k1FieldSourceFieldId(spec.box),
        value: (data) => parseK1Field(data, spec.box),
        sourceValue: (data) => extractedK1Field(data, spec.box),
      })
    }
  }

  // Box 21 — foreign taxes paid/accrued (not in K1_SPEC's right panel).
  if (columns.some((c) => c.data.fields['21']?.value)) {
    const hint = fromHint('21', null)
    incomeRows.push({
      key: 'box-21',
      label: 'Foreign taxes paid or accrued',
      boxRef: '21',
      box: '21',
      kind: 'money',
      routable: true,
      ...(hint ? { fromHint: hint } : {}),
      overrideKey: k1FieldOverrideKey('21'),
      sourceFieldId: k1FieldSourceFieldId('21'),
      value: (data) => parseK1Field(data, '21'),
      sourceValue: (data) => extractedK1Field(data, '21'),
    })
  }

  const k3Rows: K1Row[] = []
  if (columns.some((c) => (c.data.k3?.sections?.length ?? 0) > 0)) {
    k3Rows.push({
      key: 'k3-foreign-tax',
      label: 'K-3 Part III §4 — Foreign taxes (total USD)',
      boxRef: 'K-3',
      kind: 'money',
      routable: true,
      fromHint: 'K-3 Part III, Section 4',
      overrideKey: k3ForeignTaxTotalOverrideKey(),
      sourceFieldId: k3ForeignTaxTotalSourceFieldId(),
      value: (data) => extractK3ForeignTaxTotal(data),
      sourceValue: (data) => extractK3ForeignTaxTotal(withoutSourceValueOverrides(data)),
      staticDestinations: [
        { routing: 'k3_all_in_one', routingReason: 'Open the full K-3 foreign income & tax breakdown across all funds.', label: 'K-3 detail', formId: 'k3-all-in-one' },
        { routing: 'form_1116_line_8', routingReason: 'Foreign taxes paid feed the Form 1116 foreign tax credit.', label: 'Form 1116', formId: 'form-1116' },
      ],
    })
  }

  return [
    { title: 'Entity & Partner Information', rows: entityRows },
    { title: 'Capital Account & Liabilities', rows: capitalRows },
    { title: 'Income, Deductions & Other (Boxes 1–21)', rows: incomeRows },
    { title: 'K-3 Foreign', rows: k3Rows },
  ].filter((section) => section.rows.length > 0)
}

function NeedsReviewMarker({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="inline-flex items-center rounded border border-warning/30 bg-warning/5 px-1.5 py-0.5 text-[11px] italic text-warning hover:bg-warning/10 focus:outline-none focus:ring-2 focus:ring-warning/30"
      onClick={onClick}
    >
      needs review — depends on K-1 footnotes
    </button>
  )
}

function DestinationChips({ routings, onDrill }: { routings: K1CellRouting[]; onDrill: (target: DrillTarget) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {routings.map((routing) => {
        const chipBase = 'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] leading-none'
        if (routing.formId) {
          const formId = routing.formId
          return (
            <Tooltip key={routing.routing}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onDrill({ id: formId })}
                  className={`${chipBase} border-primary/40 bg-primary/5 text-primary hover:bg-primary/10`}
                >
                  {routing.label}
                  <ArrowRight size={11} aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent>{routing.routingReason ?? `Open ${routing.label}`}</TooltipContent>
            </Tooltip>
          )
        }
        return (
          <Tooltip key={routing.routing}>
            <TooltipTrigger asChild>
              <span className={`${chipBase} border-border bg-muted/40 text-muted-foreground`}>{routing.label}</span>
            </TooltipTrigger>
            <TooltipContent>{routing.routingReason ?? 'No drill-down target for this form.'}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

interface DestinationGroup {
  key: number
  label: string
  column: K1Column
  routings: K1CellRouting[]
  needsReview: boolean
}

interface NeedsReviewContext {
  row: K1Row
  groups: DestinationGroup[]
}

interface K1CodesModalContext {
  column: K1Column
  box: string
}

interface NeedsReviewContributor {
  key: string
  column: K1Column
  sourceFieldId: string | undefined
  boxLabel: string
  amount: number | null
  noteItems: NeedsReviewNoteItem[]
}

interface NeedsReviewNoteItem {
  key: string
  label: string
  amount: string | null
  notes: string | null
}

function destinationGroupsForRow(
  row: K1Row,
  columns: K1Column[],
  moneyValues: Array<number | null>,
  routingIndex: Map<string, K1CellRouting[]>,
): DestinationGroup[] {
  if (!row.box) {
    return []
  }

  return columns.flatMap((column, index) => {
    const numeric = moneyValues[index] ?? null
    if (numeric === null || numeric === 0) {
      return []
    }
    const routings = routingIndex.get(k1CellKey(column.doc.id, row.box!, row.code)) ?? []

    return [{
      key: column.doc.id,
      label: column.accountName,
      column,
      routings,
      needsReview: row.routable && routings.length === 0,
    }]
  })
}

function destinationSignature(group: DestinationGroup): string {
  return `${group.needsReview ? 'R' : ''}${group.routings.map((routing) => routing.routing).sort().join(',')}`
}

function routingLabels(routings: K1CellRouting[]): string {
  return routings.map((routing) => routing.label).join(', ')
}

function destinationText(row: K1Row, groups: DestinationGroup[]): string | null {
  if (row.staticDestinations) {
    return routingLabels(row.staticDestinations)
  }
  if (groups.length === 0) {
    return null
  }

  const allAgree = groups.every((group) => destinationSignature(group) === destinationSignature(groups[0]!))
  if (allAgree) {
    return groups[0]!.needsReview ? 'needs review — depends on K-1 footnotes' : routingLabels(groups[0]!.routings)
  }

  return groups
    .map((group) => `${group.label}: ${group.needsReview ? 'needs review — depends on K-1 footnotes' : routingLabels(group.routings)}`)
    .join('; ')
}

function codeBoxLabel(row: K1Row): string {
  return row.code ? `Box ${row.box}${row.code}` : `Box ${row.box ?? '—'}`
}

function noteText(notes: string | null | undefined): string | null {
  const trimmed = notes?.trim()
  return trimmed ? trimmed : null
}

function needsReviewSourceFieldId(row: K1Row): string | undefined {
  if (row.sourceFieldId) {
    return row.sourceFieldId
  }
  if (!row.box) {
    return undefined
  }
  return row.code ? k1CodeSourceFieldId(row.box, row.code) : k1FieldSourceFieldId(row.box)
}

function needsReviewNoteItems(row: K1Row, column: K1Column): NeedsReviewNoteItem[] {
  if (!row.box) {
    return []
  }

  if (row.code) {
    return getK1CodeItems(column.data, row.box, row.code).map((item, index) => ({
      key: `${column.doc.id}-${row.box}-${row.code}-${index}`,
      label: codeBoxLabel(row),
      amount: item.value || null,
      notes: noteText(item.notes),
    }))
  }

  const field = column.data.fields[row.box]
  return [{
    key: `${column.doc.id}-${row.box}`,
    label: codeBoxLabel(row),
    amount: field?.value ?? null,
    notes: noteText(field?.notes),
  }]
}

function needsReviewContributors(context: NeedsReviewContext): NeedsReviewContributor[] {
  return context.groups.map((group) => {
    const rawAmount = context.row.kind === 'money' ? context.row.value(group.column.data) : null

    return {
      key: `${group.column.doc.id}-${context.row.key}`,
      column: group.column,
      sourceFieldId: needsReviewSourceFieldId(context.row),
      boxLabel: codeBoxLabel(context.row),
      amount: typeof rawAmount === 'number' ? rawAmount : null,
      noteItems: needsReviewNoteItems(context.row, group.column),
    }
  })
}

function k1GridColumnKey(column: K1Column): string {
  return `doc_${column.doc.id}`
}

function k1GridColumnLabel(column: K1Column): string {
  return column.ein && column.ein !== '—'
    ? `${column.accountName} (${firstLine(column.ein) ?? column.ein})`
    : column.accountName
}

function k1GridRowLabel(row: K1Row): string {
  return row.boxRef ? `${row.boxRef} ${row.label}` : row.label
}

function splitK1GridColumns(columns: K1Column[]): K1Column[][] {
  const chunks: K1Column[][] = []
  for (let index = 0; index < columns.length; index += K1_GRID_MAX_DOCUMENT_COLUMNS) {
    chunks.push(columns.slice(index, index + K1_GRID_MAX_DOCUMENT_COLUMNS))
  }

  return chunks
}

function k1GridSheetName(sheetIndex: number): string {
  return sheetIndex === 0 ? 'All K-1s' : `All K-1s ${sheetIndex + 1}`
}

function buildK1AllInOneXlsxGridForColumnSet(
  visibleColumns: K1Column[],
  allColumns: K1Column[],
  sections: K1Section[],
  routingIndex: Map<string, K1CellRouting[]>,
  sheetIndex: number,
  sheetCount: number,
): XlsxGridSheet {
  const gridColumns: XlsxGridColumn[] = [
    ...visibleColumns.map((column) => ({
      key: k1GridColumnKey(column),
      label: k1GridColumnLabel(column),
      width: 22,
      format: 'currency' as const,
    })),
    { key: 'total', label: 'Total', width: 14, format: 'currency' },
    { key: 'from', label: 'From', width: 30, format: 'text' },
    { key: 'destination', label: 'Destination', width: 36, format: 'text' },
  ]

  const rows: XlsxGridSheet['rows'] = [
    {
      kind: 'title',
      label: `All-in-One K-1 (${allColumns.length} partnership${allColumns.length === 1 ? '' : 's'}${sheetCount > 1 ? `, sheet ${sheetIndex + 1} of ${sheetCount}` : ''})`,
    },
  ]

  for (const section of sections) {
    rows.push({ kind: 'section', label: section.title })

    for (const row of section.rows) {
      const cells: Record<string, XlsxGridCellValue> = {}
      const visibleMoneyValues = row.kind === 'money'
        ? visibleColumns.map((column) => {
            const value = row.value(column.data)
            return typeof value === 'number' ? value : null
          })
        : []
      const total = row.kind === 'money'
        ? visibleMoneyValues.reduce((acc, value) => acc.add(value ?? 0), currency(0)).value
        : null

      visibleColumns.forEach((column, index) => {
        const value = row.value(column.data)
        cells[k1GridColumnKey(column)] = value === '' ? null : value
        if (row.kind === 'money' && visibleMoneyValues[index] === null) {
          cells[k1GridColumnKey(column)] = null
        }
      })

      cells.total = total
      cells.from = row.fromHint ?? null
      cells.destination = destinationText(row, destinationGroupsForRow(row, visibleColumns, visibleMoneyValues, routingIndex))

      rows.push({
        kind: row.kind === 'money' ? 'data' : 'data',
        label: k1GridRowLabel(row),
        cells,
      })
    }
  }

  return {
    name: k1GridSheetName(sheetIndex),
    scope: 'k1-all-in-one',
    columns: gridColumns,
    rows,
  }
}

function buildK1AllInOneXlsxGridsForModel(
  columns: K1Column[],
  sections: K1Section[],
  routingIndex: Map<string, K1CellRouting[]>,
): XlsxGridSheet[] {
  if (columns.length === 0) {
    return []
  }

  const chunks = splitK1GridColumns(columns)

  return chunks.map((visibleColumns, index) => buildK1AllInOneXlsxGridForColumnSet(
    visibleColumns,
    columns,
    sections,
    routingIndex,
    index,
    chunks.length,
  ))
}

export function buildK1AllInOneXlsxGrids(k1Docs: TaxDocument[], taxFacts: TaxPreviewFacts | null): XlsxGridSheet[] {
  const columns = k1ColumnsFromDocs(k1Docs)

  return buildK1AllInOneXlsxGridsForModel(columns, buildSections(columns), buildK1RoutingIndex(taxFacts))
}

/**
 * Renders destinations per fund so a fund with a value but no computed routing
 * shows its own "needs review" marker instead of inheriting another fund's
 * destination. When every contributing fund agrees, the shared destinations are
 * shown once; divergence (the point of fund-type-aware routing) is shown per fund.
 */
function DestinationCell({
  row,
  groups,
  onDrill,
  onOpenNeedsReview,
}: {
  row: K1Row
  groups: DestinationGroup[]
  onDrill: (target: DrillTarget) => void
  onOpenNeedsReview: (context: NeedsReviewContext) => void
}) {
  if (row.staticDestinations) {
    return <DestinationChips routings={row.staticDestinations} onDrill={onDrill} />
  }
  if (groups.length === 0) {
    return <span className="text-muted-foreground">—</span>
  }
  const signature = (group: DestinationGroup): string =>
    destinationSignature(group)
  const allAgree = groups.every((group) => signature(group) === signature(groups[0]!))
  if (allAgree) {
    return groups[0]!.needsReview
      ? <NeedsReviewMarker onClick={() => onOpenNeedsReview({ row, groups })} />
      : <DestinationChips routings={groups[0]!.routings} onDrill={onDrill} />
  }
  return (
    <div className="space-y-1">
      {groups.map((group) => (
        <div key={group.key} className="flex items-center gap-1.5">
          <span className="max-w-[84px] truncate text-[9px] uppercase tracking-wide text-muted-foreground" title={group.label}>
            {group.label}
          </span>
          {group.needsReview
            ? <NeedsReviewMarker onClick={() => onOpenNeedsReview({ row, groups: [group] })} />
            : <DestinationChips routings={group.routings} onDrill={onDrill} />}
        </div>
      ))}
    </div>
  )
}

interface SourceValueContext {
  column: K1Column
  row: K1Row
  modal: K1K3SourceValue
  sourceFieldId?: string
}

export default function K1AllInOneView({
  k1Docs,
  taxFacts,
  onReviewDoc,
  onDrill,
  onSaveParsedData,
  onExportXlsx,
  isExportingXlsx = false,
}: K1AllInOneViewProps): React.ReactElement {
  const [sourceValueContext, setSourceValueContext] = useState<SourceValueContext | null>(null)
  const [needsReviewContext, setNeedsReviewContext] = useState<NeedsReviewContext | null>(null)
  const [codesModalContext, setCodesModalContext] = useState<K1CodesModalContext | null>(null)

  const columns = useMemo<K1Column[]>(() => {
    return k1ColumnsFromDocs(k1Docs)
  }, [k1Docs])

  const routingIndex = useMemo(() => buildK1RoutingIndex(taxFacts), [taxFacts])
  const sections = useMemo(() => buildSections(columns), [columns])
  const xlsxGrids = useMemo(() => buildK1AllInOneXlsxGridsForModel(columns, sections, routingIndex), [columns, sections, routingIndex])

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

  async function saveCodesOverride(items: K1CodeItem[]): Promise<void> {
    if (!codesModalContext) {
      return
    }

    await onSaveParsedData(codesModalContext.column.doc.id, {
      ...codesModalContext.column.data,
      codes: {
        ...codesModalContext.column.data.codes,
        [codesModalContext.box]: items,
      },
    })
    setCodesModalContext(null)
  }

  if (columns.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No reviewed K-1s for this year yet. Review at least one K-1 to populate the all-in-one view.
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

      <NeedsReviewDialog
        context={needsReviewContext}
        onClose={() => setNeedsReviewContext(null)}
        onOpenReviewDoc={(docId, sourceFieldId) => {
          setNeedsReviewContext(null)
          onReviewDoc(docId, sourceFieldId)
        }}
        onOpenCodes={(column, box) => {
          setNeedsReviewContext(null)
          setCodesModalContext({ column, box })
        }}
      />

      {codesModalContext ? (
        <K1CodesModal
          open
          boxLabel={`Box ${codesModalContext.box}: ${K1_SPEC.find((spec) => spec.box === codesModalContext.box)?.label ?? 'Code Details'}`}
          box={codesModalContext.box}
          codeDefinitions={ALL_K1_CODES[codesModalContext.box] ?? {}}
          items={codesModalContext.column.data.codes[codesModalContext.box] ?? []}
          onClose={() => setCodesModalContext(null)}
          onChange={(items) => {
            void saveCodesOverride(items)
          }}
        />
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">All-in-One K-1</h2>
            <p className="text-xs text-muted-foreground">
              Every K-1 line across {columns.length} partnership{columns.length === 1 ? '' : 's'}. Click a value to inspect
              the source; click a destination to open that form.
            </p>
          </div>
          {onExportXlsx && xlsxGrids.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-2.5 text-xs"
              disabled={isExportingXlsx}
              onClick={() => {
                void onExportXlsx({ scope: 'k1-all-in-one', grids: xlsxGrids })
              }}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
              {isExportingXlsx ? 'Generating...' : 'Download XLSX'}
            </Button>
          ) : null}
        </div>

        <div className={stickyComparisonTableClasses.scrollContainer}>
          <table className={stickyComparisonTableClasses.table}>
            <thead>
              <tr className={stickyComparisonTableClasses.headerRow}>
                <th className={stickyComparisonTableClasses.cornerHeaderCell}>Line</th>
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
                    <div className="font-normal text-[10px] text-muted-foreground">{column.ein}</div>
                  </th>
                ))}
                <th className={stickyComparisonTableClasses.totalHeaderCell}>Total</th>
                <th className={`${stickyComparisonTableClasses.headerCell} w-[180px] text-left`}>From</th>
                <th className={`${stickyComparisonTableClasses.headerCell} w-[260px] text-left`}>Destination</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <SectionRows
                  key={section.title}
                  section={section}
                  columns={columns}
                  routingIndex={routingIndex}
                  onDrill={onDrill}
                  onOpenSourceValue={setSourceValueContext}
                  onOpenNeedsReview={setNeedsReviewContext}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function SectionRows({
  section,
  columns,
  routingIndex,
  onDrill,
  onOpenSourceValue,
  onOpenNeedsReview,
}: {
  section: K1Section
  columns: K1Column[]
  routingIndex: Map<string, K1CellRouting[]>
  onDrill: (target: DrillTarget) => void
  onOpenSourceValue: (context: SourceValueContext) => void
  onOpenNeedsReview: (context: NeedsReviewContext) => void
}): React.ReactElement {
  const sectionFillColspan = columns.length + 3
  return (
    <>
      <tr className="bg-info/10">
        <th scope="rowgroup" className={stickyComparisonTableClasses.sectionFirstColumnCell}>
          {section.title}
        </th>
        <td colSpan={sectionFillColspan} className={stickyComparisonTableClasses.sectionFillCell} aria-hidden="true" />
      </tr>
      {section.rows.map((row) => {
        const moneyValues = row.kind === 'money'
          ? columns.map((column) => {
              const value = row.value(column.data)
              return typeof value === 'number' ? value : null
            })
          : []
        const total = row.kind === 'money'
          ? moneyValues.reduce((acc, value) => acc.add(value ?? 0), currency(0)).value
          : null
        // Per-fund destination groups — only funds that actually have a value on
        // this line contribute, so an unrouted fund is never masked by another's routing.
        const destinationGroups = destinationGroupsForRow(row, columns, moneyValues, routingIndex)

        return (
          <tr key={row.key} className="border-b border-dashed border-border/50 hover:bg-muted/10">
            <td className={`${stickyComparisonTableClasses.firstColumnCell} align-top`}>
              <div className="flex items-baseline gap-2">
                {row.boxRef && <span className="w-12 shrink-0 text-[10px] text-muted-foreground">{row.boxRef}</span>}
                <span className="text-[13px]">{row.label}</span>
              </div>
            </td>
            {columns.map((column, index) => {
              const value = row.value(column.data)
              const sourceValue = row.sourceValue(column.data)
              const override = row.overrideKey ? getK1SourceValueOverride(column.data, row.overrideKey) : null
              if (row.kind === 'text') {
                return (
                  <td key={column.doc.id} className="w-[180px] px-3 py-1.5 text-right text-[12px] text-muted-foreground align-top">
                    {typeof value === 'string' && value !== '' ? (
                      <button
                        type="button"
                        className="max-w-[156px] truncate text-right hover:text-foreground hover:underline"
                        onClick={() => onOpenSourceValue({
                          column,
                          row,
                          ...(row.sourceFieldId ? { sourceFieldId: row.sourceFieldId } : {}),
                          modal: {
                            title: row.boxRef ? `K-1 ${row.boxRef}` : 'K-1 source value',
                            subtitle: column.accountName,
                            label: row.label,
                            kind: 'text',
                            sourceValue,
                            effectiveValue: value,
                            override,
                          },
                        })}
                      >
                        {value}
                      </button>
                    ) : '—'}
                  </td>
                )
              }
              const numeric = moneyValues[index] ?? null
              const fillClass = moneyFillClass(numeric)
              const hasOverride = row.overrideKey ? hasK1SourceValueOverride(column.data, row.overrideKey) : false
              const shadowedValues = row.key === 'k3-foreign-tax' && hasOverride
                ? k3ForeignTaxSourceValues(column.data)
                : []
              return (
                <td key={column.doc.id} className={`w-[180px] px-3 py-1.5 text-right align-top ${fillClass}`}>
                  {numeric === null ? (
                    <AmountCell val={null} />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpenSourceValue({
                        column,
                        row,
                        ...(row.sourceFieldId ? { sourceFieldId: row.sourceFieldId } : {}),
                        modal: {
                          title: row.boxRef ? `K-1 ${row.boxRef}` : 'K-1 source value',
                          subtitle: column.accountName,
                          label: row.label,
                          kind: 'money',
                          sourceValue,
                          effectiveValue: numeric,
                          override,
                          shadowedValues,
                        },
                      })}
                      className="group/cell inline-flex items-center gap-1 hover:underline"
                      title="Inspect source value"
                    >
                      <AmountCell val={numeric} />
                      {hasOverride ? (
                        <AlertTriangle size={11} className="text-warning" aria-label="Overridden source value" />
                      ) : (
                        <SquareArrowOutUpRight size={10} className="opacity-0 transition-opacity group-hover/cell:opacity-60" aria-hidden />
                      )}
                    </button>
                  )}
                </td>
              )
            })}
            <td className="border-l border-border/60 bg-primary/5 px-3 py-1.5 text-right align-top">
              {row.kind === 'money' ? <AmountCell val={total} className="font-semibold" /> : <span className="text-muted-foreground">—</span>}
            </td>
            <td className="px-3 py-1.5 text-left align-top text-[11px] text-muted-foreground">
              {row.fromHint ?? '—'}
            </td>
            <td className="px-3 py-1.5 text-left align-top">
              <DestinationCell row={row} groups={destinationGroups} onDrill={onDrill} onOpenNeedsReview={onOpenNeedsReview} />
            </td>
          </tr>
        )
      })}
    </>
  )
}

function NeedsReviewDialog({
  context,
  onClose,
  onOpenReviewDoc,
  onOpenCodes,
}: {
  context: NeedsReviewContext | null
  onClose: () => void
  onOpenReviewDoc: (docId: number, sourceFieldId?: string) => void
  onOpenCodes: (column: K1Column, box: string) => void
}): React.ReactElement {
  const contributors = context ? needsReviewContributors(context) : []
  const row = context?.row ?? null
  const codeDefinitions = row?.box ? ALL_K1_CODES[row.box] ?? {} : {}
  const canResolveInCodeDetails = Boolean(row?.box && row.code && Object.keys(codeDefinitions).length > 0)

  return (
    <Dialog
      open={context !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>K-1 footnotes need review</DialogTitle>
          <DialogDescription>
            {row ? `${codeBoxLabel(row)} ${row.label}` : 'Review the contributing K-1 source line.'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {contributors.map((contributor) => (
            <div key={contributor.key} className="rounded-md border border-border bg-muted/20 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="truncate text-xs font-semibold text-foreground">{contributor.column.accountName}</div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{contributor.boxLabel}</span>
                    {contributor.amount !== null ? <AmountCell val={contributor.amount} /> : null}
                  </div>
                </div>
                {canResolveInCodeDetails && row?.box ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      if (row.box) {
                        onOpenCodes(contributor.column, row.box)
                      }
                    }}
                  >
                    Resolve in code details
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => onOpenReviewDoc(contributor.column.doc.id, contributor.sourceFieldId)}
                  >
                    Open K-1 review
                  </Button>
                )}
              </div>

              <div className="mt-3 space-y-2">
                {contributor.noteItems.length > 0 ? contributor.noteItems.map((item) => (
                  <div key={item.key} className="rounded border border-border/70 bg-background/70 px-2.5 py-2">
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <span>{item.label}</span>
                      {item.amount ? <span className="font-mono normal-case tracking-normal">{item.amount}</span> : null}
                    </div>
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                      {item.notes ?? 'No footnote text captured — classify manually.'}
                    </p>
                  </div>
                )) : (
                  <div className="rounded border border-border/70 bg-background/70 px-2.5 py-2 text-xs text-muted-foreground">
                    No footnote text captured — classify manually.
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
