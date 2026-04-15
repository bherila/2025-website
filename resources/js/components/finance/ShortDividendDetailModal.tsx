'use client'

import { useState } from 'react'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { ShortDividendEntry, ShortDividendSummary } from '@/lib/finance/shortDividendAnalysis'
import { SHORT_DIVIDEND_THRESHOLD_DAYS } from '@/lib/finance/shortDividendAnalysis'

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return dateStr
  }
}

interface ShortDividendDetailModalProps {
  isOpen: boolean
  onClose: () => void
  treatment: 'itemized_deduction' | 'cost_basis' | 'unknown'
  entries: ShortDividendEntry[]
  total: number
}

export function ShortDividendDetailModal({
  isOpen,
  onClose,
  treatment,
  entries,
  total,
}: ShortDividendDetailModalProps) {
  const title =
    treatment === 'itemized_deduction'
      ? `Short Dividends — Itemized Deduction (held > ${SHORT_DIVIDEND_THRESHOLD_DAYS} days)`
      : treatment === 'cost_basis'
        ? `Short Dividends — Add to Cost Basis (held ≤ ${SHORT_DIVIDEND_THRESHOLD_DAYS} days)`
        : 'Short Dividends — Unknown Holding Period'

  const explanation =
    treatment === 'itemized_deduction'
      ? `These dividends were charged on short positions held for more than ${SHORT_DIVIDEND_THRESHOLD_DAYS} days as of the ex-dividend date. They may be deductible as investment interest on Schedule A (subject to investment interest limitations).`
      : treatment === 'cost_basis'
        ? `These dividends were charged on short positions held for ${SHORT_DIVIDEND_THRESHOLD_DAYS} days or fewer as of the ex-dividend date. They should be added to the cost basis of the short position rather than deducted separately.`
        : 'The holding period for these positions could not be determined. Verify the short opening date manually.'

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">{explanation}</p>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Dividend Date</TableHead>
                <TableHead>Short Opened</TableHead>
                <TableHead className="text-right">Days Held</TableHead>
                <TableHead className="text-right">Amount Charged</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry, i) => (
                <TableRow key={entry.transaction.t_id ?? i}>
                  <TableCell className="font-mono font-medium">{entry.symbol || '—'}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{formatDate(entry.dividendDate)}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {entry.shortOpenDate ? formatDate(entry.shortOpenDate) : <span className="text-muted-foreground italic">unknown</span>}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {entry.daysHeld !== null ? entry.daysHeld : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-red-600 dark:text-red-400">
                    {formatCurrency(entry.amountCharged)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">
                    {entry.transaction.t_description ?? entry.transaction.t_comment ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold bg-muted/50">
                <TableCell colSpan={4} className="whitespace-nowrap">Total</TableCell>
                <TableCell className="text-right font-mono text-red-600 dark:text-red-400">
                  {formatCurrency(total)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-muted-foreground">
          Reference: IRS Publication 550 — Short Sales. Consult your tax advisor for specific guidance.
        </p>
      </DialogContent>
    </Dialog>
  )
}

interface ShortDividendSummaryCardProps {
  summary: ShortDividendSummary
}

/**
 * A reusable summary card showing short dividend totals by category.
 * Clicking each category row opens a detail modal with supporting transactions.
 */
export function ShortDividendSummaryCard({ summary }: ShortDividendSummaryCardProps) {
  const [openModal, setOpenModal] = useState<'itemized_deduction' | 'cost_basis' | 'unknown' | null>(null)

  if (summary.entries.length === 0) return null

  type RowEntry = { treatment: 'itemized_deduction' | 'cost_basis' | 'unknown'; label: string; entries: ShortDividendEntry[]; total: number; className: string }
  const allRows: RowEntry[] = [
    {
      treatment: 'itemized_deduction' as const,
      label: `Itemized Deduction (held > ${SHORT_DIVIDEND_THRESHOLD_DAYS} days)`,
      entries: summary.itemizedDeductionEntries,
      total: summary.totalItemizedDeduction,
      className: 'text-green-700 dark:text-green-400',
    },
    {
      treatment: 'cost_basis' as const,
      label: `Add to Cost Basis (held ≤ ${SHORT_DIVIDEND_THRESHOLD_DAYS} days)`,
      entries: summary.costBasisEntries,
      total: summary.totalCostBasis,
      className: 'text-orange-700 dark:text-orange-400',
    },
    {
      treatment: 'unknown' as const,
      label: 'Unknown Holding Period',
      entries: summary.unknownEntries,
      total: summary.totalUnknown,
      className: 'text-muted-foreground',
    },
  ]
  const rows = allRows.filter((r) => r.entries.length > 0)

  return (
    <>
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Count</TableHead>
              <TableHead className="text-right">Total Charged</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.treatment}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => setOpenModal(row.treatment)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpenModal(row.treatment) }}
              >
                <TableCell className="text-sm">{row.label}</TableCell>
                <TableCell className="text-right text-sm">{row.entries.length}</TableCell>
                <TableCell className={`text-right font-mono text-sm ${row.className}`}>
                  {row.total.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="font-semibold bg-muted/50">
              <TableCell>Total Short Dividends</TableCell>
              <TableCell className="text-right">{summary.entries.length}</TableCell>
              <TableCell className="text-right font-mono text-red-600 dark:text-red-400">
                {(summary.totalItemizedDeduction + summary.totalCostBasis + summary.totalUnknown).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {openModal && (
        <ShortDividendDetailModal
          isOpen={true}
          onClose={() => setOpenModal(null)}
          treatment={openModal}
          entries={rows.find((r) => r.treatment === openModal)?.entries ?? []}
          total={rows.find((r) => r.treatment === openModal)?.total ?? 0}
        />
      )}
    </>
  )
}
