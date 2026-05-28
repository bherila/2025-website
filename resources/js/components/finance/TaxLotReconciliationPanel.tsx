'use client'

import currency from 'currency.js'
import { AlertTriangle, CheckCircle2, ChevronDown, Download, ExternalLink, FileSpreadsheet, FileWarning, Loader2, RefreshCw } from 'lucide-react'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import MissingAccountResolver from '@/components/finance/accounts/MissingAccountResolver'
import MatcherStatusBadge from '@/components/finance/reconcile/MatcherStatusBadge'
import { Callout, fmtAmt } from '@/components/finance/tax-preview-primitives'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { fetchWrapper } from '@/fetchWrapper'
import { downloadFinanceExport } from '@/lib/finance/downloadFinanceExport'
import { cn } from '@/lib/utils'
import {
  type LotReconciliationLink,
  type LotReconciliationLinksResponse,
  lotReconciliationLinksResponseSchema,
  type LotReconciliationLinkState,
  type ReconciliationHealth,
  type TaxYearReconciliationSummaryResponse,
  taxYearReconciliationSummaryResponseSchema,
} from '@/types/finance/document-lot-reconciliation'
import { FORM_TYPE_LABELS } from '@/types/finance/tax-document'

interface TaxLotReconciliationPanelProps {
  selectedYear: number
}

type BucketKey = 'mismatches' | 'broker_only' | 'account_only' | 'duplicates' | 'auto_matched' | 'unlinked'

const HEALTH_META: Record<ReconciliationHealth, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  ok: {
    label: 'OK',
    className: 'border-success/30 bg-success/10 text-success',
    icon: CheckCircle2,
  },
  drift: {
    label: 'Drift',
    className: 'border-warning/35 bg-warning/10 text-warning',
    icon: AlertTriangle,
  },
  blocked: {
    label: 'Blocked',
    className: 'border-destructive/30 bg-destructive/10 text-destructive',
    icon: FileWarning,
  },
}

const STATE_LABELS: Record<LotReconciliationLinkState, string> = {
  auto_matched: 'Auto matched',
  needs_review: 'Needs review',
  accepted_broker: 'Broker accepted',
  accepted_account_override: 'Account override',
  ignored_duplicate: 'Duplicate',
  unlinked: 'Unlinked',
  broker_only: 'Broker-only',
  account_only: 'Account-only',
}

const BUCKET_LABELS: Record<BucketKey, string> = {
  mismatches: 'Mismatches',
  broker_only: 'Broker-only',
  account_only: 'Account-only',
  duplicates: 'Duplicates',
  auto_matched: 'Auto matched',
  unlinked: 'Unlinked',
}

