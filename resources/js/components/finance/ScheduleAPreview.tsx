'use client'

import currency from 'currency.js'
import { useState } from 'react'

import { isFK1StructuredData } from '@/components/finance/k1'
import { FormBlock, FormLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { ShortDividendSummary } from '@/lib/finance/shortDividendAnalysis'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'
import type { ScheduleALines } from '@/types/finance/tax-return'

import { ShortDividendSummaryCard } from './ShortDividendDetailModal'

export type { ScheduleALines } from '@/types/finance/tax-return'

interface InvIntSource {
  label: string
  /** Negative means expense (charge). Positive means income. */
  amount: number
}

const SALT_CAP = 10_000

// Standard deductions by year (single / MFJ) — IRS Rev. Proc.
const STANDARD_DEDUCTIONS: Record<number, { single: number; mfj: number }> = {
  2023: { single: 13_850, mfj: 27_700 },
  2024: { single: 14_600, mfj: 29_200 },
  2025: { single: 15_000, mfj: 30_000 },
}

function getStandardDeduction(year: number, isMarried: boolean): number {
  const row = STANDARD_DEDUCTIONS[year] ?? STANDARD_DEDUCTIONS[2025] ?? { single: 15_000, mfj: 30_000 }
  return isMarried ? row.mfj : row.single
}

export function computeScheduleALines({
  reviewedK1Docs = [],
  reviewed1099Docs = [],
  shortDividendSummary,
  saltPaid = 0,
  year = new Date().getFullYear(),
  isMarried = false,
}: {
  reviewedK1Docs?: TaxDocument[]
  reviewed1099Docs?: TaxDocument[]
  shortDividendSummary?: ShortDividendSummary
  /** State and local taxes paid (will be capped at $10,000). */
  saltPaid?: number
  year?: number
  isMarried?: boolean
}): ScheduleALines {
  const invIntSources: InvIntSource[] = []

  const k1Parsed = reviewedK1Docs
    .map((d) => ({ doc: d, data: isFK1StructuredData(d.parsed_data) ? d.parsed_data : null }))
    .filter((x): x is { doc: TaxDocument; data: FK1StructuredData } => x.data !== null)

  for (const { doc, data } of k1Parsed) {
    const partnerName =
      data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership'
    const hItems = (data.codes['13'] ?? []).filter((item) => item.code === 'H')
    for (const item of hItems) {
      const n = parseFloat(item.value)
      if (!isNaN(n) && n !== 0) {
        invIntSources.push({ label: `${partnerName} — K-1 Box 13H (investment interest)`, amount: -Math.abs(n) })
      }
    }
    const gItems = (data.codes['13'] ?? []).filter((item) => item.code === 'G')
    for (const item of gItems) {
      const n = parseFloat(item.value)
      if (!isNaN(n) && n !== 0) {
        invIntSources.push({ label: `${partnerName} — K-1 Box 13G (investment interest)`, amount: -Math.abs(n) })
      }
    }
  }

  for (const doc of reviewed1099Docs) {
    const p = doc.parsed_data as Record<string, unknown>
    const payer = (p?.payer_name as string | undefined) ?? doc.employment_entity?.display_name ?? '1099'
    const box5 = p?.box5_investment_expense ?? p?.int_5_investment_expenses
    if (typeof box5 === 'number' && box5 !== 0) {
      invIntSources.push({ label: `${payer} — 1099-INT Box 5 (investment expense)`, amount: -Math.abs(box5) })
    }
    const bIntInvExp = p?.b_investment_expenses
    if (typeof bIntInvExp === 'number' && bIntInvExp !== 0) {
      invIntSources.push({ label: `${payer} — 1099-B investment expense`, amount: -Math.abs(bIntInvExp) })
    }
  }

  const shortDivDeduction = shortDividendSummary?.totalItemizedDeduction ?? 0
  if (shortDivDeduction > 0) {
    invIntSources.push({
      label: 'Short dividends — positions held > 45 days (IRS Pub. 550)',
      amount: -shortDivDeduction,
    })
  }

  const totalInvIntExpense = invIntSources.reduce(
    (acc, s) => acc.add(Math.abs(s.amount)),
    currency(0),
  ).value

  const saltDeduction = Math.min(saltPaid, SALT_CAP)
  const totalItemizedDeductions = currency(totalInvIntExpense).add(saltDeduction).value
  const standardDeduction = getStandardDeduction(year, isMarried)
  const shouldItemize = totalItemizedDeductions > standardDeduction

  return {
    invIntSources,
    totalInvIntExpense,
    saltDeduction,
    totalItemizedDeductions,
    standardDeduction,
    shouldItemize,
  }
}

interface ScheduleAPreviewProps {
  selectedYear: number
  reviewedK1Docs?: TaxDocument[]
  reviewed1099Docs?: TaxDocument[]
  shortDividendSummary?: ShortDividendSummary
  /** State and local taxes paid (from W-2 Box 17). Capped at $10,000 on the form. */
  saltPaid?: number
  isMarried?: boolean
}

/** Modal showing all sources that contribute to investment interest expense. */
function InvIntSourcesModal({
  isOpen,
  onClose,
  sources,
  total,
}: {
  isOpen: boolean
  onClose: () => void
  sources: InvIntSource[]
  total: number
}) {
  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Investment Interest Expense — Data Sources</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          These items contribute to Schedule A Line 9 (Investment Interest Expense),
          subject to the Form 4952 net investment income limitation.
        </p>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((src, i) => (
                <TableRow key={i}>
                  <TableCell className="text-sm">{src.label}</TableCell>
                  <TableCell className="text-right font-mono text-sm text-red-600 dark:text-red-400">
                    {currency(Math.abs(src.amount)).format()}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold bg-muted/50">
                <TableCell>Total</TableCell>
                <TableCell className="text-right font-mono text-red-600 dark:text-red-400">
                  {currency(total).format()}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">
          Reference: IRS Schedule A Line 9. Investment interest is deductible up to net investment
          income (Form 4952). Excess carries forward.
        </p>
      </DialogContent>
    </Dialog>
  )
}

export default function ScheduleAPreview({
  selectedYear,
  reviewedK1Docs = [],
  reviewed1099Docs = [],
  shortDividendSummary,
  saltPaid = 0,
  isMarried = false,
}: ScheduleAPreviewProps) {
  const [showInvIntModal, setShowInvIntModal] = useState(false)

  const shortDivDeduction = shortDividendSummary?.totalItemizedDeduction ?? 0
  const { invIntSources, totalInvIntExpense, saltDeduction, totalItemizedDeductions, standardDeduction, shouldItemize } = computeScheduleALines({
    reviewedK1Docs,
    reviewed1099Docs,
    ...(shortDividendSummary ? { shortDividendSummary } : {}),
    saltPaid,
    year: selectedYear,
    isMarried,
  })

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold mb-0.5">Schedule A — {selectedYear}</h3>
        <p className="text-xs text-muted-foreground">Itemized Deductions</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Part I — Medical */}
        <FormBlock title="Part I — Medical and Dental Expenses">
          <FormLine label="Line 1 — Medical expenses" raw="—" />
          <FormTotalLine label="Line 4 — Deductible medical" value={0} />
        </FormBlock>

        {/* Part II — Taxes */}
        <FormBlock title="Part II — Taxes You Paid">
          <FormLine
            label="Line 5a — State income tax withheld (W-2 Box 17)"
            {...(saltPaid > 0 ? { value: saltPaid } : { raw: '—' })}
          />
          <FormLine label="Line 6 — Real estate taxes" raw="Enter from records" />
          <FormTotalLine
            label={`Line 7 — Total SALT (capped at $${SALT_CAP.toLocaleString()})`}
            value={saltDeduction}
          />
          {saltPaid >= SALT_CAP && (
            <FormLine label="Note" raw={`SALT cap reached — state taxes above $${SALT_CAP.toLocaleString()} are not deductible`} />
          )}
        </FormBlock>

        {/* Part IV — Interest */}
        <FormBlock title="Part IV — Interest You Paid">
          <FormLine label="Line 8 — Home mortgage interest" raw="—" />
          <FormLine
            label="Line 9 — Investment interest expense (from Form 4952)"
            value={totalInvIntExpense > 0 ? totalInvIntExpense : null}
            {...(totalInvIntExpense === 0 ? { raw: '—' } : {})}
            {...(invIntSources.length > 0 ? { onClick: () => setShowInvIntModal(true) } : {})}
          />
          <FormTotalLine label="Line 10 — Total interest" value={totalInvIntExpense} />
        </FormBlock>

        {/* Part V — Gifts */}
        <FormBlock title="Part V — Gifts to Charity">
          <FormLine label="Line 11 — Cash contributions" raw="—" />
          <FormLine label="Line 12 — Non-cash contributions" raw="—" />
          <FormTotalLine label="Line 14 — Total gifts" value={0} />
        </FormBlock>
      </div>

      {/* Short dividend detail */}
      {shortDividendSummary && shortDividendSummary.entries.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Short Dividend — Investment Interest Detail</h4>
          <p className="text-xs text-muted-foreground">
            Per IRS Publication 550, dividends charged on short positions held more than 45 days
            are deductible as investment interest expense on Schedule A Line 9, subject to the
            Form 4952 net investment income limitation. Click a category below for supporting
            transactions.
          </p>
          <ShortDividendSummaryCard summary={shortDividendSummary} />
        </div>
      )}

      {(!shortDividendSummary || shortDividendSummary.entries.length === 0) && shortDivDeduction === 0 && invIntSources.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          No investment interest expense sources found. K-1 Box 13H, 1099-INT Box 5, and short
          dividends (from account Lots tab) will appear here when available.
        </p>
      )}

      {/* Standard vs. itemized comparison */}
      <FormBlock title="Standard Deduction vs. Itemized — Which Is Better?">
        <FormLine label={`Standard deduction (${selectedYear} ${isMarried ? 'MFJ' : 'Single'})`} value={standardDeduction} />
        <FormLine label="Itemized deductions (Schedule A total)" value={totalItemizedDeductions} />
        <FormLine label="Investment interest (Line 9)" value={totalInvIntExpense} />
        <FormLine
          label="SALT (Line 7)"
          {...(saltDeduction > 0 ? { value: saltDeduction } : { raw: '—' })}
        />
        <FormLine label="Other (mortgage, charitable, medical)" raw="Enter from records — not yet computed" />
        <FormTotalLine
          label={shouldItemize
            ? '✓ Itemizing saves more — use Schedule A'
            : `Standard deduction is larger by ${currency(standardDeduction - totalItemizedDeductions).format()}`}
          value={shouldItemize ? totalItemizedDeductions : standardDeduction}
          double
        />
        {!shouldItemize && (
          <FormLine
            label="Note"
            raw="Additional deductions (mortgage interest, charitable, property tax) may make itemizing beneficial. See SALT issue for planned support."
          />
        )}
      </FormBlock>

      {/* Investment interest drilldown modal */}
      <InvIntSourcesModal
        isOpen={showInvIntModal}
        onClose={() => setShowInvIntModal(false)}
        sources={invIntSources}
        total={totalInvIntExpense}
      />
    </div>
  )
}
