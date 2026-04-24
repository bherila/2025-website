'use client'

import currency from 'currency.js'
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'

import type { ScheduleBLines } from '@/components/finance/ScheduleBPreview'
import { TAX_TABS } from '@/components/finance/tax-tab-ids'
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
import type { F1099DivParsedData, F1099IntParsedData, Form1099RParsedData, W2ParsedData } from '@/types/finance/tax-document'
import type { Form1040LineItem } from '@/types/finance/tax-return'

export type { Form1040LineItem } from '@/types/finance/tax-return'

interface DataSource {
  label: string
  amount: currency
  note?: string
}

interface Form1040PreviewProps {
  w2Income: currency
  interestIncome: currency
  dividendIncome: currency
  scheduleCIncome: number
  scheduleEIncome?: number
  schedule1OtherIncome?: number
  deductibleSeTaxAdjustment?: number
  capitalGainOrLoss?: number | null
  schedule2TotalAdditionalTaxes?: number | null
  foreignTaxCredit?: number | null
  scheduleB?: ScheduleBLines
  selectedYear: number
  /** Confirmed/reviewed W-2 documents — when provided, line 1a uses their parsed data instead of payslip estimate. */
  w2Documents?: TaxDocument[]
  /** Confirmed/reviewed 1099-INT documents for interest income drill-down. */
  interestDocuments?: TaxDocument[]
  /** Confirmed/reviewed 1099-DIV documents for dividend income drill-down. */
  dividendDocuments?: TaxDocument[]
  /** Confirmed/reviewed 1099-R documents for retirement distributions. */
  retirementDocuments?: TaxDocument[]
  /** Called when the user clicks a 1040 line with a linked schedule tab. */
  onNavigate?: (tab: string) => void
}

interface LineItem {
  line: string
  label: string
  value: currency | null
  bold?: boolean
  refSchedule?: string
  sources?: DataSource[]
  /** Tab to navigate to when the row is clicked (requires onNavigate prop). */
  navTab?: string
}