export default function TaxLotReconciliationPanel({ selectedYear }: TaxLotReconciliationPanelProps): ReactElement | null {
  const [summary, setSummary] = useState<TaxYearReconciliationSummaryResponse | null>(null)
  const [linksByDocument, setLinksByDocument] = useState<Record<number, LotReconciliationLinksResponse>>({})
  const [expandedDocumentId, setExpandedDocumentId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingDocumentId, setLoadingDocumentId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'txf' | 'olt' | null>(null)

  const loadSummary = useCallback(async (): Promise<void> => {
    setLoading(true)
    setLinksByDocument({})
    setExpandedDocumentId(null)
    try {
      const response = await fetchWrapper.get(`/api/finance/tax-years/${selectedYear}/reconciliation-summary`)
      setSummary(taxYearReconciliationSummaryResponseSchema.parse(response))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [selectedYear])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  const hasDocuments = (summary?.summary.document_count ?? 0) > 0
  const unresolvedLinks = summary?.unresolved_account_links ?? []

  const summaryItems = useMemo(() => {
    if (!summary) {
      return []
    }

    return [
      { label: 'Documents', value: summary.summary.document_count, tone: 'neutral' as const },
      { label: 'Blocked', value: summary.summary.documents_by_health.blocked, tone: summary.summary.documents_by_health.blocked > 0 ? 'bad' as const : 'neutral' as const },
      { label: 'Drift', value: summary.summary.documents_by_health.drift, tone: summary.summary.documents_by_health.drift > 0 ? 'warn' as const : 'neutral' as const },
      { label: 'OK', value: summary.summary.documents_by_health.ok, tone: 'ok' as const },
      { label: 'Unresolved accounts', value: summary.summary.unresolved_account_links, tone: summary.summary.unresolved_account_links > 0 ? 'bad' as const : 'ok' as const },
      { label: 'Needs review', value: summary.summary.link_state_counts.needs_review, tone: summary.summary.link_state_counts.needs_review > 0 ? 'warn' as const : 'ok' as const },
    ]
  }, [summary])

  async function loadDocumentBuckets(taxDocumentId: number): Promise<void> {
    if (linksByDocument[taxDocumentId]) {
      setExpandedDocumentId((current) => current === taxDocumentId ? null : taxDocumentId)
      return
    }

    setExpandedDocumentId(taxDocumentId)
    setLoadingDocumentId(taxDocumentId)
    try {
      const response = await fetchWrapper.get(`/api/finance/tax-documents/${taxDocumentId}/lot-reconciliation-links`)
      setLinksByDocument((current) => ({
        ...current,
        [taxDocumentId]: lotReconciliationLinksResponseSchema.parse(response),
      }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load document buckets')
    } finally {
      setLoadingDocumentId(null)
    }
  }

  async function handleResolvedAccount(): Promise<void> {
    setLinksByDocument({})
    await loadSummary()
  }

  async function exportAll(format: 'txf' | 'olt'): Promise<void> {
    setExporting(format)
    try {
      await downloadFinanceExport(
        format === 'txf' ? '/api/finance/lots/export-txf' : '/api/finance/lots/export-olt-xlsx',
        {
          source: 'database',
          scope: 'all',
          tax_year: selectedYear,
        },
        format === 'txf' ? `1099b-lots-all-${selectedYear}.txf` : `1099b-lots-all-${selectedYear}.xlsx`,
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export 1099-B lots')
    } finally {
      setExporting(null)
    }
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
        <Button className="mt-3 gap-1.5" variant="outline" size="sm" onClick={() => void loadSummary()}>
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </Callout>
    )
  }

  if (!summary) {
    return null
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">1099-B Lot Reconciliation</h2>
          <p className="text-xs text-muted-foreground">
            Review account mapping first, then open only the document buckets that need attention for {selectedYear}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" disabled={exporting !== null || !hasDocuments} onClick={() => void exportAll('txf')}>
            {exporting === 'txf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export TXF
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={exporting !== null || !hasDocuments} onClick={() => void exportAll('olt')}>
            {exporting === 'olt' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
            Export OLT XLSX
          </Button>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6" aria-label="Reconciliation summary">
        {summaryItems.map((item) => (
          <SummaryMetric key={item.label} label={item.label} value={item.value} tone={item.tone} />
        ))}
      </section>

      {unresolvedLinks.length > 0 && (
        <Callout kind="warn" title="Missing account links">
          <div className="space-y-2">
            {unresolvedLinks.map((link) => (
              <div key={link.id} className="flex flex-col gap-2 rounded-md border border-warning/25 bg-background/60 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-sm">
                  <div className="font-medium">
                    {link.source_filename ?? `Tax document ${link.tax_document_id}`} · {FORM_TYPE_LABELS[link.form_type ?? ''] ?? link.form_type ?? 'Form'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {link.ai_account_name ?? link.account_section_label ?? link.ai_identifier ?? 'Unresolved account section'}
                  </div>
                </div>
                <MissingAccountResolver
                  link={link}
                  taxDocumentId={link.tax_document_id}
                  triggerLabel="Resolve account"
                  onResolved={() => void handleResolvedAccount()}
                />
              </div>
            ))}
          </div>
        </Callout>
      )}

      {!hasDocuments ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          No 1099-B documents were found for {selectedYear}.
        </div>
      ) : (
        <section className="space-y-3" aria-label="Reconciliation documents">
          {summary.documents.map((document) => {
            const linksData = linksByDocument[document.tax_document_id] ?? null
            const isOpen = expandedDocumentId === document.tax_document_id
            const isLoadingDocument = loadingDocumentId === document.tax_document_id

            return (
              <div key={document.tax_document_id} className="rounded-md border border-border bg-card">
                <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-semibold">{document.broker ?? document.original_filename ?? `Document ${document.tax_document_id}`}</h3>
                      <HealthBadge health={document.health} />
                      <MatcherStatusBadge run={document.latest_match_run} lastMatchedAt={document.last_matched_at} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {document.original_filename ?? 'No filename'} · doc #{document.tax_document_id}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <BucketCount label="Missing" value={document.problem_bucket_counts.missing_accounts} />
                    <BucketCount label="Mismatch" value={document.problem_bucket_counts.mismatches} />
                    <BucketCount label="Broker-only" value={document.problem_bucket_counts.broker_only} />
                    <BucketCount label="Account-only" value={document.problem_bucket_counts.account_only} />
                    <Button variant="outline" size="sm" className="gap-1.5" disabled={isLoadingDocument} onClick={() => void loadDocumentBuckets(document.tax_document_id)}>
                      {isLoadingDocument ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-180')} />}
                      Buckets
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5" asChild>
                      <a href={`/finance/tax-documents/${document.tax_document_id}/lot-reconciliation`}>
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open
                      </a>
                    </Button>
                  </div>
                </div>
                {isOpen && (
                  <div className="border-t border-border p-3">
                    {linksData ? (
                      <ProblemBuckets linksData={linksData} />
                    ) : (
                      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading buckets...
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </section>
      )}
    </div>
  )
}

function SummaryMetric({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'warn' | 'bad' | 'neutral' }): ReactElement {
  return (
    <div className={cn(
      'rounded-md border px-3 py-2',
      tone === 'ok' && 'border-success/25 bg-success/5',
      tone === 'warn' && 'border-warning/30 bg-warning/10',
      tone === 'bad' && 'border-destructive/30 bg-destructive/10',
      tone === 'neutral' && 'border-border bg-muted/20',
    )}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function HealthBadge({ health }: { health: ReconciliationHealth }): ReactElement {
  const meta = HEALTH_META[health]
  const Icon = meta.icon

  return (
    <Badge variant="outline" className={cn(meta.className, 'gap-1.5')}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </Badge>
  )
}

function BucketCount({ label, value }: { label: string; value: number }): ReactElement {
  return (
    <Badge variant={value > 0 ? 'outline' : 'secondary'} className={value > 0 ? 'border-warning/35 bg-warning/10 text-warning' : ''}>
      {label}: {value}
    </Badge>
  )
}

function ProblemBuckets({ linksData }: { linksData: LotReconciliationLinksResponse }): ReactElement {
  const buckets = bucketLinks(linksData.links)

  return (
    <div className="space-y-3">
      {(Object.keys(BUCKET_LABELS) as BucketKey[]).map((bucketKey) => (
        <details key={bucketKey} className="rounded-md border border-border" open={bucketKey === 'mismatches' && buckets[bucketKey].length > 0}>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium">
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="flex-1">{BUCKET_LABELS[bucketKey]}</span>
            <Badge variant="outline">{buckets[bucketKey].length}</Badge>
          </summary>
          <div className="divide-y divide-border border-t border-border">
            {buckets[bucketKey].length === 0 ? (
              <div className="px-3 py-4 text-sm text-muted-foreground">No rows in this bucket.</div>
            ) : (
              buckets[bucketKey].slice(0, 25).map((link) => <ProblemRow key={link.id} link={link} />)
            )}
            {buckets[bucketKey].length > 25 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">Showing 25 of {buckets[bucketKey].length} rows.</div>
            )}
          </div>
        </details>
      ))}
    </div>
  )
}

function ProblemRow({ link }: { link: LotReconciliationLink }): ReactElement {
  const lot = link.broker_lot ?? link.account_lot
  const deltas = link.match_reason?.deltas
  const gainDelta = moneyDelta(link.account_lot?.realized_gain_loss, link.broker_lot?.realized_gain_loss)

  return (
    <div className="grid gap-2 px-3 py-3 text-sm md:grid-cols-[minmax(0,1fr)_160px_160px_160px] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{lot?.symbol ?? 'Unknown symbol'}</span>
          <Badge variant="outline">{STATE_LABELS[link.state]}</Badge>
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {lot?.description ?? 'No description'} · sold {lot?.sale_date ?? 'unknown'} · qty {lot?.quantity ?? 'N/A'}
        </div>
      </div>
      <Metric label="Proceeds delta" value={deltas?.proceeds ?? moneyDelta(link.account_lot?.proceeds, link.broker_lot?.proceeds)} />
      <Metric label="Basis delta" value={deltas?.basis ?? moneyDelta(link.account_lot?.cost_basis, link.broker_lot?.cost_basis)} />
      <Metric label="Gain delta" value={gainDelta} />
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number | null | undefined }): ReactElement {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-currency text-sm tabular-nums">{formatNullableMoney(value ?? null)}</div>
    </div>
  )
}

function bucketLinks(links: LotReconciliationLink[]): Record<BucketKey, LotReconciliationLink[]> {
  const buckets: Record<BucketKey, LotReconciliationLink[]> = {
    mismatches: [],
    broker_only: [],
    account_only: [],
    duplicates: [],
    auto_matched: [],
    unlinked: [],
  }

  for (const link of links) {
    if (link.state === 'unlinked') {
      buckets.unlinked.push(link)
    } else if (link.state === 'broker_only') {
      buckets.broker_only.push(link)
    } else if (link.state === 'account_only') {
      buckets.account_only.push(link)
    } else if (link.state === 'ignored_duplicate' || link.match_reason?.reason_code.includes('split')) {
      buckets.duplicates.push(link)
    } else if (link.state === 'needs_review') {
      buckets.mismatches.push(link)
    } else {
      buckets.auto_matched.push(link)
    }
  }

  return buckets
}

function formatNullableMoney(value: number | null): string {
  if (value === null) {
    return 'N/A'
  }

  const formatted = fmtAmt(Math.abs(value), 2)
  return value < 0 ? `(${formatted})` : formatted
}

function moneyDelta(accountValue: number | null | undefined, brokerValue: number | null | undefined): number | null {
  if (accountValue === null || accountValue === undefined || brokerValue === null || brokerValue === undefined) {
    return null
  }

  return currency(accountValue, { precision: 4 }).subtract(brokerValue).value
}
