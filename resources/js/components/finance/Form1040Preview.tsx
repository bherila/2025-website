'use client'

import currency from 'currency.js'
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'

import { TAX_TABS, type TaxTabId } from '@/components/finance/tax-tab-ids'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { TaxDocument } from '@/types/finance/tax-document'
import type { Form1099RParsedData } from '@/types/finance/tax-document'
import type { Form1040LineItem } from '@/types/finance/tax-return'
import type { Form1040Facts, TaxFactSource } from '@/types/generated/tax-preview-facts'

export type { Form1040LineItem } from '@/types/finance/tax-return'

interface DataSource {
  label: string
  amount: currency
  note?: string
}

interface Form1040PreviewProps {
  facts?: Form1040Facts | null | undefined
  selectedYear: number
  /** Called when the user clicks a 1040 line with a linked schedule tab. */
  onNavigate?: ((tab: TaxTabId) => void) | undefined
}

interface LineItem {
  line: string
  label: string
  value: currency | null
  bold?: boolean
  refSchedule?: string
  sources?: DataSource[]
  /** Tab to navigate to when the row is clicked (requires onNavigate prop). */
  navTab?: TaxTabId
}

interface DataSourceModalState {
  line: string
  label: string
  sources: DataSource[]
  navTab?: TaxTabId
  refSchedule?: string
}

interface RetirementDistributionBucket {
  gross: number
  taxable: number
  grossSources: NonNullable<Form1040LineItem['sources']>
  taxableSources: NonNullable<Form1040LineItem['sources']>
}

export interface RetirementDistributionSummary {
  ira: RetirementDistributionBucket
  pension: RetirementDistributionBucket
  federalWithholding: number
}

function createRetirementDistributionBucket(): RetirementDistributionBucket {
  return {
    gross: 0,
    taxable: 0,
    grossSources: [],
    taxableSources: [],
  }
}

/**
 * Prefer the explicit IRS checkbox indicator when the free-form distribution_type
 * text is ambiguous. distribution_type is treated as a best-effort hint only.
 */
function isIraDistribution(parsed: Form1099RParsedData): boolean {
  const distributionType = typeof parsed.distribution_type === 'string'
    ? parsed.distribution_type.toLowerCase()
    : null

  if (distributionType) {
    const looksLikeIra = (
      distributionType.includes('ira')
      || distributionType.includes('sep')
      || distributionType.includes('simple')
    )
    const looksLikePension = (
      distributionType.includes('pension')
      || distributionType.includes('annuity')
    )

    if (looksLikeIra && !looksLikePension) {
      return true
    }

    if (looksLikePension && !looksLikeIra) {
      return false
    }
  }

  // When the free-form text is missing or ambiguous, defer to the explicit
  // IRS checkbox that distinguishes IRA / SEP / SIMPLE from pension income.
  return parsed.box7_ira_sep_simple === true
}

function getRetirementPayerLabel(doc: TaxDocument, parsed: Form1099RParsedData): string {
  return parsed.payer_name ?? doc.account?.acct_name ?? doc.original_filename ?? `1099-R #${doc.id}`
}

/**
 * Aggregate reviewed 1099-R documents for Form 1040 lines 4 and 5.
 *
 * When Box 2a is blank, the preview falls back to Box 1 as a best-effort taxable
 * amount estimate so retirement income is not dropped entirely from AGI. This is
 * intentionally conservative preview behavior only; a blank Box 2a can require a
 * manual taxability determination on the filed return.
 */
