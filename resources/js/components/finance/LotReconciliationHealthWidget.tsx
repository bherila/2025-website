'use client'

import currency from 'currency.js'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { fetchWrapper } from '@/fetchWrapper'
import { cn } from '@/lib/utils'
import {
  type LotReconciliationDashboardStatus,
  type TaxYearLotReconciliationResponse,
  taxYearLotReconciliationResponseSchema,
} from '@/types/finance/document-lot-reconciliation'

interface LotReconciliationHealthWidgetProps {
  selectedYear: number
}

const STATUS_META: Record<LotReconciliationDashboardStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  in_sync: {
    label: 'In sync',
    className: 'border-success/30 bg-success/10 text-success',
    icon: CheckCircle2,
  },
  needs_review: {
    label: 'Needs review',
    className: 'border-warning/35 bg-warning/10 text-warning',
    icon: AlertTriangle,
  },
  drift: {
    label: 'Drift',
    className: 'border-destructive/30 bg-destructive/10 text-destructive',
    icon: ShieldAlert,
  },
}

export default function LotReconciliationHealthWidget({ selectedYear }: LotReconciliationHealthWidgetProps): React.ReactElement {
  const [data, setData] = useState<TaxYearLotReconciliationResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rerunning, setRerunning] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetchWrapper.get(`/api/finance/tax-years/${selectedYear}/lot-reconciliation`)
      setData(taxYearLotReconciliationResponseSchema.parse(response))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [selectedYear])

  useEffect(() => {
    void load()
  }, [load])

  async function rerunAll(): Promise<void> {
    setRerunning(true)
    try {
      await fetchWrapper.post(`/api/finance/tax-years/${selectedYear}/lots-match`, {})
      toast.success('Lot matcher re-ran for reviewed 1099-B documents.')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setRerunning(false)
    }
  }

  return (
    <section className="rounded-md border border-border bg-card" data-testid="recon-health-widget">
      <header className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Lot reconciliation health - Tax year {selectedYear}</h2>
          {data && (
            <p className="mt-1 text-xs text-muted-foreground">
              {data.summary.documents_by_status.in_sync} of {data.summary.document_count} documents in sync
            </p>
          )}
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={loading || rerunning} onClick={() => void rerunAll()}>
          {rerunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Re-run all
        </Button>
      </header>

      {loading && (
        <div className="space-y-2 p-4">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-10 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="m-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <div className="flex items-center justify-between gap-3">
            <span>{error}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>Retry</Button>
          </div>
        </div>
      )}

      {!loading && !error && data && data.documents.length === 0 && (
        <div className="px-4 py-8 text-sm text-muted-foreground">No 1099-B documents for this tax year.</div>
      )}

      {!loading && !error && data && data.documents.length > 0 && (
        <div className="divide-y divide-border">
          {data.documents.map((document) => (
            <a
              key={document.tax_document_id}
              href={`/finance/tax-documents/${document.tax_document_id}/lot-reconciliation`}
              className="grid gap-2 px-4 py-3 text-sm transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:grid-cols-[minmax(0,1fr)_auto_auto]"
              data-dashboard-status={document.dashboard_status}
              data-testid={`recon-health-row-${document.tax_document_id}`}
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">{document.broker ?? `Tax document #${document.tax_document_id}`}</div>
                <div className="truncate text-xs text-muted-foreground">
                  1099-B - doc #{document.tax_document_id} - {formatLastMatchedAt(document.last_matched_at)}
                </div>
              </div>
              <StatusBadge status={document.dashboard_status} />
              <span className="text-xs text-muted-foreground md:text-right">
                {documentSummary(document)}
              </span>
            </a>
          ))}
        </div>
      )}
    </section>
  )
}

function StatusBadge({ status }: { status: LotReconciliationDashboardStatus }): React.ReactElement {
  const meta = STATUS_META[status]
  const Icon = meta.icon
  return (
    <Badge variant="outline" className={cn('justify-self-start gap-1.5', meta.className)} data-testid="recon-health-status-badge">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {meta.label}
    </Badge>
  )
}

function documentSummary(document: TaxYearLotReconciliationResponse['documents'][number]): string {
  const counts = document.link_state_counts
  if (document.dashboard_status === 'drift') {
    return `drift - max delta ${formatMoney(document.summary.max_delta)}`
  }

  const pending = counts.needs_review + counts.broker_only + counts.account_only + counts.unlinked
  if (pending > 0) {
    return `${pending} needs review - ${counts.broker_only} broker-only`
  }

  return `${counts.auto_matched} auto-matched`
}

function formatMoney(value: number): string {
  const formatted = currency(Math.abs(value), { precision: 2 }).format()
  return value < 0 ? `(${formatted})` : formatted
}

function formatLastMatchedAt(value: string | null): string {
  if (!value) {
    return 'matcher not run'
  }

  return `matched ${new Date(value).toLocaleString(undefined, { timeZoneName: 'short' })}`
}
