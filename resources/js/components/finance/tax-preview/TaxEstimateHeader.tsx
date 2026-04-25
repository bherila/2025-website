import currency from 'currency.js'
import { ChevronDown, ChevronUp, Maximize2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { Form1040LineItem } from '@/types/finance/tax-return'

import { useTaxPreview } from '../TaxPreviewContext'

type Tier = 'slim' | 'expanded'

interface KpiSummary {
  totalIncome: number
  totalTax: number
  totalWithheld: number
  refundOrDue: number
  isRefund: boolean
  effectiveRate: number
  withholdingRate: number
}

function lineValue(lines: Form1040LineItem[], lineNumber: string): number {
  return lines.find((l) => l.line === lineNumber)?.value ?? 0
}

function summarize(lines: Form1040LineItem[]): KpiSummary {
  const totalIncome = lineValue(lines, '9')
  const totalTax = lineValue(lines, '24')
  const totalWithheld =
    lineValue(lines, '25a') + lineValue(lines, '25b') + lineValue(lines, '25c') + lineValue(lines, '25d')
  const totalPayments = lineValue(lines, '33') || totalWithheld
  const diff = totalPayments - totalTax
  return {
    totalIncome,
    totalTax,
    totalWithheld,
    refundOrDue: Math.abs(diff),
    isRefund: diff >= 0,
    effectiveRate: totalIncome > 0 ? totalTax / totalIncome : 0,
    withholdingRate: totalIncome > 0 ? totalWithheld / totalIncome : 0,
  }
}

function fmtUsd(n: number): string {
  return currency(n, { precision: 0 }).format()
}

function fmtPct(n: number): string {
  return `${Math.round(n * 100)}%`
}

interface TaxEstimateHeaderProps {
  /** Default tier when columns are present (slim) vs absent (expanded). */
  defaultTier?: Tier
}

export function TaxEstimateHeader({ defaultTier = 'slim' }: TaxEstimateHeaderProps): React.ReactElement {
  const state = useTaxPreview()
  const [tier, setTier] = useState<Tier>(defaultTier)
  const [modalOpen, setModalOpen] = useState(false)

  const summary = summarize(state.taxReturn.form1040 ?? [])

  return (
    <>
      <div className="border-b border-border bg-card">
        {tier === 'slim' ? (
          <SlimTier
            summary={summary}
            onExpand={() => setTier('expanded')}
            onOpenFull={() => setModalOpen(true)}
          />
        ) : (
          <ExpandedTier
            summary={summary}
            retirementSavings={0}
            onCollapse={() => setTier('slim')}
            onOpenFull={() => setModalOpen(true)}
          />
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Tax Estimate — {state.year}</DialogTitle>
          </DialogHeader>
          <FullDetail summary={summary} />
        </DialogContent>
      </Dialog>
    </>
  )
}

function SlimTier({
  summary,
  onExpand,
  onOpenFull,
}: {
  summary: KpiSummary
  onExpand: () => void
  onOpenFull: () => void
}): React.ReactElement {
  return (
    <div className="flex items-center gap-4 px-4 py-2 font-mono text-xs">
      <button
        type="button"
        onClick={onExpand}
        className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="uppercase tracking-wider">Estimate</span>
      </button>
      <span
        className={cn(
          'font-semibold',
          summary.refundOrDue === 0 ? 'text-foreground' : summary.isRefund ? 'text-success' : 'text-destructive',
        )}
      >
        {summary.isRefund ? 'Refund' : 'Due'} {fmtUsd(summary.refundOrDue)}
      </span>
      <span className="text-muted-foreground">·</span>
      <span className="text-foreground">
        Effective <span className="text-muted-foreground">{fmtPct(summary.effectiveRate)}</span>
      </span>
      <span className="text-muted-foreground">·</span>
      <span className="text-foreground">
        Withheld <span className="text-muted-foreground">{fmtPct(summary.withholdingRate)}</span>
      </span>
      <button
        type="button"
        onClick={onOpenFull}
        className="ml-auto flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Open full estimate detail"
      >
        <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="uppercase tracking-wider">Detail</span>
      </button>
    </div>
  )
}

function ExpandedTier({
  summary,
  retirementSavings,
  onCollapse,
  onOpenFull,
}: {
  summary: KpiSummary
  retirementSavings: number
  onCollapse: () => void
  onOpenFull: () => void
}): React.ReactElement {
  return (
    <div className="space-y-3 px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onCollapse}
          className="flex items-center gap-1 font-mono text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          Federal Estimate
        </button>
        <Button variant="ghost" size="sm" className="ml-auto gap-1.5" onClick={onOpenFull}>
          <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
          Full detail
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Full year income" value={fmtUsd(summary.totalIncome)} sub="Gross estimated income" tone="success" />
        <KpiCard
          label="Total est. tax"
          value={fmtUsd(summary.totalTax)}
          sub={`Effective rate: ${fmtPct(summary.effectiveRate)}`}
          tone="destructive"
        />
        <KpiCard
          label="Taxes withheld"
          value={fmtUsd(summary.totalWithheld)}
          sub={`Withholding rate: ${fmtPct(summary.withholdingRate)}`}
          tone="warning"
        />
        <KpiCard
          label={summary.isRefund ? 'Est. tax refund' : 'Est. tax due'}
          value={fmtUsd(summary.refundOrDue)}
          sub={summary.isRefund ? 'Overpayment' : 'Underpayment'}
          tone={summary.isRefund ? 'success' : 'destructive'}
        />
        <KpiCard
          label="Retirement savings"
          value={fmtUsd(retirementSavings)}
          sub="Pre-tax + Roth + Employer"
          tone="success"
        />
      </div>
    </div>
  )
}

function KpiCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub: string
  tone: 'success' | 'destructive' | 'warning' | 'foreground'
}): React.ReactElement {
  const valueClass =
    tone === 'success'
      ? 'text-success'
      : tone === 'destructive'
        ? 'text-destructive'
        : tone === 'warning'
          ? 'text-warning'
          : 'text-foreground'
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('mt-1 font-mono text-lg font-semibold', valueClass)}>{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
    </div>
  )
}

