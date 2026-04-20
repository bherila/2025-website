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
import { SALT_CATEGORIES } from '@/lib/tax/deductionCategories'
import { type FilingStatus, getStandardDeduction } from '@/lib/tax/standardDeductions'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'
import type { ScheduleALines, UserDeductionEntry } from '@/types/finance/tax-return'

import { ShortDividendSummaryCard } from './ShortDividendDetailModal'

export type { ScheduleALines } from '@/types/finance/tax-return'

interface InvIntSource {
  label: string
  /** Negative means expense (charge). Positive means income. */
  amount: number
}

const SALT_CAP = 10_000
const SALT_CATEGORIES_LIST: readonly string[] = Array.from(SALT_CATEGORIES)

/** Bucket user deductions by category in a single pass. */
function bucketUserDeductions(userDeductions: UserDeductionEntry[]): Record<string, number> {
  const buckets: Record<string, number> = {}
  for (const d of userDeductions) {
    buckets[d.category] = currency(buckets[d.category] ?? 0).add(d.amount).value
  }
  return buckets
}

export function computeScheduleALines({
  reviewedK1Docs = [],
  reviewed1099Docs = [],
  shortDividendSummary,
  saltPaid = 0,
  year = new Date().getFullYear(),
  isMarried = false,
  userDeductions = [],
}: {
  reviewedK1Docs?: TaxDocument[]
  reviewed1099Docs?: TaxDocument[]
  shortDividendSummary?: ShortDividendSummary
  /** W-2 Box 17 state tax withheld. User-entered SALT is added separately. */
  saltPaid?: number
  year?: number
  isMarried?: boolean
  userDeductions?: UserDeductionEntry[]
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

  const buckets = bucketUserDeductions(userDeductions)
  const userSalt = SALT_CATEGORIES_LIST.reduce(
    (acc, cat) => currency(acc).add(buckets[cat] ?? 0).value,
    0,
  )
  const mortgageInterest = buckets.mortgage_interest ?? 0
  const charitable = currency(buckets.charitable_cash ?? 0).add(buckets.charitable_noncash ?? 0).value
  const otherDeductions = buckets.other ?? 0

  const saltDeduction = Math.min(currency(saltPaid).add(userSalt).value, SALT_CAP)
  const totalItemizedDeductions = currency(totalInvIntExpense)
    .add(saltDeduction)
    .add(mortgageInterest)
    .add(charitable)
    .add(otherDeductions).value
  // MFJ/MFS sharing: isMarried collapses both into MFJ for now. MFS users should
  // treat the $10k SALT cap as $5k and expect different brackets; unsupported until
  // MFJ-vs-MFS is added to the marriage-status settings.
  const filingStatus: FilingStatus = isMarried ? 'Married Filing Jointly' : 'Single'
  const standardDeduction = getStandardDeduction(year, filingStatus)
  const shouldItemize = totalItemizedDeductions > standardDeduction

  return {
    invIntSources,
    totalInvIntExpense,
    saltPaid: currency(saltPaid).add(userSalt).value,
    saltDeduction,
    mortgageInterest,
    charitable,
    otherDeductions,
    userDeductions,
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
  userDeductions?: UserDeductionEntry[]
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
  userDeductions = [],
}: ScheduleAPreviewProps) {
  const [showInvIntModal, setShowInvIntModal] = useState(false)

  const shortDivDeduction = shortDividendSummary?.totalItemizedDeduction ?? 0
  const { invIntSources, totalInvIntExpense, saltPaid: totalSaltPaidBeforeCap, saltDeduction, mortgageInterest, charitable, otherDeductions, totalItemizedDeductions, standardDeduction, shouldItemize } = computeScheduleALines({
    reviewedK1Docs,
    reviewed1099Docs,
    ...(shortDividendSummary ? { shortDividendSummary } : {}),
    saltPaid,
    year: selectedYear,
    isMarried,
    userDeductions,
  })

  const buckets = bucketUserDeductions(userDeductions)
  const realEstateTax = buckets.real_estate_tax ?? 0
  const salesTax = buckets.sales_tax ?? 0
  const charitableCash = buckets.charitable_cash ?? 0
  const charitableNoncash = buckets.charitable_noncash ?? 0
  const stateIncomeTax = currency(saltPaid).add(buckets.state_est_tax ?? 0).value
  const totalInterest = currency(mortgageInterest).add(totalInvIntExpense).value

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
            label="Line 5a — State income tax withheld / estimated tax paid"
            {...(stateIncomeTax > 0 ? { value: stateIncomeTax } : { raw: '—' })}
          />
          <FormLine
            label="Line 5c — State/local general sales taxes"
            {...(salesTax > 0 ? { value: salesTax } : { raw: '—' })}
          />
          <FormLine
            label="Line 6 — Real estate taxes"
            {...(realEstateTax > 0 ? { value: realEstateTax } : { raw: '—' })}
          />
          <FormTotalLine
            label={`Line 7 — Total SALT (capped at $${SALT_CAP.toLocaleString()})`}
            value={saltDeduction}
          />
          {totalSaltPaidBeforeCap >= SALT_CAP && (
            <FormLine label="Note" raw={`SALT cap reached — state taxes above $${SALT_CAP.toLocaleString()} are not deductible`} />
          )}
        </FormBlock>

        {/* Part IV — Interest */}
        <FormBlock title="Part IV — Interest You Paid">
          <FormLine
            label="Line 8 — Home mortgage interest"
            {...(mortgageInterest > 0 ? { value: mortgageInterest } : { raw: '—' })}
          />
          <FormLine
            label="Line 9 — Investment interest expense (from Form 4952)"
            value={totalInvIntExpense > 0 ? totalInvIntExpense : null}
            {...(totalInvIntExpense === 0 ? { raw: '—' } : {})}
            {...(invIntSources.length > 0 ? { onClick: () => setShowInvIntModal(true) } : {})}
          />
          <FormTotalLine label="Line 10 — Total interest" value={totalInterest} />
        </FormBlock>

        {/* Part V — Gifts */}
        <FormBlock title="Part V — Gifts to Charity">
          <FormLine
            label="Line 11 — Cash contributions"
            {...(charitableCash > 0 ? { value: charitableCash } : { raw: '—' })}
          />
          <FormLine
            label="Line 12 — Non-cash contributions"
            {...(charitableNoncash > 0 ? { value: charitableNoncash } : { raw: '—' })}
          />
          <FormTotalLine label="Line 14 — Total gifts" value={charitable} />
        </FormBlock>

        <FormBlock title="Other Itemized Deductions">
          <FormLine
            label="Line 16 — Other itemized deductions"
            {...(otherDeductions > 0 ? { value: otherDeductions } : { raw: '—' })}
          />
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
        <FormLine label={`Standard deduction (${selectedYear} ${isMarried ? 'Married Filing Jointly' : 'Single'})`} value={standardDeduction} />
        <FormLine label="Itemized deductions (Schedule A total)" value={totalItemizedDeductions} />
        <FormLine label="Investment interest (Line 9)" value={totalInvIntExpense} />
        <FormLine
          label="SALT (Line 7)"
          {...(saltDeduction > 0 ? { value: saltDeduction } : { raw: '—' })}
        />
        {mortgageInterest > 0 && <FormLine label="Mortgage interest (Line 8)" value={mortgageInterest} />}
        {charitable > 0 && <FormLine label="Charitable contributions (Lines 11–12)" value={charitable} />}
        {otherDeductions > 0 && <FormLine label="Other deductions" value={otherDeductions} />}
        <FormLine label="Medical, casualty, other" raw="Enter below — not yet computed" />
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
            raw="Additional deductions may still make itemizing beneficial as entries change throughout the year."
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
