import currency from 'currency.js'
import { ChevronDown, ChevronUp, Maximize2 } from 'lucide-react'
import { useState } from 'react'

import type { fin_payslip } from '@/components/payslip/payslipDbCols'
import TotalsTable from '@/components/payslip/TotalsTable.client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { type FilingStatus, getStandardDeduction } from '@/lib/tax/standardDeductions'
import { cn } from '@/lib/utils'
import type { TaxDocument, W2ParsedData } from '@/types/finance/tax-document'
import type { TaxPreviewFacts } from '@/types/generated/tax-preview-facts'

import EstimatedTaxPaymentsSection from '../EstimatedTaxPaymentsSection'
import StateSelectorSection from '../StateSelectorSection'
import { useTaxPreview } from '../TaxPreviewContext'

type Tier = 'slim' | 'expanded'

const CURRENCY_TEXT = 'font-currency tabular-nums'

interface KpiSummary {
  totalIncome: number
  totalTax: number
  totalWithheld: number
  refundOrDue: number
  isRefund: boolean
  effectiveRate: number
  withholdingRate: number
}

interface SummarizeInput {
  taxFacts?: TaxPreviewFacts | null
  accountDocuments?: TaxDocument[]
  w2Documents?: TaxDocument[]
  payslips?: fin_payslip[]
}

export function summarizeTaxEstimate(input: SummarizeInput): KpiSummary {
  return summarize(input)
}

function summarize({ taxFacts, accountDocuments = [], w2Documents = [], payslips = [] }: SummarizeInput): KpiSummary {
  const form1040 = taxFacts?.form1040
  const totalIncome = form1040?.line9 ?? 0
  const totalTax = form1040?.line24 ?? 0
  const form1040Withheld = form1040?.line25d ?? 0
  const totalWithheld = form1040Withheld !== 0
    ? form1040Withheld
    : fallbackFederalWithholding(accountDocuments, w2Documents, payslips)
  const form1040Payments = form1040?.line33 ?? 0
  const totalPayments = form1040Withheld !== 0
    ? form1040Payments
    : currency(form1040Payments).add(totalWithheld).value
  const overpaid = form1040?.line34 ?? 0
  const amountOwed = form1040?.line37 ?? 0
  const usesWithholdingFallback = form1040Withheld === 0 && totalWithheld !== 0
  const diff = !usesWithholdingFallback && (overpaid > 0 || amountOwed > 0)
    ? currency(overpaid).subtract(amountOwed).value
    : currency(totalPayments).subtract(totalTax).value

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

function fallbackFederalWithholding(accountDocuments: TaxDocument[], w2Documents: TaxDocument[], payslips: fin_payslip[]): number {
  const reviewedW2Withholding = w2Documents.reduce((acc, doc) => {
    if (!doc.is_reviewed) {
      return acc
    }

    const parsed = doc.parsed_data as W2ParsedData | null
    return acc.add(parsed?.box2_fed_tax ?? 0)
  }, currency(0)).value
  const payslipWithholding = reviewedW2Withholding === 0
    ? payslips.reduce((acc, row) => acc
        .add(row.ps_fed_tax ?? 0)
        .add(row.ps_fed_tax_addl ?? 0)
        .subtract(row.ps_fed_tax_refunded ?? 0), currency(0)).value
    : 0
  const doc1099Withholding = accountDocuments.reduce(
    (acc, doc) => doc.is_reviewed && doc.form_type !== 'k1'
      ? acc.add(federalWithholdingFromParsedData(doc.parsed_data ?? {}))
      : acc,
    currency(0),
  ).value

  return currency(reviewedW2Withholding).add(payslipWithholding).add(doc1099Withholding).value
}

function federalWithholdingFromParsedData(parsedData: unknown): number {
  if (Array.isArray(parsedData)) {
    return parsedData.reduce((acc, entry) => {
      const childData = isRecord(entry) ? entry.parsed_data : null
      return acc.add(
        isRecord(childData) || Array.isArray(childData)
          ? federalWithholdingFromParsedData(childData)
          : federalWithholdingFromParsedData(entry),
      )
    }, currency(0)).value
  }

  if (!isRecord(parsedData)) {
    return 0
  }

  return currency(numeric(parsedData.box4_fed_tax))
    .add(numeric(parsedData.fed_tax_withheld))
    .add(numeric(parsedData.federal_tax_withheld)).value
}

function numeric(value: unknown): number {
  if (typeof value === 'number') {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)

    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
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

  const summary = summarize({
    taxFacts: state.taxFacts,
    accountDocuments: state.accountDocuments,
    w2Documents: state.w2Documents,
    payslips: state.payslips,
  })

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
        <DialogContent className="max-h-[85vh] w-[95vw] overflow-y-auto sm:w-[90vw] sm:max-w-6xl">
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
    <div className="flex items-center gap-4 bg-accent/25 px-4 py-2 text-xs">
      <button
        type="button"
        onClick={onExpand}
        className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="font-semibold uppercase tracking-wide">Estimate</span>
      </button>
      <span
        className={cn(
          CURRENCY_TEXT,
          'font-semibold',
          summary.refundOrDue === 0 ? 'text-foreground' : summary.isRefund ? 'text-success' : 'text-destructive',
        )}
      >
        {summary.isRefund ? 'Refund' : 'Due'} {fmtUsd(summary.refundOrDue)}
      </span>
      <span className="text-muted-foreground">·</span>
      <span className="text-foreground">
        Effective <span className={`${CURRENCY_TEXT} text-muted-foreground`}>{fmtPct(summary.effectiveRate)}</span>
      </span>
      <span className="text-muted-foreground">·</span>
      <span className="text-foreground">
        Withheld <span className={`${CURRENCY_TEXT} text-muted-foreground`}>{fmtPct(summary.withholdingRate)}</span>
      </span>
      <button
        type="button"
        onClick={onOpenFull}
        className="ml-auto flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Open full estimate detail"
      >
        <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="font-semibold uppercase tracking-wide">Detail</span>
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
          className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
  const toneClass = {
    success: 'border-success/25 bg-success/10 text-success',
    destructive: 'border-destructive/25 bg-destructive/10 text-destructive',
    warning: 'border-warning/30 bg-warning/10 text-warning',
    foreground: 'border-border bg-card text-foreground',
  }[tone]

  return (
    <div className={cn('rounded-md border p-3', toneClass)}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{label}</div>
      <div className={cn('mt-1 text-lg font-semibold', CURRENCY_TEXT)}>{value}</div>
      <div className="mt-0.5 text-xs opacity-75">{sub}</div>
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
              [finalSeriesLabel]: state.taxFacts?.form1040.line23 ?? 0,
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
                <h4 className="finance-section-heading" data-tone="info">
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
          estimatedTaxPayments={state.estimatedTaxPayments}
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
          'finance-section-heading',
          sticky && 'sticky top-0 bg-background/95 backdrop-blur',
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
      <span className={`${CURRENCY_TEXT} ${valueClass}`}>{value}</span>
    </div>
  )
}