function FullDetail({ summary }: { summary: KpiSummary }): React.ReactElement {
  return (
    <div className="space-y-4 font-mono text-sm">
      <Section title="Federal" sticky>
        <DetailRow label="Estimated income" value={fmtUsd(summary.totalIncome)} tone="success" />
        <DetailRow label="Total tax" value={fmtUsd(summary.totalTax)} tone="destructive" bold />
        <DetailRow label="Effective tax rate" value={fmtPct(summary.effectiveRate)} />
        <DetailRow label="Taxes withheld" value={fmtUsd(summary.totalWithheld)} tone="success" />
        <DetailRow
          label={summary.isRefund ? 'Est. refund' : 'Est. tax due'}
          value={fmtUsd(summary.refundOrDue)}
          tone={summary.isRefund ? 'success' : 'destructive'}
          bold
        />
      </Section>
      <p className="text-xs text-muted-foreground">
        Bracket breakdown and estimated-payment safe-harbor planning will land here once the existing
        Tax Estimate tab content moves in.
      </p>
    </div>
  )
}

function Section({
  title,
  sticky,
  children,
}: {
  title: string
  sticky?: boolean
  children: React.ReactNode
}): React.ReactElement {
  return (
    <section>
      <h3
        className={cn(
          'mb-2 border-b border-border pb-1 font-mono text-xs font-semibold uppercase tracking-wider text-primary',
          sticky && 'sticky top-0 bg-background',
        )}
      >
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </section>
  )
}

function DetailRow({
  label,
  value,
  tone,
  bold,
}: {
  label: string
  value: string
  tone?: 'success' | 'destructive'
  bold?: boolean
}): React.ReactElement {
  const valueClass =
    tone === 'success' ? 'text-success' : tone === 'destructive' ? 'text-destructive' : 'text-foreground'
  return (
    <div className={cn('flex items-baseline justify-between gap-4 border-b border-border/40 py-1.5', bold && 'font-semibold')}>
      <span className="text-foreground">{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  )
}