export function compute1099RDistributionSummary(retirementDocuments: TaxDocument[]): RetirementDistributionSummary {
  const summary: RetirementDistributionSummary = {
    ira: createRetirementDistributionBucket(),
    pension: createRetirementDistributionBucket(),
    federalWithholding: 0,
  }

  for (const doc of retirementDocuments) {
    if (!doc.is_reviewed || !doc.parsed_data || Array.isArray(doc.parsed_data)) {
      continue
    }

    const parsed = doc.parsed_data as Form1099RParsedData
    const bucket = isIraDistribution(parsed) ? summary.ira : summary.pension
    const payerLabel = getRetirementPayerLabel(doc, parsed)
    const grossDistribution = parsed.box1_gross_distribution ?? 0
    const taxableDistribution = parsed.box2a_taxable_amount ?? parsed.box1_gross_distribution ?? 0
    const taxableSourceNote = parsed.box2a_taxable_amount == null
      ? '1099-R Box 1 (fallback for blank Box 2a)'
      : '1099-R Box 2a'

    bucket.gross = currency(bucket.gross).add(grossDistribution).value
    bucket.taxable = currency(bucket.taxable).add(taxableDistribution).value

    if (grossDistribution !== 0) {
      bucket.grossSources.push({
        label: payerLabel,
        amount: grossDistribution,
        note: '1099-R Box 1',
      })
    }

    if (taxableDistribution !== 0) {
      bucket.taxableSources.push({
        label: payerLabel,
        amount: taxableDistribution,
        note: taxableSourceNote,
      })
    }

    summary.federalWithholding = currency(summary.federalWithholding).add(parsed.box4_fed_tax ?? 0).value
  }

  return summary
}

type NumericForm1040FactKey = {
  [Key in keyof Form1040Facts]: Form1040Facts[Key] extends number ? Key : never
}[keyof Form1040Facts]

type SourceForm1040FactKey = {
  [Key in keyof Form1040Facts]: Form1040Facts[Key] extends TaxFactSource[] ? Key : never
}[keyof Form1040Facts]

interface Form1040LineDefinition {
  line: string
  label: string
  valueKey: NumericForm1040FactKey
  sourcesKey?: SourceForm1040FactKey
  bold?: boolean
  refSchedule?: string
  navTab?: TaxTabId
  /**
   * Lines that the backend builder does not yet populate. Rendered only when
   * the value is non-zero (e.g. populated by a future builder), so a stub line
   * does not show a definitive "$0" in the UI.
   */
  unwired?: boolean
}

