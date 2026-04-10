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

export default function Form1040Preview({
  w2Income,
  interestIncome,
  dividendIncome,
  scheduleCIncome,
  selectedYear,
  w2Documents,
  interestDocuments,
  dividendDocuments,
  onNavigate,
}: Form1040PreviewProps) {
  const [dataSourceModal, setDataSourceModal] = useState<DataSourceModalState | null>(null)

  // Compute W-2 income: prefer confirmed W-2 documents when available
  const reviewedW2Docs = (w2Documents ?? []).filter(d => d.is_reviewed && d.parsed_data)
  const w2IncomeFromDocs = reviewedW2Docs.length > 0
    ? reviewedW2Docs.reduce(
        (acc, d) => acc.add((d.parsed_data as W2ParsedData)?.box1_wages ?? 0),
        currency(0),
      )
    : null

  const effectiveW2Income = w2IncomeFromDocs ?? w2Income

  // Build data sources for W-2 line
  const w2Sources: DataSource[] = reviewedW2Docs.length > 0
    ? reviewedW2Docs.map(d => ({
        label: (d.parsed_data as W2ParsedData)?.employer_name ?? d.employment_entity?.display_name ?? d.original_filename ?? '',
        amount: currency((d.parsed_data as W2ParsedData)?.box1_wages ?? 0),
        note: 'W-2 Box 1',
      }))
    : [{ label: 'Payslip estimate (no W-2 uploaded)', amount: w2Income }]

  // Build data sources for interest income
  const reviewedIntDocs = (interestDocuments ?? []).filter(d => d.is_reviewed && d.parsed_data)
  const interestSources: DataSource[] = reviewedIntDocs.length > 0
    ? reviewedIntDocs.map(d => ({
        label: (d.parsed_data as F1099IntParsedData)?.payer_name ?? d.account?.acct_name ?? d.original_filename ?? '',
        amount: currency((d.parsed_data as F1099IntParsedData)?.box1_interest ?? 0),
        note: '1099-INT Box 1',
      }))
    : [{ label: 'From confirmed 1099-INT documents', amount: interestIncome }]

  // Build data sources for dividend income
  const reviewedDivDocs = (dividendDocuments ?? []).filter(d => d.is_reviewed && d.parsed_data)
  const dividendSources: DataSource[] = reviewedDivDocs.length > 0
    ? reviewedDivDocs.map(d => ({
        label: (d.parsed_data as F1099DivParsedData)?.payer_name ?? d.account?.acct_name ?? d.original_filename ?? '',
        amount: currency((d.parsed_data as F1099DivParsedData)?.box1a_ordinary ?? 0),
        note: '1099-DIV Box 1a',
      }))
    : [{ label: 'From confirmed 1099-DIV documents', amount: dividendIncome }]

  const totalIncome = effectiveW2Income
    .add(interestIncome)
    .add(dividendIncome)
    .add(scheduleCIncome)

  const lines: LineItem[] = [
    {
      line: '1a',
      label: 'Wages, salaries, tips (W-2, box 1)',
      value: effectiveW2Income,
      sources: w2Sources,
    },
    {
      line: '2b',
      label: 'Taxable interest',
      value: interestIncome,
      refSchedule: 'Schedule B',
      sources: interestSources,
      navTab: TAX_TABS.schedules,
    },
    {
      line: '3b',
      label: 'Ordinary dividends',
      value: dividendIncome,
      refSchedule: 'Schedule B',
      sources: dividendSources,
      navTab: TAX_TABS.schedules,
    },
    {
      line: '7',
      label: 'Capital gain or loss',
      value: null,
      refSchedule: 'Schedule D',
      // Always shown as a navigation link to Schedule D; value populated when capital-gains data is wired in.
      navTab: TAX_TABS.capitalGains,
    },
    ...(scheduleCIncome !== 0
      ? [{
          line: '8',
          label: 'Business income or loss (Schedule C)',
          value: currency(scheduleCIncome),
          refSchedule: 'Schedule C',
          sources: [{ label: 'Schedule C net income', amount: currency(scheduleCIncome) }],
          navTab: TAX_TABS.scheduleC,
        }]
      : []),
    {
      line: '9',
      label: 'Total income',
      value: totalIncome,
      bold: true,
      sources: [
        { label: 'W-2 wages (Line 1a)', amount: effectiveW2Income },
        { label: 'Interest income (Line 2b)', amount: interestIncome },
        { label: 'Ordinary dividends (Line 3b)', amount: dividendIncome },
        ...(scheduleCIncome !== 0 ? [{ label: 'Schedule C income (Line 8)', amount: currency(scheduleCIncome) }] : []),
      ],
    },
    {
      line: '20',
      label: 'Foreign tax credit',
      value: null,
      refSchedule: 'Schedule 3',
      // Always shown as a navigation link to Form 1116; value populated when foreign-tax data is wired in.
      navTab: TAX_TABS.form1116,
    },
  ]

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
