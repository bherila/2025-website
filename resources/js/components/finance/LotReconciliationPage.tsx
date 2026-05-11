'use client'

import currency from 'currency.js'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  FileSearch,
  Link2,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Trash2,
  Unlink,
  Wand2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { fetchWrapper } from '@/fetchWrapper'
import { cn } from '@/lib/utils'
import {
  type LotReconciliationLink,
  type LotReconciliationLinksResponse,
  lotReconciliationLinksResponseSchema,
  type LotReconciliationLinkState,
  type LotReconciliationLot,
  type TaxDocumentReconciliationReport,
  taxDocumentReconciliationReportSchema,
} from '@/types/finance/document-lot-reconciliation'

type LinkAction = 'accept-broker' | 'accept-account-override' | 'mark-duplicate' | 'unlink'
type DocumentAction = 'rerun' | 'force-rerun' | 'rebuild' | 'reprocess'

interface LotReconciliationPageProps {
  taxDocumentId: number
}

interface ConfirmationState {
  action: DocumentAction
  title: string
  body: string
  confirmLabel: string
  variant?: 'default' | 'destructive'
}

interface RelinkState {
  link: LotReconciliationLink
  selectedLotId: string
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

const STATE_BADGE_CLASSES: Record<LotReconciliationLinkState, string> = {
  auto_matched: 'border-success/30 bg-success/10 text-success',
  needs_review: 'border-warning/35 bg-warning/10 text-warning',
  accepted_broker: 'border-info/30 bg-info/10 text-info',
  accepted_account_override: 'border-primary/30 bg-primary/10 text-primary',
  ignored_duplicate: 'border-muted-foreground/25 bg-muted text-muted-foreground',
  unlinked: 'border-destructive/25 bg-destructive/10 text-destructive',
  broker_only: 'border-warning/35 bg-warning/10 text-warning',
  account_only: 'border-warning/35 bg-warning/10 text-warning',
}

const LINK_ACTION_META: Record<LinkAction, { label: string; optimisticState: LotReconciliationLinkState; endpoint: (id: number) => string }> = {
  'accept-broker': {
    label: 'Accept broker',
    optimisticState: 'accepted_broker',
    endpoint: (id) => `/api/finance/lot-reconciliation-links/${id}/accept-broker`,
  },
  'accept-account-override': {
    label: 'Accept account override',
    optimisticState: 'accepted_account_override',
    endpoint: (id) => `/api/finance/lot-reconciliation-links/${id}/accept-account-override`,
  },
  'mark-duplicate': {
    label: 'Mark duplicate',
    optimisticState: 'ignored_duplicate',
    endpoint: (id) => `/api/finance/lot-reconciliation-links/${id}/mark-duplicate`,
  },
  unlink: {
    label: 'Unlink',
    optimisticState: 'unlinked',
    endpoint: (id) => `/api/finance/lot-reconciliation-links/${id}/unlink`,
  },
}

export default function LotReconciliationPage({ taxDocumentId }: LotReconciliationPageProps): React.ReactElement {
  const [report, setReport] = useState<TaxDocumentReconciliationReport | null>(null)
  const [linksData, setLinksData] = useState<LotReconciliationLinksResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null)
  const [relink, setRelink] = useState<RelinkState | null>(null)
  const [busyLabel, setBusyLabel] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [reportResponse, linksResponse] = await Promise.all([
        fetchWrapper.get(`/api/finance/tax-documents/${taxDocumentId}/lot-reconciliation`),
        fetchWrapper.get(`/api/finance/tax-documents/${taxDocumentId}/lot-reconciliation-links`),
      ])
      setReport(taxDocumentReconciliationReportSchema.parse(reportResponse))
      setLinksData(lotReconciliationLinksResponseSchema.parse(linksResponse))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [taxDocumentId])

  useEffect(() => {
    void load()
  }, [load])

  const buckets = useMemo(() => bucketLinks(linksData?.links ?? []), [linksData])

  async function runLinkAction(link: LotReconciliationLink, action: LinkAction): Promise<void> {
    const meta = LINK_ACTION_META[action]
    const previous = linksData
    setLinksData((current) => updateLinkState(current, link.id, meta.optimisticState))
    try {
      await fetchWrapper.post(meta.endpoint(link.id), {})
      toast.success(`${meta.label} saved.`)
      await load()
    } catch (err) {
      setLinksData(previous)
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function submitRelink(): Promise<void> {
    if (!relink) {
      return
    }
    const accountLotId = Number(relink.selectedLotId)
    if (!Number.isInteger(accountLotId) || accountLotId <= 0 || relink.link.broker_lot_id === null) {
      toast.error('Choose an account lot to relink.')
      return
    }
    const previous = linksData
    setLinksData((current) => updateLinkState(current, relink.link.id, 'auto_matched'))
    setBusyLabel('Relinking lot')
    try {
      await fetchWrapper.post('/api/finance/lot-reconciliation-links/relink', {
        broker_lot_id: relink.link.broker_lot_id,
        account_lot_id: accountLotId,
      })
      toast.success('Lot relinked.')
      setRelink(null)
      await load()
    } catch (err) {
      setLinksData(previous)
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyLabel(null)
    }
  }

  async function runDocumentAction(action: DocumentAction): Promise<void> {
    const actionMap: Record<DocumentAction, { label: string; endpoint: string; body: object }> = {
      rerun: {
        label: 'Re-running matcher',
        endpoint: `/api/finance/tax-documents/${taxDocumentId}/lots-match`,
        body: { preserve_decisions: true },
      },
      'force-rerun': {
        label: 'Force re-matching',
        endpoint: `/api/finance/tax-documents/${taxDocumentId}/lots-match/full-rebuild`,
        body: { confirm: true },
      },
      rebuild: {
        label: 'Rebuilding lots',
        endpoint: `/api/finance/tax-documents/${taxDocumentId}/lots-rebuild`,
        body: {},
      },
      reprocess: {
        label: 'Re-extracting PDF',
        endpoint: `/api/finance/tax-documents/${taxDocumentId}/reprocess`,
        body: {},
      },
    }
    const meta = actionMap[action]
    setBusyLabel(meta.label)
    try {
      await fetchWrapper.post(meta.endpoint, meta.body)
      toast.success(`${meta.label} complete.`)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyLabel(null)
      setConfirmation(null)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading reconciliation...
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="h-4 w-4" />
            Unable to load lot reconciliation
          </div>
          <p className="mt-2">{error}</p>
          <Button className="mt-3 gap-1.5" variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  if (!report || !linksData) {
    return <></>
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6">
      <a href="#lot-reconciliation-content" className="sr-only focus:not-sr-only focus:rounded-md focus:bg-background focus:px-3 focus:py-2">
        Skip to reconciliation rows
      </a>
      <header className="space-y-4 border-b border-border pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-foreground">
              1099-B reconciliation - {linksData.document.broker ?? 'Broker document'} | Tax year {linksData.document.tax_year} | doc #{linksData.document.id}
            </h1>
            <p className="text-sm text-muted-foreground">{linksData.document.original_filename}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" disabled={busyLabel !== null} onClick={() => setConfirmation(confirmations.rerun)}>
              <RefreshCw className="h-3.5 w-3.5" />
              Re-run matcher
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" disabled={busyLabel !== null} onClick={() => setConfirmation(confirmations.rebuild)}>
              <RotateCcw className="h-3.5 w-3.5" />
              Rebuild lots
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" disabled={busyLabel !== null} onClick={() => setConfirmation(confirmations.reprocess)}>
              <FileSearch className="h-3.5 w-3.5" />
              Re-extract PDF
            </Button>
          </div>
        </div>
        <PriorityChain />
      </header>

      {busyLabel && (
        <div className="flex items-center gap-2 rounded-md border border-info/30 bg-info/10 px-3 py-2 text-sm text-info">
          <Loader2 className="h-4 w-4 animate-spin" />
          {busyLabel}...
        </div>
      )}

      <StatusSummary counts={linksData.summary.link_state_counts} diagnosticsCount={report.summary.diagnostics_count} maxDelta={report.summary.max_delta} />

      <main id="lot-reconciliation-content" className="space-y-3">
        <ReconciliationBucket title="Mismatched proceeds / basis / wash / gain" rows={buckets.mismatched} defaultOpen>
          {buckets.mismatched.map((link) => (
            <ReconciliationLotRow
              key={link.id}
              link={link}
              candidates={linksData.relink_candidates}
              onAction={(action) => void runLinkAction(link, action)}
              onRelink={(selectedLotId) => setRelink({ link, selectedLotId })}
            />
          ))}
        </ReconciliationBucket>
        <ReconciliationBucket title="Auto matched" rows={buckets.matched}>
          {buckets.matched.map((link) => (
            <ReconciliationLotRow key={link.id} link={link} candidates={linksData.relink_candidates} onAction={(action) => void runLinkAction(link, action)} onRelink={(selectedLotId) => setRelink({ link, selectedLotId })} />
          ))}
        </ReconciliationBucket>
        <ReconciliationBucket title="Broker-only lots" rows={buckets.brokerOnly}>
          {buckets.brokerOnly.map((link) => (
            <ReconciliationLotRow key={link.id} link={link} candidates={linksData.relink_candidates} onAction={(action) => void runLinkAction(link, action)} onRelink={(selectedLotId) => setRelink({ link, selectedLotId })} />
          ))}
        </ReconciliationBucket>
        <ReconciliationBucket title="Account-only lots" rows={buckets.accountOnly}>
          {buckets.accountOnly.map((link) => (
            <ReconciliationLotRow key={link.id} link={link} candidates={linksData.relink_candidates} onAction={(action) => void runLinkAction(link, action)} onRelink={(selectedLotId) => setRelink({ link, selectedLotId })} />
          ))}
        </ReconciliationBucket>
        <ReconciliationBucket title="Duplicates / splits" rows={buckets.duplicates}>
          {buckets.duplicates.map((link) => (
            <ReconciliationLotRow key={link.id} link={link} candidates={linksData.relink_candidates} onAction={(action) => void runLinkAction(link, action)} onRelink={(selectedLotId) => setRelink({ link, selectedLotId })} />
          ))}
        </ReconciliationBucket>
        <ReconciliationBucket title="Unlinked" rows={buckets.unlinked}>
          {buckets.unlinked.map((link) => (
            <ReconciliationLotRow key={link.id} link={link} candidates={linksData.relink_candidates} onAction={(action) => void runLinkAction(link, action)} onRelink={(selectedLotId) => setRelink({ link, selectedLotId })} />
          ))}
        </ReconciliationBucket>
      </main>

      <ConfirmationDialog
        confirmation={confirmation}
        busy={busyLabel !== null}
        onClose={() => setConfirmation(null)}
        onConfirm={(action) => void runDocumentAction(action)}
      />
      <RelinkDialog
        relink={relink}
        candidates={linksData.relink_candidates}
        busy={busyLabel !== null}
        onChange={(selectedLotId) => setRelink((current) => current ? { ...current, selectedLotId } : current)}
        onClose={() => setRelink(null)}
        onSubmit={() => void submitRelink()}
      />
    </div>
  )
}

interface StatusSummaryProps {
  counts: LotReconciliationLinksResponse['summary']['link_state_counts']
  diagnosticsCount: number
  maxDelta: number
}

function StatusSummary({ counts, diagnosticsCount, maxDelta }: StatusSummaryProps): React.ReactElement {
  return (
    <section className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6" aria-label="Reconciliation status summary">
      <SummaryPill label="Needs review" value={counts.needs_review} tone={counts.needs_review > 0 ? 'warn' : 'ok'} />
      <SummaryPill label="Auto matched" value={counts.auto_matched} tone="ok" />
      <SummaryPill label="Broker-only" value={counts.broker_only} tone={counts.broker_only > 0 ? 'warn' : 'neutral'} />
      <SummaryPill label="Account-only" value={counts.account_only} tone={counts.account_only > 0 ? 'warn' : 'neutral'} />
      <SummaryPill label="Duplicates" value={counts.ignored_duplicate} tone="neutral" />
      <SummaryPill
        label="Diagnostics"
        value={diagnosticsCount}
        tone={diagnosticsCount > 0 ? 'warn' : 'ok'}
        {...(maxDelta > 0 ? { suffix: `max ${formatMoney(maxDelta)}` } : {})}
      />
    </section>
  )
}

function SummaryPill({ label, value, tone, suffix }: { label: string; value: number; tone: 'ok' | 'warn' | 'neutral'; suffix?: string }): React.ReactElement {
  return (
    <div className={cn(
      'rounded-md border px-3 py-2',
      tone === 'ok' && 'border-success/25 bg-success/5',
      tone === 'warn' && 'border-warning/30 bg-warning/10',
      tone === 'neutral' && 'border-border bg-muted/20',
    )}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-lg font-semibold tabular-nums">{value}</span>
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  )
}

function PriorityChain(): React.ReactElement {
  const steps = ['Imported 1099-B', 'Normalized reported lots', 'Accepted overrides', 'Schedule D']
  return (
    <ol className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-3 text-xs sm:flex-row sm:items-center">
      {steps.map((step, index) => (
        <li key={step} className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-[11px] font-semibold text-primary">
            {index + 1}
          </span>
          <span className="font-medium text-foreground">{step}</span>
          {index < steps.length - 1 && <ChevronDown className="h-3.5 w-3.5 text-muted-foreground sm:-rotate-90" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  )
}

interface ReconciliationBucketProps {
  title: string
  rows: LotReconciliationLink[]
  children: React.ReactNode
  defaultOpen?: boolean
}

function ReconciliationBucket({ title, rows, children, defaultOpen = false }: ReconciliationBucketProps): React.ReactElement {
  return (
    <details className="group rounded-md border border-border bg-card" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
        <span className="flex-1">{title}</span>
        <Badge variant="outline">{rows.length}</Badge>
      </summary>
      <div className="border-t border-border">
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-sm text-muted-foreground">No rows in this bucket.</div>
        ) : (
          <div className="divide-y divide-border">{children}</div>
        )}
      </div>
    </details>
  )
}

interface ReconciliationLotRowProps {
  link: LotReconciliationLink
  candidates: LotReconciliationLot[]
  onAction: (action: LinkAction) => void
  onRelink: (selectedLotId: string) => void
}

export function ReconciliationLotRow({ link, candidates, onAction, onRelink }: ReconciliationLotRowProps): React.ReactElement {
  const brokerLot = link.broker_lot
  const accountLot = link.account_lot
  const titleLot = brokerLot ?? accountLot
  const symbol = titleLot?.symbol ?? 'Unknown symbol'
  const saleDate = titleLot?.sale_date ?? 'No sale date'
  const quantity = titleLot?.quantity ?? null
  const gainDelta = moneyDelta(accountLot?.realized_gain_loss, brokerLot?.realized_gain_loss)
  const candidateCount = candidatesForLink(link, candidates).length

  return (
    <article className="space-y-3 px-3 py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">
              {symbol} | {saleDate} | qty {quantity ?? 'N/A'}
            </h3>
            <StatusBadge state={link.state} />
            <ValueBadge label="Form 8949 box" value={form8949Box(link)} />
            <ValueBadge label="Wash sale treatment" value={washTreatment(link)} />
          </div>
          <p className="text-xs text-muted-foreground">
            {link.match_reason?.reason_code ?? 'manual'} | score {link.match_reason ? Math.round(link.match_reason.score * 100) : 0}%
          </p>
        </div>
        <LotActionMenu
          link={link}
          relinkCandidateCount={candidateCount}
          onAction={onAction}
          onRelink={() => onRelink(defaultCandidateId(link, candidates))}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_1fr_220px]">
        <LotSide title="Broker" lot={brokerLot} />
        <LotSide title="Account" lot={accountLot} />
        <div className="rounded-md border border-border bg-muted/20 p-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Schedule D impact</div>
          <div className={cn('mt-2 font-currency text-lg font-semibold tabular-nums', gainDelta !== null && gainDelta < 0 ? 'text-destructive' : 'text-success')}>
            {gainDelta === null ? 'N/A' : formatMoney(gainDelta)}
          </div>
          <dl className="mt-3 space-y-1 text-xs">
            <DeltaLine label="Proceeds" value={link.match_reason?.deltas.proceeds ?? moneyDelta(accountLot?.proceeds, brokerLot?.proceeds)} />
            <DeltaLine label="Basis" value={link.match_reason?.deltas.basis ?? moneyDelta(accountLot?.cost_basis, brokerLot?.cost_basis)} />
            <DeltaLine label="Wash" value={link.match_reason?.deltas.wash ?? moneyDelta(accountLot?.wash_sale_disallowed, brokerLot?.wash_sale_disallowed)} />
          </dl>
        </div>
      </div>
    </article>
  )
}

function LotSide({ title, lot }: { title: string; lot: LotReconciliationLot | null }): React.ReactElement {
  if (!lot) {
    return (
      <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
        No {title.toLowerCase()} lot linked.
      </div>
    )
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
          <div className="mt-1 text-sm font-medium">{lot.description ?? lot.symbol ?? `Lot #${lot.lot_id}`}</div>
          <div className="text-xs text-muted-foreground">{lot.account_name ?? `Account #${lot.acct_id}`}</div>
        </div>
        <Badge variant="outline">#{lot.lot_id}</Badge>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <AmountMetric label="Proceeds" value={lot.proceeds} />
        <AmountMetric label="Basis" value={lot.cost_basis} />
        <AmountMetric label="Wash" value={lot.wash_sale_disallowed} />
        <AmountMetric label="Form 8949 gain" value={lot.realized_gain_loss} />
      </dl>
    </div>
  )
}

function AmountMetric({ label, value }: { label: string; value: number | null }): React.ReactElement {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-currency font-medium tabular-nums">{formatNullableMoney(value)}</dd>
    </div>
  )
}

function DeltaLine({ label, value }: { label: string; value: number | null }): React.ReactElement {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-currency tabular-nums">{formatNullableMoney(value)}</dd>
    </div>
  )
}

function StatusBadge({ state }: { state: LotReconciliationLinkState }): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={STATE_BADGE_CLASSES[state]}>
          {STATE_LABELS[state]}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Current link state: {state}</TooltipContent>
    </Tooltip>
  )
}