const FORM1040_LINE_DEFINITIONS: Form1040LineDefinition[] = [
  { line: '1z', label: 'Wages, salaries, tips', valueKey: 'line1z', sourcesKey: 'line1zSources' },
  { line: '2a', label: 'Tax-exempt interest', valueKey: 'line2a', sourcesKey: 'line2aSources' },
  { line: '2b', label: 'Taxable interest', valueKey: 'line2b', sourcesKey: 'line2bSources', refSchedule: 'Schedule B', navTab: TAX_TABS.schedules },
  { line: '3a', label: 'Qualified dividends', valueKey: 'line3a', sourcesKey: 'line3aSources', refSchedule: 'Schedule B', navTab: TAX_TABS.schedules },
  { line: '3b', label: 'Ordinary dividends', valueKey: 'line3b', sourcesKey: 'line3bSources', refSchedule: 'Schedule B', navTab: TAX_TABS.schedules },
  { line: '4a', label: 'IRA distributions', valueKey: 'line4a', sourcesKey: 'line4aSources' },
  { line: '4b', label: 'Taxable IRA distributions', valueKey: 'line4b', sourcesKey: 'line4bSources' },
  { line: '5a', label: 'Pensions and annuities', valueKey: 'line5a', sourcesKey: 'line5aSources' },
  { line: '5b', label: 'Taxable pensions and annuities', valueKey: 'line5b', sourcesKey: 'line5bSources' },
  { line: '6a', label: 'Social security benefits', valueKey: 'line6a', sourcesKey: 'line6aSources', unwired: true },
  { line: '6b', label: 'Taxable social security benefits', valueKey: 'line6b', sourcesKey: 'line6bSources', unwired: true },
  { line: '7', label: 'Capital gain or loss', valueKey: 'line7', sourcesKey: 'line7Sources', refSchedule: 'Schedule D', navTab: TAX_TABS.capitalGains },
  { line: '8', label: 'Additional income from Schedule 1', valueKey: 'line8', sourcesKey: 'line8Sources', refSchedule: 'Schedule 1', navTab: TAX_TABS.schedule1 },
  { line: '9', label: 'Total income', valueKey: 'line9', bold: true },
  { line: '10', label: 'Adjustments to income', valueKey: 'line10', sourcesKey: 'line10Sources', refSchedule: 'Schedule 1', navTab: TAX_TABS.schedule1 },
  { line: '11', label: 'Adjusted gross income', valueKey: 'line11', bold: true },
  { line: '12', label: 'Standard deduction or itemized deductions', valueKey: 'line12', sourcesKey: 'line12Sources', refSchedule: 'Schedule A', navTab: TAX_TABS.schedules },
  { line: '13', label: 'Qualified business income deduction', valueKey: 'line13', sourcesKey: 'line13Sources', refSchedule: 'Form 8995', navTab: TAX_TABS.form8995 },
  { line: '14', label: 'Total deductions', valueKey: 'line14', bold: true },
  { line: '15', label: 'Taxable income', valueKey: 'line15', bold: true },
  { line: '16', label: 'Tax', valueKey: 'line16', sourcesKey: 'line16Sources' },
  { line: '17', label: 'Amount from Schedule 2, line 3', valueKey: 'line17', sourcesKey: 'line17Sources', refSchedule: 'Schedule 2', navTab: TAX_TABS.schedule2 },
  { line: '18', label: 'Total tax before credits', valueKey: 'line18', bold: true },
  { line: '19', label: 'Child tax credit and credit for other dependents', valueKey: 'line19', unwired: true },
  { line: '20', label: 'Nonrefundable credits from Schedule 3', valueKey: 'line20', sourcesKey: 'line20Sources', refSchedule: 'Schedule 3', navTab: TAX_TABS.schedule3 },
  { line: '21', label: 'Total credits', valueKey: 'line21' },
  { line: '22', label: 'Tax after nonrefundable credits', valueKey: 'line22', bold: true },
  { line: '23', label: 'Other taxes', valueKey: 'line23', sourcesKey: 'line23Sources', refSchedule: 'Schedule 2', navTab: TAX_TABS.schedule2 },
  { line: '24', label: 'Total tax', valueKey: 'line24', bold: true },
  { line: '25a', label: 'Federal income tax withheld from W-2', valueKey: 'line25a', sourcesKey: 'line25aSources' },
  { line: '25b', label: 'Federal income tax withheld from 1099', valueKey: 'line25b', sourcesKey: 'line25bSources' },
  { line: '25c', label: 'Federal income tax withheld from other forms', valueKey: 'line25c', sourcesKey: 'line25cSources', unwired: true },
  { line: '25d', label: 'Total federal income tax withheld', valueKey: 'line25d', bold: true },
  { line: '26', label: 'Estimated tax payments', valueKey: 'line26', sourcesKey: 'line26Sources', unwired: true },
  { line: '31', label: 'Other payments and refundable credits from Schedule 3', valueKey: 'line31', sourcesKey: 'line31Sources', refSchedule: 'Schedule 3', navTab: TAX_TABS.schedule3 },
  { line: '32', label: 'Total other payments and refundable credits', valueKey: 'line32', bold: true },
  { line: '33', label: 'Total payments', valueKey: 'line33', bold: true },
  { line: '34', label: 'Overpaid', valueKey: 'line34', bold: true },
  { line: '35a', label: 'Amount refunded', valueKey: 'line35a' },
  { line: '36', label: 'Amount applied to estimated tax', valueKey: 'line36', unwired: true },
  { line: '37', label: 'Amount you owe', valueKey: 'line37', bold: true },
  { line: '38', label: 'Estimated tax penalty', valueKey: 'line38', unwired: true },
]

function sourceNote(source: TaxFactSource): string | undefined {
  if (source.notes) {
    return source.notes
  }

  if (source.formType && source.box) {
    return `${source.formType} box ${source.box}`
  }

  return source.routingReason ?? undefined
}

function mapTaxFactSources(sources: TaxFactSource[] | undefined): Form1040LineItem['sources'] | undefined {
  if (!sources || sources.length === 0) {
    return undefined
  }

  return sources.map((source) => {
    const note = sourceNote(source)

    return {
      label: source.label,
      amount: source.amount,
      ...(note ? { note } : {}),
    }
  })
}

export function form1040FactsToLines(facts?: Form1040Facts | null): Form1040LineItem[] {
  if (!facts) {
    return []
  }

  return FORM1040_LINE_DEFINITIONS.flatMap((definition) => {
    const value = facts[definition.valueKey]
    const sources = definition.sourcesKey ? mapTaxFactSources(facts[definition.sourcesKey]) : undefined

    if (definition.unwired && value === 0 && !sources) {
      return []
    }

    return [{
      line: definition.line,
      label: definition.label,
      value,
      ...(definition.bold ? { bold: definition.bold } : {}),
      ...(definition.refSchedule ? { refSchedule: definition.refSchedule } : {}),
      ...(definition.navTab ? { navTab: definition.navTab } : {}),
      ...(sources ? { sources } : {}),
    }]
  })
}

