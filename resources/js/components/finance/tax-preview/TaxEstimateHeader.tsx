import currency from 'currency.js'
import { ChevronDown, ChevronUp, Maximize2 } from 'lucide-react'
import { useState } from 'react'

import type { fin_payslip } from '@/components/payslip/payslipDbCols'
import TotalsTable from '@/components/payslip/TotalsTable.client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { type FilingStatus, getStandardDeduction } from '@/lib/tax/standardDeductions'
import { cn } from '@/lib/utils'
import type { Form1040LineItem } from '@/types/finance/tax-return'

import EstimatedTaxPaymentsSection from '../EstimatedTaxPaymentsSection'
import StateSelectorSection from '../StateSelectorSection'
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

export function summarizeTaxEstimate(lines: Form1040LineItem[]): KpiSummary {
  return summarize(lines)
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
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
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

export function TaxEstimateFullDetail({ summary }: { summary: KpiSummary }): React.ReactElement {
  return <FullDetail summary={summary} />
}

function FullDetail({ summary }: { summary: KpiSummary }): React.ReactElement {
  const state = useTaxPreview()
  const filingStatus: FilingStatus = state.isMarried ? 'Married Filing Jointly' : 'Single'
  const dataSeries = buildPayslipSeries(state.payslips, state.year)
  const finalSeriesLabel = dataSeries[dataSeries.length - 1]?.[0] ?? 'Q4 (Full Year)'
  const scheduleCIncomeBySeries = {
    Q1: state.scheduleCNetIncome.byQuarter.q1,
    Q2: state.scheduleCNetIncome.byQuarter.q2,
    Q3: state.scheduleCNetIncome.byQuarter.q3,
    'Q4 (Full Year)': state.scheduleCNetIncome.byQuarter.q4,
  }
  const hasPayslipData = state.payslips.length > 0

  return (
    <div className="space-y-6">
      <Section title="Federal Summary" sticky>
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

      {hasPayslipData && (
        <Section title="Federal Brackets — by Quarter" sticky>
          <TotalsTable
            series={dataSeries}
            taxConfig={{
              year: String(state.year),
              state: '',
              filingStatus,
              standardDeduction: getStandardDeduction(state.year, filingStatus),
            }}
            extraIncome={scheduleCIncomeBySeries}
            extraTax={{
              Q1: 0,
              Q2: 0,
              Q3: 0,
              [finalSeriesLabel]: state.taxReturn.schedule2?.totalAdditionalTaxes ?? 0,
            }}
          />
        </Section>
      )}

      <Section title="State Returns" sticky>
        <div className="space-y-4">
          <StateSelectorSection
            year={state.year}
            activeTaxStates={state.activeTaxStates}
            onChange={state.setActiveTaxStates}
          />
          {hasPayslipData &&
            state.activeTaxStates.map((stateCode) => (
              <div key={stateCode} className="space-y-2">
                <h4 className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
                  {stateCode} State Taxes
                </h4>
                <TotalsTable
                  series={dataSeries}
                  taxConfig={{
                    year: String(state.year),
                    state: stateCode,
                    filingStatus,
                    standardDeduction: getStandardDeduction(state.year, filingStatus, stateCode),
                  }}
                  extraIncome={scheduleCIncomeBySeries}
                />
              </div>
            ))}
          {state.activeTaxStates.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Add a state return above to see per-state tax tables. Currently supported: CA, NY.
            </p>
          )}
        </div>
      </Section>

      <Section title="Estimated Payments — Safe Harbor" sticky>
        <EstimatedTaxPaymentsSection
          planningYear={state.year + 1}
          priorYearAgi={state.priorYearAgi}
          priorYearTax={state.priorYearTax}
          onPriorYearAgiChange={state.setPriorYearAgi}
          onPriorYearTaxChange={state.setPriorYearTax}
          estimatedTaxPayments={state.taxReturn.estimatedTaxPayments}
          showMfsUnsupportedNotice={state.isMarried}
        />
      </Section>
    </div>
  )
}

function buildPayslipSeries(payslips: fin_payslip[], year: number): [string, fin_payslip[]][] {
  const start = `${year}-01-01`
  const end = `${year + 1}-01-01`
  const q1end = `${year}-04-01`
  const q2end = `${year}-07-01`
  const q3end = `${year}-10-01`
  const all: fin_payslip[] = []
  const q1: fin_payslip[] = []
  const q2: fin_payslip[] = []
  const q3: fin_payslip[] = []
  for (const row of payslips) {
    if (!row.pay_date || row.pay_date <= start || row.pay_date >= end) {
      continue
    }
    all.push(row)
    if (row.pay_date < q1end) q1.push(row)
    if (row.pay_date < q2end) q2.push(row)
    if (row.pay_date < q3end) q3.push(row)
  }
  const series: [string, fin_payslip[]][] = [['Q1', q1]]
  if (q2.length > q1.length) series.push(['Q2', q2])
  if (q3.length > q2.length) series.push(['Q3', q3])
  if (all.length > q3.length) series.push(['Q4 (Full Year)', all])
  return series
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
