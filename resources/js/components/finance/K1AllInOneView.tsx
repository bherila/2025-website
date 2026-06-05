'use client'

import currency from 'currency.js'
import { AlertTriangle, ArrowRight, SquareArrowOutUpRight } from 'lucide-react'
import { useMemo, useState } from 'react'

import { ALL_K1_CODES } from '@/components/finance/k1/k1-codes'
import { K1_SPEC } from '@/components/finance/k1/k1-spec'
import { isFK1StructuredData } from '@/components/finance/k1/k1-types'
import K1K3SourceValueModal, { type K1K3SourceValue } from '@/components/finance/K1K3SourceValueModal'
import { stickyComparisonTableClasses } from '@/components/finance/k1K3StickyComparisonTable'
import type { DrillTarget } from '@/components/finance/tax-preview/formRegistry'
import { AmountCell } from '@/components/finance/tax-preview-primitives'
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
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'
import type { TaxPreviewFacts } from '@/types/generated/tax-preview-facts'

interface K1AllInOneViewProps {
  k1Docs: TaxDocument[]
  taxFacts: TaxPreviewFacts | null
  onReviewDoc: (docId: number, focusFieldId?: string) => void
  onDrill: (target: DrillTarget) => void
  onSaveParsedData: (docId: number, parsedData: FK1StructuredData) => Promise<void>
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

function NeedsReviewMarker() {
  return <span className="text-[11px] italic text-warning">needs review — depends on K-1 footnotes</span>
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
  routings: K1CellRouting[]
  needsReview: boolean
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
}: {
  row: K1Row
  groups: DestinationGroup[]
  onDrill: (target: DrillTarget) => void
}) {
  if (row.staticDestinations) {
    return <DestinationChips routings={row.staticDestinations} onDrill={onDrill} />
  }
  if (groups.length === 0) {
    return <span className="text-muted-foreground">—</span>
  }
  const signature = (group: DestinationGroup): string =>
    `${group.needsReview ? 'R' : ''}${group.routings.map((r) => r.routing).sort().join(',')}`
  const allAgree = groups.every((group) => signature(group) === signature(groups[0]!))
  if (allAgree) {
    return groups[0]!.needsReview ? <NeedsReviewMarker /> : <DestinationChips routings={groups[0]!.routings} onDrill={onDrill} />
  }
  return (
    <div className="space-y-1">
      {groups.map((group) => (
        <div key={group.key} className="flex items-center gap-1.5">
          <span className="max-w-[84px] truncate text-[9px] uppercase tracking-wide text-muted-foreground" title={group.label}>
            {group.label}
          </span>
          {group.needsReview ? <NeedsReviewMarker /> : <DestinationChips routings={group.routings} onDrill={onDrill} />}
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
}: K1AllInOneViewProps): React.ReactElement {
  const [sourceValueContext, setSourceValueContext] = useState<SourceValueContext | null>(null)

  const columns = useMemo<K1Column[]>(() => {
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
  }, [k1Docs])

  const routingIndex = useMemo(() => buildK1RoutingIndex(taxFacts), [taxFacts])
  const sections = useMemo(() => buildSections(columns), [columns])

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

      <div className="space-y-2">
      <div>
        <h2 className="text-lg font-semibold">All-in-One K-1</h2>
        <p className="text-xs text-muted-foreground">
          Every K-1 line across {columns.length} partnership{columns.length === 1 ? '' : 's'}. Click a value to inspect
          the source; click a destination to open that form.
        </p>
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
}: {
  section: K1Section
  columns: K1Column[]
  routingIndex: Map<string, K1CellRouting[]>
  onDrill: (target: DrillTarget) => void
  onOpenSourceValue: (context: SourceValueContext) => void
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
        const destinationGroups: DestinationGroup[] = row.box
          ? columns.flatMap((column, index) => {
              const numeric = moneyValues[index] ?? null
              if (numeric === null || numeric === 0) {
                return []
              }
              const routings = routingIndex.get(k1CellKey(column.doc.id, row.box!, row.code)) ?? []
              return [{ key: column.doc.id, label: column.accountName, routings, needsReview: row.routable && routings.length === 0 }]
            })
          : []

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
              <DestinationCell row={row} groups={destinationGroups} onDrill={onDrill} />
            </td>
          </tr>
        )
      })}
    </>
  )
}
