'use client'

import currency from 'currency.js'
import { AlertTriangle, CheckCircle2, FileWarning, Link2, Loader2, RefreshCw, Scale } from 'lucide-react'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Callout, fmtAmt } from '@/components/finance/tax-preview-primitives'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'
import { FORM_TYPE_LABELS } from '@/types/finance/tax-document'
import {
  type TaxLotReconciliationAccount,
  type TaxLotReconciliationLot,
  type TaxLotReconciliationResponse,
  taxLotReconciliationResponseSchema,
  type TaxLotReconciliationRow,
  type TaxLotReconciliationStatus,
} from '@/types/finance/tax-lot-reconciliation'

interface TaxLotReconciliationPanelProps {
  selectedYear: number
}

interface ApplyPayload {
  supersede?: Array<{ keep_lot_id: number; drop_lot_id: number }>
  accept?: number[]
  conflicts?: Array<{ lot_id: number; status: string; notes?: string | null }>
}

const STATUS_META: Record<TaxLotReconciliationStatus, { label: string; className: string }> = {
  matched: { label: 'Matched', className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300' },
  variance: { label: 'Variance', className: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300' },
  missing_account: { label: 'Missing Account', className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300' },
  missing_1099b: { label: 'Missing 1099-B', className: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300' },
  duplicate: { label: 'Duplicate', className: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300' },
}

const SUMMARY_ITEMS: Array<{ key: keyof TaxLotReconciliationResponse['summary']; label: string }> = [
  { key: 'matched', label: 'Matched' },
  { key: 'variance', label: 'Variances' },
  { key: 'missing_account', label: 'Missing Account' },
  { key: 'missing_1099b', label: 'Missing 1099-B' },
  { key: 'duplicates', label: 'Duplicates' },
  { key: 'unresolved_account_links', label: 'Unresolved Links' },
]

export default function TaxLotReconciliationPanel({ selectedYear }: TaxLotReconciliationPanelProps) {
  const [data, setData] = useState<TaxLotReconciliationResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [applyingAccountId, setApplyingAccountId] = useState<number | null>(null)

  const loadReconciliation = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetchWrapper.get(`/api/finance/lots/reconciliation?tax_year=${selectedYear}`)
      setData(taxLotReconciliationResponseSchema.parse(response))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [selectedYear])

  useEffect(() => {
    void loadReconciliation()
  }, [loadReconciliation])

  const hasRows = useMemo(() => data?.accounts.some(account => account.rows.length > 0) ?? false, [data])

  async function apply(accountId: number, payload: ApplyPayload, successMessage: string): Promise<void> {
    setApplyingAccountId(accountId)
    try {
      await fetchWrapper.post(`/api/finance/${accountId}/lots/reconciliation/apply`, payload)
      toast.success(successMessage)
      await loadReconciliation()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setApplyingAccountId(null)
    }
  }

  async function acceptExactMatches(account: TaxLotReconciliationAccount): Promise<void> {
    const supersede = account.rows
      .filter(row => row.status === 'matched')
      .flatMap(row => supersedeRows(row))

    if (supersede.length === 0) {
      toast.info('No unapplied exact matches for this account')
      return
    }

    await apply(account.account_id, { supersede }, 'Accepted exact matches')
  }

  async function preferReportedLot(account: TaxLotReconciliationAccount, row: TaxLotReconciliationRow): Promise<void> {
    const supersede = supersedeRows(row)
    if (supersede.length === 0) {
      return
    }

    await apply(account.account_id, { supersede }, 'Updated lot reconciliation')
  }

  async function acceptAccountLot(account: TaxLotReconciliationAccount, row: TaxLotReconciliationRow): Promise<void> {
    if (!row.account_lot) {
      return
    }

    await apply(account.account_id, { accept: [row.account_lot.lot_id] }, 'Accepted account-only lot')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading 1099-B reconciliation
      </div>
    )
  }

  if (error) {
    return (
      <Callout kind="warn" title="Unable to load reconciliation">
        <p>{error}</p>
        <Button className="mt-3 gap-1.5" variant="outline" size="sm" onClick={() => void loadReconciliation()}>
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </Callout>
    )
  }

  if (!data) {
    return null
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">1099-B Lot Reconciliation</h2>
        <p className="text-xs text-muted-foreground">
          Compares broker-reported 1099-B lots against account statement lots for {selectedYear}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {SUMMARY_ITEMS.map(item => (
          <div key={item.key} className="rounded-md border border-border bg-card px-3 py-2">
            <div className="text-[11px] font-medium uppercase text-muted-foreground">{item.label}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{data.summary[item.key]}</div>
          </div>
        ))}
      </div>

      {data.unresolved_account_links.length > 0 && (
        <Callout kind="warn" title="Unresolved consolidated 1099 account links">
          <div className="space-y-2">
            {data.unresolved_account_links.map(link => (
              <div key={link.id} className="flex items-start gap-2 text-sm">
                <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {link.filename ?? `Tax document ${link.tax_document_id}`} has an unresolved {FORM_TYPE_LABELS[link.form_type] ?? link.form_type}
                  {link.ai_account_name ? ` account (${link.ai_account_name})` : ' account'}.
                </span>
              </div>
            ))}
          </div>
        </Callout>
      )}

      {!hasRows ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          No 1099-B or account statement lots were found for {selectedYear}.
        </div>
      ) : (
        data.accounts.map(account => (
          <AccountReconciliationTable
            key={account.account_id}
            account={account}
            applying={applyingAccountId === account.account_id}
            onAcceptExact={() => void acceptExactMatches(account)}
            onUseReported={(row) => void preferReportedLot(account, row)}
            onAcceptAccountLot={(row) => void acceptAccountLot(account, row)}
          />
        ))
      )}
    </div>
  )
}

function AccountReconciliationTable({
  account,
  applying,
  onAcceptExact,
  onUseReported,
  onAcceptAccountLot,
}: {
  account: TaxLotReconciliationAccount
  applying: boolean
  onAcceptExact: () => void
  onUseReported: (row: TaxLotReconciliationRow) => void
  onAcceptAccountLot: (row: TaxLotReconciliationRow) => void
}) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{account.account_name}</h3>
          <p className="text-xs text-muted-foreground">{account.rows.length} reconciliation rows</p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={applying} onClick={onAcceptExact}>
          {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          Accept Matches
        </Button>
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>1099-B Lot</TableHead>
              <TableHead>Account Lot</TableHead>
              <TableHead className="text-right">Proceeds Δ</TableHead>
              <TableHead className="text-right">Basis Δ</TableHead>
              <TableHead className="text-right">Gain Δ</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {account.rows.map((row, index) => (
              <TableRow key={`${row.reported_lot?.lot_id ?? 'account'}-${row.account_lot?.lot_id ?? 'reported'}-${index}`}>
                <TableCell>
                  <StatusBadge status={row.status} />
                </TableCell>
                <TableCell>
                  <LotSummary lot={row.reported_lot} source="reported" />
                </TableCell>
                <TableCell>
                  <LotSummary lot={row.account_lot} source="account" duplicateCount={row.status === 'duplicate' ? row.candidate_lots.length : 0} />
                </TableCell>
                <TableCell className="text-right">{formatDelta(row.deltas.proceeds)}</TableCell>
                <TableCell className="text-right">{formatDelta(row.deltas.cost_basis)}</TableCell>
                <TableCell className="text-right">{formatDelta(row.deltas.realized_gain_loss)}</TableCell>
                <TableCell className="text-right">
                  <RowAction
                    row={row}
                    applying={applying}
                    onUseReported={onUseReported}
                    onAcceptAccountLot={onAcceptAccountLot}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

function StatusBadge({ status }: { status: TaxLotReconciliationStatus }) {
  const meta = STATUS_META[status]
  const icon = status === 'matched' ? <CheckCircle2 className="h-3 w-3" /> : status === 'variance' || status === 'duplicate' ? <AlertTriangle className="h-3 w-3" /> : <Scale className="h-3 w-3" />
  return (
    <Badge variant="outline" className={meta.className}>
      {icon}
      {meta.label}
    </Badge>
  )
}

function LotSummary({ lot, source, duplicateCount = 0 }: { lot: TaxLotReconciliationLot | null; source: 'reported' | 'account'; duplicateCount?: number }) {
  if (!lot) {
    return <span className="text-xs text-muted-foreground">{source === 'reported' ? 'No 1099-B lot' : 'No account lot'}</span>
  }

  const accepted = lot.reconciliation_status === 'accepted'

  return (
    <div className="min-w-0 space-y-0.5 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium text-foreground">{lot.symbol ?? 'Unknown'}</span>
        {accepted && (
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
            Accepted
          </Badge>
        )}
        {duplicateCount > 1 && <Badge variant="secondary">{duplicateCount} candidates</Badge>}
      </div>
      <div className="text-muted-foreground">
        {lot.quantity.toLocaleString()} shares · sold {lot.sale_date ?? 'unknown'}
      </div>
      <div className="text-muted-foreground">
        Proceeds {money(lot.proceeds)} · Basis {money(lot.cost_basis)}
      </div>
      {lot.tax_document_filename && <div className="truncate text-muted-foreground">{lot.tax_document_filename}</div>}
    </div>
  )
}

function RowAction({
  row,
  applying,
  onUseReported,
  onAcceptAccountLot,
}: {
  row: TaxLotReconciliationRow
  applying: boolean
  onUseReported: (row: TaxLotReconciliationRow) => void
  onAcceptAccountLot: (row: TaxLotReconciliationRow) => void
}) {
  const supersede = supersedeRows(row)
  const accepted = supersede.length > 0 && row.account_lot?.superseded_by_lot_id === row.reported_lot?.lot_id

  if (accepted) {
    return <span className="text-xs text-muted-foreground">Applied</span>
  }

  if (supersede.length > 0) {
    return (
      <Button size="sm" variant="outline" className="gap-1.5" disabled={applying} onClick={() => onUseReported(row)}>
        <Link2 className="h-3.5 w-3.5" />
        Use 1099-B
      </Button>
    )
  }

  if (row.status === 'missing_1099b' && row.account_lot) {
    return (
      <Button size="sm" variant="outline" disabled={applying} onClick={() => onAcceptAccountLot(row)}>
        Accept
      </Button>
    )
  }

  return <span className="text-xs text-muted-foreground">Review</span>
}

function supersedeRows(row: TaxLotReconciliationRow): Array<{ keep_lot_id: number; drop_lot_id: number }> {
  const reportedLot = row.reported_lot
  if (!reportedLot) {
    return []
  }

  const accountLots = row.status === 'duplicate' ? row.candidate_lots : row.account_lot ? [row.account_lot] : []

  return accountLots
    .filter(lot => lot.superseded_by_lot_id !== reportedLot.lot_id)
    .map(lot => ({ keep_lot_id: reportedLot.lot_id, drop_lot_id: lot.lot_id }))
}

function money(value: number | null): string {
  return value === null ? '-' : fmtAmt(value, 2)
}

function formatDelta(value: number | null): ReactElement {
  if (value === null) {
    return <span className="text-muted-foreground">-</span>
  }

  const normalized = currency(value).value
  const className = normalized === 0
    ? 'text-muted-foreground'
    : normalized > 0
      ? 'text-amber-700 dark:text-amber-300'
      : 'text-red-700 dark:text-red-300'

  return <span className={`font-mono tabular-nums ${className}`}>{fmtAmt(normalized, 2)}</span>
}
