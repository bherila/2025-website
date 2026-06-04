'use client'

import currency from 'currency.js'
import { AlertTriangle, ExternalLink, FileWarning, TableProperties } from 'lucide-react'
import { useMemo } from 'react'

import { ALL_K1_CODES } from '@/components/finance/k1/k1-codes'
import { K1_SPEC } from '@/components/finance/k1/k1-spec'
import { isFK1StructuredData } from '@/components/finance/k1/k1-types'
import { AmountCell } from '@/components/finance/tax-preview-primitives'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { extractK3ForeignTaxTotal } from '@/finance/1116/k3-to-1116'
import { getK1PartnerName, k3ForeignTaxTotalOverrideKey } from '@/lib/finance/k1Utils'
import { parseMoney, parseMoneyOrZero } from '@/lib/finance/money'
import type { FK1StructuredData, K1SourceValueOverride } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'

interface SourceValueOverridesViewProps {
  k1Docs: TaxDocument[]
  onReviewDoc: (docId: number) => void
  onOpenAllK1: () => void
  onOpenAllK3: () => void
}

interface OverrideRow {
  key: string
  docId: number
  documentLabel: string
  extractedName: string
  sourceKey: string
  sourceLabel: string
  sourceType: 'K-1' | 'K-3'
  impact: string
  originalValue: string | number | null
  overrideValue: string
  delta: number | null
  calculationImpacting: boolean
  aggregate: boolean
  shadowedValues: Array<{ label: string; value: number }>
}

const PART2_CATEGORY_LABELS: Record<string, string> = {
  us: 'U.S. Source',
  foreign: 'Foreign Source',
  sourcedByPartner: 'Sourced by Partner',
  passive: 'Passive category',
  general: 'General category',
  total: 'Total',
}

function sourceAccountName(doc: TaxDocument, data: FK1StructuredData): string {
  const linkedAccount = (doc.account_links ?? []).find((link) => link.account?.acct_name)?.account?.acct_name
  return doc.account?.acct_name
    ?? linkedAccount
    ?? getK1PartnerName(data, doc.employment_entity?.display_name ?? 'Partnership')
}

function formatDisplayValue(value: string | number | null | undefined): React.ReactNode {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground">-</span>
  }
  const parsed = parseMoney(value)
  if (parsed !== null) {
    return <AmountCell val={parsed} />
  }
  return <span className="whitespace-pre-wrap break-words">{String(value)}</span>
}

function overrideDelta(override: K1SourceValueOverride): number | null {
  const original = parseMoney(override.originalValue)
  const next = parseMoney(override.value)
  if (original === null || next === null) {
    return null
  }
  return currency(next).subtract(original).value
}

function fieldLabel(box: string): string {
  const spec = K1_SPEC.find((entry) => entry.box === box)
  return spec ? `K-1 Box ${box}: ${spec.concise}` : `K-1 Box ${box}`
}

function codeLabel(box: string, code: string): string {
  const normalized = code.trim().toUpperCase()
  const description = (ALL_K1_CODES as Record<string, Record<string, string> | undefined>)[box]?.[normalized]
  return description ? `K-1 Box ${box} Code ${normalized}: ${description}` : `K-1 Box ${box} Code ${normalized}`
}

function part2Label(line: string, category: string): string {
  const categoryLabel = PART2_CATEGORY_LABELS[category] ?? category
  return `K-3 Part II Line ${line}: ${categoryLabel}`
}