function ValueBadge({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="border-info/25 bg-info/5 text-info">
          {value}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{label}: {value}</TooltipContent>
    </Tooltip>
  )
}

interface LotActionMenuProps {
  link: LotReconciliationLink
  relinkCandidateCount: number
  onAction: (action: LinkAction) => void
  onRelink: () => void
}

export function LotActionMenu({ link, relinkCandidateCount, onAction, onRelink }: LotActionMenuProps): React.ReactElement {
  const hasBothLots = link.broker_lot_id !== null && link.account_lot_id !== null
  const canMarkDuplicate = link.state === 'broker_only' || link.state === 'account_only'
  const canRelink = link.broker_lot_id !== null && relinkCandidateCount > 0

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="icon-sm" variant="outline" aria-label="Lot actions">
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={!hasBothLots} onClick={() => onAction('accept-broker')}>
          <CheckCircle2 className="h-4 w-4" />
          Accept broker
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!hasBothLots} onClick={() => onAction('accept-account-override')}>
          <Wand2 className="h-4 w-4" />
          Accept account override
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canMarkDuplicate} onClick={() => onAction('mark-duplicate')}>
          <Trash2 className="h-4 w-4" />
          Mark duplicate
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canRelink} onClick={onRelink}>
          <Link2 className="h-4 w-4" />
          Relink
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" disabled={link.state === 'unlinked'} onClick={() => onAction('unlink')}>
          <Unlink className="h-4 w-4" />
          Unlink
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ConfirmationDialog({ confirmation, busy, onClose, onConfirm }: { confirmation: ConfirmationState | null; busy: boolean; onClose: () => void; onConfirm: (action: DocumentAction) => void }): React.ReactElement {
  return (
    <Dialog open={confirmation !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{confirmation?.title}</DialogTitle>
          <DialogDescription>{confirmation?.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          {confirmation?.action === 'rerun' && (
            <Button variant="outline" disabled={busy} onClick={() => onConfirm('force-rerun')}>
              Force re-match
            </Button>
          )}
          <Button
            variant={confirmation?.variant === 'destructive' ? 'destructive' : 'default'}
            disabled={busy || !confirmation}
            onClick={() => confirmation && onConfirm(confirmation.action)}
          >
            {confirmation?.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RelinkDialog({ relink, candidates, busy, onChange, onClose, onSubmit }: { relink: RelinkState | null; candidates: LotReconciliationLot[]; busy: boolean; onChange: (selectedLotId: string) => void; onClose: () => void; onSubmit: () => void }): React.ReactElement {
  const availableCandidates = relink ? candidatesForLink(relink.link, candidates) : []
  return (
    <Dialog open={relink !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Relink account lot</DialogTitle>
          <DialogDescription>Choose the account-derived lot that should pair with this broker-reported lot.</DialogDescription>
        </DialogHeader>
        <select
          aria-label="Account lot"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={relink?.selectedLotId ?? ''}
          onChange={(event) => onChange(event.target.value)}
        >
          {availableCandidates.map((candidate) => (
            <option key={candidate.lot_id} value={candidate.lot_id}>
              {candidate.symbol ?? 'Lot'} | {candidate.sale_date ?? 'No date'} | {formatNullableMoney(candidate.realized_gain_loss)}
            </option>
          ))}
        </select>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={onSubmit} disabled={busy || availableCandidates.length === 0}>Relink</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const confirmations: Record<'rerun' | 'rebuild' | 'reprocess', ConfirmationState> = {
  rerun: {
    action: 'rerun',
    title: 'Re-run matcher?',
    body: 'This preserves accepted decisions and recalculates mutable link rows from the current lots.',
    confirmLabel: 'Re-run matcher',
  },
  rebuild: {
    action: 'rebuild',
    title: 'Rebuild lots from stored data?',
    body: 'This rewrites broker-reported lots from the reviewed document data, then refreshes reconciliation.',
    confirmLabel: 'Rebuild lots',
  },
  reprocess: {
    action: 'reprocess',
    title: 'Re-extract this PDF?',
    body: 'This sends the document back through extraction and may replace parsed data after processing completes.',
    confirmLabel: 'Re-extract',
    variant: 'destructive',
  },
}

function bucketLinks(links: LotReconciliationLink[]): {
  mismatched: LotReconciliationLink[]
  matched: LotReconciliationLink[]
  brokerOnly: LotReconciliationLink[]
  accountOnly: LotReconciliationLink[]
  duplicates: LotReconciliationLink[]
  unlinked: LotReconciliationLink[]
} {
  const buckets = {
    mismatched: [] as LotReconciliationLink[],
    matched: [] as LotReconciliationLink[],
    brokerOnly: [] as LotReconciliationLink[],
    accountOnly: [] as LotReconciliationLink[],
    duplicates: [] as LotReconciliationLink[],
    unlinked: [] as LotReconciliationLink[],
  }

  for (const link of links) {
    if (link.state === 'unlinked') {
      buckets.unlinked.push(link)
    } else if (link.state === 'broker_only') {
      buckets.brokerOnly.push(link)
    } else if (link.state === 'account_only') {
      buckets.accountOnly.push(link)
    } else if (link.state === 'ignored_duplicate' || isSplitLink(link)) {
      buckets.duplicates.push(link)
    } else if (link.state === 'needs_review' && hasMeaningfulDelta(link)) {
      buckets.mismatched.push(link)
    } else {
      buckets.matched.push(link)
    }
  }

  return buckets
}

function isSplitLink(link: LotReconciliationLink): boolean {
  return link.match_reason?.reason_code.includes('split') ?? false
}

function hasMeaningfulDelta(link: LotReconciliationLink): boolean {
  const deltas = link.match_reason?.deltas
  if (!deltas) {
    return false
  }

  return [deltas.proceeds, deltas.basis, deltas.wash].some((value) => Math.abs(value ?? 0) > 0.02)
    || Math.abs(deltas.qty ?? 0) > 0.000001
}

function updateLinkState(data: LotReconciliationLinksResponse | null, linkId: number, state: LotReconciliationLinkState): LotReconciliationLinksResponse | null {
  if (!data) {
    return data
  }

  return {
    ...data,
    links: data.links.map((link) => link.id === linkId ? { ...link, state } : link),
    summary: {
      ...data.summary,
      link_state_counts: countStates(data.links.map((link) => link.id === linkId ? { ...link, state } : link)),
    },
  }
}

function countStates(links: LotReconciliationLink[]): LotReconciliationLinksResponse['summary']['link_state_counts'] {
  const counts = {
    auto_matched: 0,
    needs_review: 0,
    accepted_broker: 0,
    accepted_account_override: 0,
    ignored_duplicate: 0,
    unlinked: 0,
    broker_only: 0,
    account_only: 0,
  }
  for (const link of links) {
    counts[link.state] += 1
  }
  return counts
}

function defaultCandidateId(link: LotReconciliationLink, candidates: LotReconciliationLot[]): string {
  const candidate = candidatesForLink(link, candidates)[0]
  return candidate ? String(candidate.lot_id) : ''
}

function candidatesForLink(link: LotReconciliationLink, candidates: LotReconciliationLot[]): LotReconciliationLot[] {
  const brokerAccountId = link.broker_lot?.acct_id ?? null
  return candidates.filter((candidate) => (
    (brokerAccountId === null || candidate.acct_id === brokerAccountId)
    && candidate.lot_id !== link.account_lot_id
  ))
}

function formatMoney(value: number): string {
  const formatted = currency(Math.abs(value), { precision: 2 }).format()
  return value < 0 ? `(${formatted})` : formatted
}

function formatNullableMoney(value: number | null): string {
  return value === null ? 'N/A' : formatMoney(value)
}

function moneyDelta(accountValue: number | null | undefined, brokerValue: number | null | undefined): number | null {
  if (accountValue === null || accountValue === undefined || brokerValue === null || brokerValue === undefined) {
    return null
  }

  return currency(accountValue, { precision: 4 }).subtract(brokerValue).value
}

function form8949Box(link: LotReconciliationLink): string {
  return link.broker_lot?.form_8949_box ?? link.account_lot?.form_8949_box ?? 'Box unset'
}

function washTreatment(link: LotReconciliationLink): string {
  const brokerWash = link.broker_lot?.wash_sale_disallowed ?? 0
  const accountWash = link.account_lot?.wash_sale_disallowed ?? 0
  if (currency(brokerWash).add(accountWash).value === 0) {
    return 'Wash: none'
  }

  return 'Wash: unknown'
}