interface DataSourceModalState {
  line: string
  label: string
  sources: DataSource[]
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

function mapScheduleBSources(lines: Array<{ label: string; amount: number }>): NonNullable<Form1040LineItem['sources']> {
  return lines.map((line) => ({
    label: line.label,
    amount: line.amount,
    note: 'Schedule B source',
  }))
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

export function computeForm1040Lines({
  w2Income,
  interestIncome,
  dividendIncome,
  scheduleCIncome,
  scheduleEIncome = 0,
  schedule1OtherIncome = 0,
  deductibleSeTaxAdjustment = 0,
  capitalGainOrLoss = null,
  schedule2TotalAdditionalTaxes = null,
  foreignTaxCredit = null,
  scheduleB,
  w2Documents = [],
  interestDocuments = [],
  dividendDocuments = [],
  retirementDocuments = [],
}: {
  w2Income: currency
  interestIncome: currency
  dividendIncome: currency
  scheduleCIncome: number
  scheduleEIncome?: number
  schedule1OtherIncome?: number
  deductibleSeTaxAdjustment?: number
  capitalGainOrLoss?: number | null
  schedule2TotalAdditionalTaxes?: number | null
  foreignTaxCredit?: number | null
  scheduleB?: ScheduleBLines
  w2Documents?: TaxDocument[]
  interestDocuments?: TaxDocument[]
  dividendDocuments?: TaxDocument[]
  retirementDocuments?: TaxDocument[]
}): Form1040LineItem[] {
  const reviewedW2Docs = w2Documents.filter(d => d.is_reviewed && d.parsed_data)
  const w2IncomeFromDocs = reviewedW2Docs.length > 0
    ? reviewedW2Docs.reduce(
        (acc, d) => acc.add((d.parsed_data as W2ParsedData)?.box1_wages ?? 0),
        currency(0),
      )
    : null

  const effectiveW2Income = w2IncomeFromDocs ?? w2Income

  const w2Sources = reviewedW2Docs.length > 0
    ? reviewedW2Docs.map(d => ({
        label: (d.parsed_data as W2ParsedData)?.employer_name ?? d.employment_entity?.display_name ?? d.original_filename ?? '',
        amount: currency((d.parsed_data as W2ParsedData)?.box1_wages ?? 0).value,
        note: 'W-2 Box 1',
      }))
    : [{ label: 'Payslip estimate (no W-2 uploaded)', amount: w2Income.value }]

  const scheduleBInterestTotal = currency(scheduleB?.interestTotal ?? interestIncome.value)
  const scheduleBDividendTotal = currency(scheduleB?.dividendTotal ?? dividendIncome.value)

  const reviewedIntDocs = interestDocuments.filter(d => d.is_reviewed && d.parsed_data)
  const interestSources = scheduleB?.interestLines.length
    ? mapScheduleBSources(scheduleB.interestLines)
    : reviewedIntDocs.length > 0
      ? reviewedIntDocs.map(d => ({
          label: (d.parsed_data as F1099IntParsedData)?.payer_name ?? d.account?.acct_name ?? d.original_filename ?? '',
          amount: currency((d.parsed_data as F1099IntParsedData)?.box1_interest ?? 0).value,
          note: '1099-INT Box 1',
        }))
      : [{ label: 'From confirmed Schedule B sources', amount: scheduleBInterestTotal.value }]

  const reviewedDivDocs = dividendDocuments.filter(d => d.is_reviewed && d.parsed_data)
  const dividendSources = scheduleB?.dividendLines.length
    ? mapScheduleBSources(scheduleB.dividendLines)
    : reviewedDivDocs.length > 0
      ? reviewedDivDocs.map(d => ({
          label: (d.parsed_data as F1099DivParsedData)?.payer_name ?? d.account?.acct_name ?? d.original_filename ?? '',
          amount: currency((d.parsed_data as F1099DivParsedData)?.box1a_ordinary ?? 0).value,
          note: '1099-DIV Box 1a',
        }))
      : [{ label: 'From confirmed Schedule B sources', amount: scheduleBDividendTotal.value }]

  const retirementSummary = compute1099RDistributionSummary(retirementDocuments)
  const schedule1AdditionalIncome = currency(scheduleCIncome)
    .add(scheduleEIncome)
    .add(schedule1OtherIncome)
  const schedule1Adjustment = currency(deductibleSeTaxAdjustment)

  const totalIncome = effectiveW2Income
    .add(scheduleBInterestTotal)
    .add(scheduleBDividendTotal)
    .add(retirementSummary.ira.taxable)
    .add(retirementSummary.pension.taxable)
    .add(capitalGainOrLoss ?? 0)
    .add(schedule1AdditionalIncome)
  const adjustedGrossIncome = totalIncome.subtract(schedule1Adjustment)

  const schedule1AdditionalIncomeSources: NonNullable<Form1040LineItem['sources']> = [
    ...(scheduleCIncome !== 0 ? [{ label: 'Schedule C net income (Schedule 1, line 3)', amount: currency(scheduleCIncome).value }] : []),
    ...(scheduleEIncome !== 0 ? [{ label: 'Schedule E income / (loss) (Schedule 1, line 5)', amount: currency(scheduleEIncome).value }] : []),
    ...(schedule1OtherIncome !== 0 ? [{ label: 'Schedule 1, line 8 other income', amount: currency(schedule1OtherIncome).value }] : []),
  ]

  const schedule1NavTab = scheduleCIncome !== 0 && scheduleEIncome === 0 && schedule1OtherIncome === 0
    ? TAX_TABS.scheduleC
    : undefined

  return [
    {
      line: '1a',
      label: 'Wages, salaries, tips (W-2, box 1)',
      value: effectiveW2Income.value,
      sources: w2Sources,
    },
    {
      line: '2b',
      label: 'Taxable interest',
      value: scheduleBInterestTotal.value,
      refSchedule: 'Schedule B',
      sources: interestSources,
      navTab: TAX_TABS.schedules,
    },
    {
      line: '3b',
      label: 'Ordinary dividends',
      value: scheduleBDividendTotal.value,
      refSchedule: 'Schedule B',
      sources: dividendSources,
      navTab: TAX_TABS.schedules,
    },
    ...(retirementSummary.ira.gross !== 0 || retirementSummary.ira.taxable !== 0
      ? [
          {
            line: '4a',
            label: 'IRA distributions',
            value: retirementSummary.ira.gross,
            ...(retirementSummary.ira.grossSources.length > 0 ? { sources: retirementSummary.ira.grossSources } : {}),
          },
          {
            line: '4b',
            label: 'Taxable amount',
            value: retirementSummary.ira.taxable,
            ...(retirementSummary.ira.taxableSources.length > 0 ? { sources: retirementSummary.ira.taxableSources } : {}),
          },
        ]
      : []),
    ...(retirementSummary.pension.gross !== 0 || retirementSummary.pension.taxable !== 0
      ? [
          {
            line: '5a',
            label: 'Pensions and annuities',
            value: retirementSummary.pension.gross,
            ...(retirementSummary.pension.grossSources.length > 0 ? { sources: retirementSummary.pension.grossSources } : {}),
          },
          {
            line: '5b',
            label: 'Taxable amount',
            value: retirementSummary.pension.taxable,
            ...(retirementSummary.pension.taxableSources.length > 0 ? { sources: retirementSummary.pension.taxableSources } : {}),
          },
        ]
      : []),
    {
      line: '7',
      label: 'Capital gain or loss',
      value: capitalGainOrLoss,
      refSchedule: 'Schedule D',
      navTab: TAX_TABS.capitalGains,
    },
    ...(schedule1AdditionalIncome.value !== 0
      ? [{
          line: '8',
          label: 'Additional income (Schedule 1)',
          value: schedule1AdditionalIncome.value,
          refSchedule: 'Schedule 1',
          sources: schedule1AdditionalIncomeSources,
          ...(schedule1NavTab ? { navTab: schedule1NavTab } : {}),
        }]
      : []),
    {
      line: '9',
      label: 'Total income',
      value: totalIncome.value,
      bold: true,
      sources: [
        { label: 'W-2 wages (Line 1a)', amount: effectiveW2Income.value },
        { label: 'Taxable interest (Line 2b)', amount: scheduleBInterestTotal.value },
        { label: 'Ordinary dividends (Line 3b)', amount: scheduleBDividendTotal.value },
        ...(retirementSummary.ira.taxable !== 0 ? [{ label: 'IRA taxable distributions (Line 4b)', amount: retirementSummary.ira.taxable }] : []),
        ...(retirementSummary.pension.taxable !== 0 ? [{ label: 'Pension / annuity taxable distributions (Line 5b)', amount: retirementSummary.pension.taxable }] : []),
        ...(capitalGainOrLoss !== null ? [{ label: 'Capital gain or loss (Line 7)', amount: capitalGainOrLoss }] : []),
        ...(schedule1AdditionalIncome.value !== 0 ? [{ label: 'Additional income (Line 8)', amount: schedule1AdditionalIncome.value }] : []),
      ],
    },
    {
      line: '10',
      label: 'Adjustments to income (Schedule 1)',
      value: schedule1Adjustment.value,
      refSchedule: 'Schedule 1',
      ...(schedule1Adjustment.value !== 0
        ? {
            sources: [{
              label: 'Deductible half of self-employment tax',
              amount: schedule1Adjustment.value,
              note: 'Schedule SE',
            }],
          }
        : {}),
    },
    {
      line: '11',
      label: 'Adjusted gross income',
      value: adjustedGrossIncome.value,
      bold: true,
      sources: [
        { label: 'Total income (Line 9)', amount: totalIncome.value },
        ...(schedule1Adjustment.value !== 0 ? [{ label: 'Adjustments to income (Line 10)', amount: -schedule1Adjustment.value }] : []),
      ],
    },
    ...(schedule2TotalAdditionalTaxes !== null && schedule2TotalAdditionalTaxes !== 0
      ? [{
          line: '17',
          label: 'Other taxes (Schedule 2)',
          value: schedule2TotalAdditionalTaxes,
          refSchedule: 'Schedule 2',
        }]
      : []),
    {
      line: '20',
      label: 'Foreign tax credit',
      value: foreignTaxCredit,
      refSchedule: 'Schedule 3',
      navTab: TAX_TABS.form1116,
    },
  ]
}

export default function Form1040Preview({
  w2Income,
  interestIncome,
  dividendIncome,
  scheduleCIncome,
  scheduleEIncome = 0,
  schedule1OtherIncome = 0,
  deductibleSeTaxAdjustment = 0,
  capitalGainOrLoss = null,
  schedule2TotalAdditionalTaxes = null,
  foreignTaxCredit = null,
  scheduleB,
  selectedYear,
  w2Documents,
  interestDocuments,
  dividendDocuments,
  retirementDocuments,
  onNavigate,
}: Form1040PreviewProps) {
  const [dataSourceModal, setDataSourceModal] = useState<DataSourceModalState | null>(null)
  const lines: LineItem[] = computeForm1040Lines({
    w2Income,
    interestIncome,
    dividendIncome,
    scheduleCIncome,
    scheduleEIncome,
    schedule1OtherIncome,
    deductibleSeTaxAdjustment,
    capitalGainOrLoss,
    schedule2TotalAdditionalTaxes,
    foreignTaxCredit,
    ...(scheduleB ? { scheduleB } : {}),
    ...(w2Documents ? { w2Documents } : {}),
    ...(interestDocuments ? { interestDocuments } : {}),
    ...(dividendDocuments ? { dividendDocuments } : {}),
    ...(retirementDocuments ? { retirementDocuments } : {}),
  }).map((line) => {
    const mappedLine: LineItem = {
      line: line.line,
      label: line.label,
      value: line.value === null ? null : currency(line.value),
      ...(line.bold ? { bold: line.bold } : {}),
      ...(line.refSchedule ? { refSchedule: line.refSchedule } : {}),
      ...(line.navTab ? { navTab: line.navTab } : {}),
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
                key={`${item.line}-${item.refSchedule ?? item.label}`}
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
                        onClick={(e) => { e.stopPropagation(); setDataSourceModal({ line: item.line, label: item.label, sources: item.sources! }) }}
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