function describeOverrideKey(sourceKey: string, fallbackLabel?: string | null): { label: string; sourceType: 'K-1' | 'K-3'; impact: string; aggregate: boolean } {
  const fieldMatch = sourceKey.match(/^field:(.+)$/)
  if (fieldMatch?.[1]) {
    return {
      label: fallbackLabel ?? fieldLabel(fieldMatch[1]),
      sourceType: 'K-1',
      impact: 'K-1 source amount',
      aggregate: false,
    }
  }

  const codeMatch = sourceKey.match(/^code:([^:]+):(.+)$/)
  if (codeMatch?.[1] && codeMatch[2]) {
    return {
      label: fallbackLabel ?? codeLabel(codeMatch[1], codeMatch[2]),
      sourceType: 'K-1',
      impact: 'K-1 coded amount',
      aggregate: false,
    }
  }

  const part2Match = sourceKey.match(/^k3:part2:([^:]+):(.+)$/)
  if (part2Match?.[1] && part2Match[2]) {
    return {
      label: fallbackLabel ?? part2Label(part2Match[1], part2Match[2]),
      sourceType: 'K-3',
      impact: part2Match[2] === 'sourcedByPartner' ? 'Form 1116 source treatment' : 'Form 1116 income source',
      aggregate: false,
    }
  }

  const part3Match = sourceKey.match(/^k3:part3:(.+)$/)
  if (part3Match?.[1]) {
    return {
      label: fallbackLabel ?? `K-3 Part III Section 4: ${part3Match[1]}`,
      sourceType: 'K-3',
      impact: 'Foreign tax by country',
      aggregate: false,
    }
  }

  if (sourceKey === k3ForeignTaxTotalOverrideKey()) {
    return {
      label: fallbackLabel ?? 'K-3 Part III Section 4: Foreign tax total',
      sourceType: 'K-3',
      impact: 'Foreign tax total; country rows excluded',
      aggregate: true,
    }
  }

  return {
    label: fallbackLabel ?? sourceKey,
    sourceType: sourceKey.startsWith('k3:') ? 'K-3' : 'K-1',
    impact: 'Source value override',
    aggregate: false,
  }
}

function part3CountrySourceValues(data: FK1StructuredData): Array<{ label: string; value: number }> {
  const section = data.k3?.sections?.find((entry) => entry.sectionId === 'part3_section4')
  const sectionData = (section?.data ?? {}) as Record<string, unknown>
  const nestedKey = Object.keys(sectionData).find((key) => key.includes('foreignTax') || key.includes('foreign_tax'))
  const nested = nestedKey ? (sectionData[nestedKey] as Record<string, unknown> | undefined) : undefined
  const countries = ((nested?.countries ?? sectionData.countries) as Array<Record<string, unknown>> | undefined) ?? []

  const byCountry = new Map<string, number>()
  for (const entry of countries) {
    const country = String(entry.country ?? entry.code ?? '').trim() || '-'
    const amount = parseMoneyOrZero(entry.amount_usd ?? entry.total ?? entry.passiveForeign)
    byCountry.set(country, currency(byCountry.get(country) ?? 0).add(amount).value)
  }

  if (byCountry.size === 0) {
    const { sourceValueOverrides: _sourceValueOverrides, ...withoutOverrides } = data
    const grandTotal = extractK3ForeignTaxTotal(withoutOverrides)
    if (grandTotal !== 0) {
      byCountry.set('(total - no country breakdown)', grandTotal)
    }
  }

  return [...byCountry.entries()].map(([label, value]) => ({ label, value }))
}

function buildOverrideRows(k1Docs: TaxDocument[]): OverrideRow[] {
  const rows: OverrideRow[] = []
  for (const doc of k1Docs) {
    if (!isFK1StructuredData(doc.parsed_data)) {
      continue
    }

    const data = doc.parsed_data
    const overrides = data.sourceValueOverrides ?? {}
    const documentLabel = sourceAccountName(doc, data)
    const extractedName = getK1PartnerName(data, doc.employment_entity?.display_name ?? 'Partnership')

    for (const [sourceKey, override] of Object.entries(overrides)) {
      const descriptor = describeOverrideKey(sourceKey, override.label)
      const delta = overrideDelta(override)
      rows.push({
        key: `${doc.id}:${sourceKey}`,
        docId: doc.id,
        documentLabel,
        extractedName,
        sourceKey,
        sourceLabel: descriptor.label,
        sourceType: descriptor.sourceType,
        impact: descriptor.impact,
        originalValue: override.originalValue ?? null,
        overrideValue: override.value,
        delta,
        calculationImpacting: parseMoney(override.value) !== null,
        aggregate: descriptor.aggregate,
        shadowedValues: descriptor.aggregate ? part3CountrySourceValues(data) : [],
      })
    }
  }

  return rows.sort((a, b) => {
    const docCompare = a.documentLabel.localeCompare(b.documentLabel)
    if (docCompare !== 0) {
      return docCompare
    }
    return a.sourceLabel.localeCompare(b.sourceLabel)
  })
}