export default function Form1040Preview({
  facts,
  selectedYear,
  onNavigate,
}: Form1040PreviewProps) {
  const [dataSourceModal, setDataSourceModal] = useState<DataSourceModalState | null>(null)
  const rawLines = form1040FactsToLines(facts)
  const lines: LineItem[] = rawLines.map((line) => {
    const mappedLine: LineItem = {
      line: line.line,
      label: line.label,
      value: line.value === null ? null : currency(line.value),
      ...(line.bold ? { bold: line.bold } : {}),
      ...(line.refSchedule ? { refSchedule: line.refSchedule } : {}),
      ...(line.navTab ? { navTab: line.navTab as TaxTabId } : {}),
    }

    if (line.sources) {
      mappedLine.sources = line.sources.map(source => ({
        label: source.label,
        amount: currency(source.amount),
        ...(source.note ? { note: source.note } : {}),
      }))
    }

    return mappedLine
  })

  return (
    <div className="px-4 pb-4">
      <h2 className="text-lg font-semibold mt-4 mb-2">Form 1040 Preview — {selectedYear}</h2>
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Line</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right w-40">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map(item => (
              <TableRow
                key={item.line}
                className={cn(
                  item.bold && 'font-semibold bg-muted/30',
                  item.navTab && onNavigate && 'cursor-pointer hover:bg-muted/20 transition-colors',
                )}
                onClick={item.navTab && onNavigate ? () => { onNavigate(item.navTab!) } : undefined}
              >
                <TableCell className="text-sm font-mono">{item.line}</TableCell>
                <TableCell className="text-sm">
                  <span className="flex items-center gap-1">
                    <span>{item.label}</span>
                    {item.refSchedule && (
                      <span className="text-xs text-muted-foreground">({item.refSchedule})</span>
                    )}
                    {item.navTab && onNavigate && (
                      <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-right text-sm font-mono">
                  {item.value !== null ? (
                    item.sources && item.sources.length > 0 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 font-mono text-sm underline decoration-dotted hover:text-primary"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDataSourceModal({
                            line: item.line,
                            label: item.label,
                            sources: item.sources!,
                            ...(item.navTab ? { navTab: item.navTab } : {}),
                            ...(item.refSchedule ? { refSchedule: item.refSchedule } : {}),
                          })
                        }}
                        title="View data sources"
                      >
                        {item.value.format()}
                      </Button>
                    ) : (
                      item.value.format()
                    )
                  ) : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Data Source drill-down modal */}
      <Dialog open={dataSourceModal !== null} onOpenChange={open => !open && setDataSourceModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Data Source — Line {dataSourceModal?.line}</DialogTitle>
          </DialogHeader>
          {dataSourceModal && (
            <div className="space-y-3 py-1">
              <p className="text-sm text-muted-foreground">{dataSourceModal.label}</p>
              {dataSourceModal.navTab && onNavigate && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    onNavigate(dataSourceModal.navTab!)
                    setDataSourceModal(null)
                  }}
                >
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  Go to {dataSourceModal.refSchedule ?? 'source'}
                </Button>
              )}
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      {dataSourceModal.sources.some(s => s.note) && <TableHead>Field</TableHead>}
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dataSourceModal.sources.map((src, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{src.label}</TableCell>
                        {dataSourceModal.sources.some(s => s.note) && (
                          <TableCell className="text-xs text-muted-foreground">{src.note ?? ''}</TableCell>
                        )}
                        <TableCell className="text-right text-sm font-mono">{src.amount.format()}</TableCell>
                      </TableRow>
                    ))}
                    {dataSourceModal.sources.length > 1 && (
                      <TableRow className="font-semibold bg-muted/30">
                        <TableCell className="text-sm">Total</TableCell>
                        {dataSourceModal.sources.some(s => s.note) && <TableCell />}
                        <TableCell className="text-right text-sm font-mono">
                          {dataSourceModal.sources.reduce((acc, s) => acc.add(s.amount), currency(0)).format()}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
