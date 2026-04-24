'use client'

import currency from 'currency.js'
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'

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
import type { F1099DivParsedData, F1099IntParsedData, W2ParsedData } from '@/types/finance/tax-document'
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
  schedule1OtherIncome?: number
  /** Schedule E combined net income (K-1 partnerships + 1099-MISC rental/royalties) — feeds Schedule 1 line 5. */
  scheduleEGrandTotal?: number
  selectedYear: number
  /** Confirmed/reviewed W-2 documents — when provided, line 1a uses their parsed data instead of payslip estimate. */
  w2Documents?: TaxDocument[]
  /** Confirmed/reviewed 1099-INT documents for interest income drill-down. */
  interestDocuments?: TaxDocument[]
  /** Confirmed/reviewed 1099-DIV documents for dividend income drill-down. */
  dividendDocuments?: TaxDocument[]
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

export function computeForm1040Lines({
  w2Income,
  interestIncome,
  dividendIncome,
  scheduleCIncome,
  schedule1OtherIncome = 0,
  scheduleEGrandTotal = 0,
  w2Documents = [],
  interestDocuments = [],
  dividendDocuments = [],
}: {
  w2Income: currency
  interestIncome: currency
  dividendIncome: currency
  scheduleCIncome: number
  schedule1OtherIncome?: number
  scheduleEGrandTotal?: number
  w2Documents?: TaxDocument[]
  interestDocuments?: TaxDocument[]
  dividendDocuments?: TaxDocument[]
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

  const reviewedIntDocs = interestDocuments.filter(d => d.is_reviewed && d.parsed_data)
  const interestSources = reviewedIntDocs.length > 0
    ? reviewedIntDocs.map(d => ({
        label: (d.parsed_data as F1099IntParsedData)?.payer_name ?? d.account?.acct_name ?? d.original_filename ?? '',
        amount: currency((d.parsed_data as F1099IntParsedData)?.box1_interest ?? 0).value,
        note: '1099-INT Box 1',
      }))
    : [{ label: 'From confirmed 1099-INT documents', amount: interestIncome.value }]

  const reviewedDivDocs = dividendDocuments.filter(d => d.is_reviewed && d.parsed_data)
  const dividendSources = reviewedDivDocs.length > 0
    ? reviewedDivDocs.map(d => ({
        label: (d.parsed_data as F1099DivParsedData)?.payer_name ?? d.account?.acct_name ?? d.original_filename ?? '',
        amount: currency((d.parsed_data as F1099DivParsedData)?.box1a_ordinary ?? 0).value,
        note: '1099-DIV Box 1a',
      }))
    : [{ label: 'From confirmed 1099-DIV documents', amount: dividendIncome.value }]

  const schedule1Total = currency(scheduleCIncome)
    .add(scheduleEGrandTotal)
    .add(schedule1OtherIncome).value

  const schedule1Sources: { label: string; amount: number; note?: string }[] = [
    ...(scheduleCIncome !== 0
      ? [{ label: 'Schedule C — Business income', amount: currency(scheduleCIncome).value, note: 'Schedule 1 line 3' }]
      : []),
    ...(scheduleEGrandTotal !== 0
      ? [{ label: 'Schedule E — Rental / royalty / partnership', amount: currency(scheduleEGrandTotal).value, note: 'Schedule 1 line 5' }]
      : []),
    ...(schedule1OtherIncome !== 0
      ? [{ label: '1099-MISC other income', amount: currency(schedule1OtherIncome).value, note: 'Schedule 1 line 8z' }]
      : []),
  ]

  const totalIncome = effectiveW2Income
    .add(interestIncome)
    .add(dividendIncome)
    .add(schedule1Total)

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
      value: interestIncome.value,
      refSchedule: 'Schedule B',
      sources: interestSources,
      navTab: TAX_TABS.schedules,
    },
    {
      line: '3b',
      label: 'Ordinary dividends',
      value: dividendIncome.value,
      refSchedule: 'Schedule B',
      sources: dividendSources,
      navTab: TAX_TABS.schedules,
    },
    {
      line: '7',
      label: 'Capital gain or loss',
      value: null,
      refSchedule: 'Schedule D',
      navTab: TAX_TABS.capitalGains,
    },
    ...(schedule1Total !== 0
      ? [{
          line: '8',
          label: 'Additional income from Schedule 1, line 10',
          value: currency(schedule1Total).value,
          refSchedule: 'Schedule 1',
          sources: schedule1Sources,
          navTab: TAX_TABS.schedule1,
        }]
      : []),
    {
      line: '9',
      label: 'Total income',
      value: totalIncome.value,
      bold: true,
      sources: [
        { label: 'W-2 wages (Line 1a)', amount: effectiveW2Income.value },
        { label: 'Interest income (Line 2b)', amount: interestIncome.value },
        { label: 'Ordinary dividends (Line 3b)', amount: dividendIncome.value },
        ...(schedule1Total !== 0 ? [{ label: 'Additional income (Line 8)', amount: currency(schedule1Total).value }] : []),
      ],
    },
    {
      line: '20',
      label: 'Foreign tax credit',
      value: null,
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
  schedule1OtherIncome = 0,
  scheduleEGrandTotal = 0,
  selectedYear,
  w2Documents,
  interestDocuments,
  dividendDocuments,
  onNavigate,
}: Form1040PreviewProps) {
  const [dataSourceModal, setDataSourceModal] = useState<DataSourceModalState | null>(null)
  const lines: LineItem[] = computeForm1040Lines({
    w2Income,
    interestIncome,
    dividendIncome,
    scheduleCIncome,
    schedule1OtherIncome,
    scheduleEGrandTotal,
    ...(w2Documents ? { w2Documents } : {}),
    ...(interestDocuments ? { interestDocuments } : {}),
    ...(dividendDocuments ? { dividendDocuments } : {}),
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