export default function SourceValueOverridesView({
  k1Docs,
  onReviewDoc,
  onOpenAllK1,
  onOpenAllK3,
}: SourceValueOverridesViewProps): React.ReactElement {
  const rows = useMemo(() => buildOverrideRows(k1Docs), [k1Docs])
  const calculationRows = rows.filter((row) => row.calculationImpacting)
  const aggregateRows = rows.filter((row) => row.aggregate)
  const totalDelta = rows.reduce((acc, row) => (row.delta === null ? acc : acc.add(row.delta)), currency(0)).value

  if (rows.length === 0) {
    return (
      <div className="flex h-full flex-col p-6">
        <div className="mx-auto flex min-h-[360px] w-full max-w-3xl flex-col items-center justify-center gap-4 rounded-md border border-dashed border-border bg-muted/20 p-8 text-center">
          <TableProperties className="h-8 w-8 text-muted-foreground" aria-hidden />
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">No source value overrides</h2>
            <p className="max-w-xl text-sm text-muted-foreground">
              Overrides saved from the All-in-One K-1/K-3 source value popup will appear here for review.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" variant="outline" onClick={onOpenAllK1}>
              Open All K-1s
            </Button>
            <Button type="button" variant="outline" onClick={onOpenAllK3}>
              Open All K-3s
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-semibold text-foreground">K-1/K-3 Source Value Overrides</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Active source overrides for reviewed K-1 documents. Use Go to source to inspect or clear an override in the source review modal.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onOpenAllK1}>
            Open All K-1s
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onOpenAllK3}>
            Open All K-3s
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <SummaryStat label="Active overrides" value={String(rows.length)} />
        <SummaryStat label="Calculation-impacting" value={String(calculationRows.length)} />
        <SummaryStat label="Net override delta" value={<AmountCell val={totalDelta} />} />
      </div>

      {aggregateRows.length > 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            {aggregateRows.length} aggregate override{aggregateRows.length === 1 ? '' : 's'} shadow lower-level source rows. Shadowed values are shown struck through and are not counted.
          </span>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
            <TableRow>
              <TableHead className="w-[220px]">Document</TableHead>
              <TableHead className="min-w-[260px]">Source</TableHead>
              <TableHead className="w-[120px]">Type</TableHead>
              <TableHead className="w-[150px] text-right">Original</TableHead>
              <TableHead className="w-[150px] text-right">Override</TableHead>
              <TableHead className="w-[140px] text-right">Delta</TableHead>
              <TableHead className="w-[220px]">Impact</TableHead>
              <TableHead className="w-[130px] text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="align-top">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="max-w-[210px] cursor-default truncate font-medium text-foreground">{row.documentLabel}</div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <div className="space-y-1 text-xs">
                        <div>Document: {row.documentLabel}</div>
                        <div>Extracted K-1 name: {row.extractedName}</div>
                        <div>Tax document #{row.docId}</div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell className="align-top">
                  <div className="space-y-1">
                    <div className="font-medium text-foreground">{row.sourceLabel}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{row.sourceKey}</div>
                    {row.shadowedValues.length > 0 ? (
                      <div className="space-y-1 rounded-md border border-border bg-muted/20 px-2 py-1.5">
                        <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                          <FileWarning className="h-3 w-3" aria-hidden />
                          Excluded source rows
                        </div>
                        {row.shadowedValues.map((shadowed) => (
                          <div key={shadowed.label} className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground line-through">
                            <span className="truncate">{shadowed.label}</span>
                            <AmountCell val={shadowed.value} />
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  <Badge variant="outline">{row.sourceType}</Badge>
                </TableCell>
                <TableCell className="text-right align-top font-currency tabular-nums">
                  {formatDisplayValue(row.originalValue)}
                </TableCell>
                <TableCell className="text-right align-top font-currency tabular-nums">
                  {formatDisplayValue(row.overrideValue)}
                </TableCell>
                <TableCell className="text-right align-top font-currency tabular-nums">
                  {row.delta === null ? <span className="text-muted-foreground">-</span> : <AmountCell val={row.delta} />}
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant={row.calculationImpacting ? 'default' : 'secondary'}>
                      {row.calculationImpacting ? 'Calculation' : 'Display'}
                    </Badge>
                    {row.aggregate ? <Badge variant="outline">Aggregate</Badge> : null}
                    <span className="w-full text-xs text-muted-foreground">{row.impact}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right align-top">
                  <Button type="button" size="sm" variant="outline" onClick={() => onReviewDoc(row.docId)}>
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    Go to source
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: React.ReactNode }): React.ReactElement {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    </div>
  )
}
