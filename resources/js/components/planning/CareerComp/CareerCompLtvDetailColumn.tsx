import currency from 'currency.js'
import { ChevronRight } from 'lucide-react'
import { type ReactElement } from 'react'

import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import {
  type CareerCompLtvBand,
  type CareerCompLtvMetric,
  parseLtvDetailRouteInstance,
} from './careerCompRoute'
import { formatShares } from './formatters'
import { BAND_LABELS } from './mappers'
import type {
  AnnualProjection,
  CareerCompInputs,
  CareerCompProjection,
  JobProjection,
  JobSpec,
  PaperEquityPoint,
  PaperEquityScenario,
  VestingProjection,
} from './types'

interface CashYearRow {
  year: number
  salary: number
  bonus: number
  amount: number
}

interface LiquidSourceRow {
  key: string
  grantId: string
  type: string
  shares: number
  amount: number
  source?: string | undefined
}

interface LtvDetailRow {
  key: string
  year: number
  label: string
  note?: string | undefined
  amount: number
  cashAmount?: number | undefined
  liquidAmount?: number | undefined
  paperAmount?: number | undefined
  shares?: number | undefined
  sharePrice?: number | undefined
  stage?: string | null | undefined
  drillable: boolean
  liquidSources?: LiquidSourceRow[] | undefined
  paperPoint?: PaperEquityPoint | undefined
  previousPaperValue?: number | undefined
}

interface LtvDetailInputRow {
  key: string
  label: string
  value: string
  note?: string | undefined
  tone?: 'default' | 'muted' | 'success' | 'destructive' | undefined
}

export interface CareerCompLtvDetailPayload {
  title: string
  description: string
  jobId: string
  jobName: string
  metric: CareerCompLtvMetric
  band: CareerCompLtvBand
  rows: LtvDetailRow[]
  total: number
}

export interface CareerCompLtvDetailYearPayload {
  title: string
  description: string
  rows: LtvDetailInputRow[]
  totalLabel: string
  total: number
}

interface CareerCompLtvDetailColumnProps {
  projection: CareerCompProjection
  instanceKey: string | undefined
  onOpenYear: (jobId: string, metric: CareerCompLtvMetric, band: CareerCompLtvBand, year: number) => void
}

interface CareerCompLtvDetailYearColumnProps {
  projection: CareerCompProjection
  inputs: CareerCompInputs
  instanceKey: string | undefined
}

const METRIC_LABELS: Record<CareerCompLtvMetric, string> = {
  'cash-comp': 'Cash comp',
  'liquid-equity': 'Liquid equity',
  'paper-equity': 'Paper equity',
  'liquid-total': 'Liquid total',
  'paper-total': 'Paper total',
}

function formatExactMoney(value: number | null | undefined): string {
  return currency(value ?? 0).format()
}

function formatSignedExactMoney(value: number): string {
  return value < 0 ? `-${formatExactMoney(Math.abs(value))}` : formatExactMoney(value)
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value)}%`
}

function formatDecimal(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(value)
}

function appendNote(note: string | undefined, addition: string): string {
  return note ? `${note} ${addition}` : addition
}

function sumMoney(values: readonly number[]): number {
  return values.reduce((total, value) => currency(total).add(value).value, 0)
}

function jobForId(projection: CareerCompProjection, jobId: string): JobProjection | null {
  return projection.jobs.find((job) => job.id === jobId) ?? null
}

function inputJobForId(inputs: CareerCompInputs, jobId: string): JobSpec | null {
  if (inputs.currentJob?.id === jobId) {
    return inputs.currentJob
  }

  return inputs.hypotheticalJobs.find((job) => job.id === jobId) ?? null
}

function cashForAnnual(annual: AnnualProjection): CashYearRow {
  const amount = currency(annual.salary).add(annual.bonus).value

  return {
    year: annual.year,
    salary: currency(annual.salary).value,
    bonus: currency(annual.bonus).value,
    amount,
  }
}

function cashRows(job: JobProjection): LtvDetailRow[] {
  return reconcileRows(
    job.annual.map((annual) => {
      const cash = cashForAnnual(annual)

      return {
        key: `cash-${cash.year}`,
        year: cash.year,
        label: String(cash.year),
        note: `${formatExactMoney(cash.salary)} salary + ${formatExactMoney(cash.bonus)} bonus`,
        amount: cash.amount,
        cashAmount: cash.amount,
        drillable: true,
      }
    }),
    job.lifetime.totalCashComp,
  )
}

function vestingRowsThroughYear(job: JobProjection, year: number): VestingProjection[] {
  return job.vesting.filter((row) => row.year <= year)
}

function vestingRowsForYear(job: JobProjection, year: number): VestingProjection[] {
  return job.vesting.filter((row) => row.year === year)
}

function vestedShares(rows: readonly VestingProjection[]): number {
  return rows.reduce((total, row) => total + row.vestedShares, 0)
}

function liquidTarget(job: JobProjection, band: CareerCompLtvBand): number {
  return currency(job.lifetime.totalEquityValue[band]).value
}

function paperTarget(job: JobProjection, band: CareerCompLtvBand): number {
  return currency(job.lifetime.totalPaperEquityValue[band]).value
}

function totalTarget(job: JobProjection, metric: CareerCompLtvMetric, band: CareerCompLtvBand): number {
  switch (metric) {
    case 'cash-comp':
      return currency(job.lifetime.totalCashComp).value
    case 'liquid-equity':
      return liquidTarget(job, band)
    case 'paper-equity':
      return paperTarget(job, band)
    case 'liquid-total':
      return currency(job.lifetime.totalValue[band]).value
    case 'paper-total':
      return currency(job.lifetime.totalPaperValue[band]).value
  }
}

function sourceRowsForVestingRows(rows: readonly VestingProjection[], sharePrice: number): LiquidSourceRow[] {
  return rows
    .filter((row) => row.vestedShares > 0)
    .map((row) => ({
      key: `${row.grantId}-${row.type}-${row.year}`,
      grantId: row.grantId,
      type: row.type,
      shares: row.vestedShares,
      amount: currency(sharePrice).multiply(row.vestedShares).value,
      source: row.source,
    }))
}

function reconcileSourceRows(rows: readonly LiquidSourceRow[], target: number): LiquidSourceRow[] {
  const diff = currency(target).subtract(sumMoney(rows.map((row) => row.amount))).value
  if (diff === 0) {
    return [...rows]
  }

  if (rows.length === 0) {
    return [{
      key: 'projection-reconciliation',
      grantId: 'Projection reconciliation',
      type: 'projection',
      shares: 0,
      amount: target,
    }]
  }

  const reconciled = rows.map((row) => ({ ...row }))
  const last = reconciled[reconciled.length - 1]
  if (last) {
    last.amount = currency(last.amount).add(diff).value
  }

  return reconciled
}

function liquidRows(job: JobProjection, band: CareerCompLtvBand): LtvDetailRow[] {
  const points = [...job.liquidity[band]].sort((left, right) => left.year - right.year)
  const rows = points.map((point, index) => {
    const currentVestingRows = vestingRowsForYear(job, point.year)
    const cumulativeVestingRows = vestingRowsThroughYear(job, point.year)
    const cumulativeShares = vestedShares(cumulativeVestingRows)
    const currentShares = vestedShares(currentVestingRows)
    const previousPoint = index > 0 ? points[index - 1] : undefined
    const previousShares = vestedShares(job.vesting.filter((row) => row.year < point.year))
    const releasesPriorIlliquidShares = previousShares > 0 && currency(previousPoint?.cumulativeValue ?? 0).value === 0 && currency(point.cumulativeValue).value > 0
    const realizedShares = releasesPriorIlliquidShares ? cumulativeShares : currentShares
    const sharePrice = cumulativeShares > 0 ? currency(point.cumulativeValue).divide(cumulativeShares).value : 0
    const amount = releasesPriorIlliquidShares
      ? currency(point.cumulativeValue).value
      : currency(sharePrice).multiply(realizedShares).value
    const sourceRows = sourceRowsForVestingRows(releasesPriorIlliquidShares ? cumulativeVestingRows : currentVestingRows, sharePrice)

    return {
      key: `liquid-${band}-${point.year}`,
      year: point.year,
      label: String(point.year),
      note: realizedShares > 0
        ? `${formatShares(realizedShares)} shares × ${formatExactMoney(sharePrice)}${releasesPriorIlliquidShares ? ' cumulative release' : ''}`
        : 'No liquid equity realized.',
      amount,
      liquidAmount: amount,
      shares: realizedShares,
      sharePrice,
      drillable: realizedShares > 0 || amount !== 0,
      liquidSources: reconcileSourceRows(sourceRows, amount),
    }
  })

  return reconcileRows(rows, liquidTarget(job, band))
}

function winningPaperScenario(job: JobProjection, band: CareerCompLtvBand): PaperEquityScenario | null {
  const scenarios = job.paperEquity.scenarios.filter((scenario) => scenario.outcome === band)
  if (scenarios.length === 0) {
    return null
  }

  return scenarios.reduce((winner, scenario) => (
    currency(scenario.totalNetPaperValue).value >= currency(winner.totalNetPaperValue).value ? scenario : winner
  ), scenarios[0]!)
}

function paperRows(job: JobProjection, band: CareerCompLtvBand): LtvDetailRow[] {
  const scenario = winningPaperScenario(job, band)
  if (!scenario) {
    return reconcileRows([], paperTarget(job, band))
  }

  let previousPaperValue = 0
  const rows = [...scenario.points]
    .sort((left, right) => left.year - right.year)
    .map((point) => {
      const amount = currency(point.netPaperValue).subtract(previousPaperValue).value
      const row: LtvDetailRow = {
        key: `paper-${band}-${scenario.id}-${point.year}`,
        year: point.year,
        label: String(point.year),
        note: `${point.stage ?? 'Unstaged'} stage · ${formatExactMoney(point.netPaperValue)} net paper value`,
        amount,
        paperAmount: amount,
        stage: point.stage,
        drillable: true,
        paperPoint: point,
        previousPaperValue,
      }
      previousPaperValue = currency(point.netPaperValue).value

      return row
    })

  return reconcileRows(rows, paperTarget(job, band))
}

function mergeAnnualRows(job: JobProjection, componentRows: readonly LtvDetailRow[], metric: CareerCompLtvMetric, target: number): LtvDetailRow[] {
  const cashByYear = new Map(job.annual.map((annual) => {
    const cash = cashForAnnual(annual)

    return [cash.year, cash] as const
  }))
  const componentByYear = new Map(componentRows.map((row) => [row.year, row] as const))
  const years = Array.from(new Set([...cashByYear.keys(), ...componentByYear.keys()])).sort((left, right) => left - right)
  const componentLabel = metric === 'liquid-total' ? 'liquid equity' : 'paper equity'

  return reconcileRows(
    years.map((year) => {
      const cash = cashByYear.get(year)
      const component = componentByYear.get(year)
      const cashAmount = cash?.amount ?? 0
      const componentAmount = component?.amount ?? 0
      const amount = currency(cashAmount).add(componentAmount).value

      return {
        key: `${metric}-${year}`,
        year,
        label: String(year),
        note: `${formatExactMoney(cashAmount)} cash + ${formatExactMoney(componentAmount)} ${componentLabel}`,
        amount,
        cashAmount,
        liquidAmount: metric === 'liquid-total' ? componentAmount : undefined,
        paperAmount: metric === 'paper-total' ? componentAmount : undefined,
        shares: component?.shares,
        sharePrice: component?.sharePrice,
        stage: component?.stage,
        drillable: cash !== undefined || (component?.drillable ?? false),
        liquidSources: component?.liquidSources,
        paperPoint: component?.paperPoint,
        previousPaperValue: component?.previousPaperValue,
      }
    }),
    target,
  )
}

function reconcileRows(rows: readonly LtvDetailRow[], target: number): LtvDetailRow[] {
  const total = currency(target).value
  const diff = currency(total).subtract(sumMoney(rows.map((row) => row.amount))).value

  if (diff === 0) {
    return [...rows]
  }

  if (rows.length === 0) {
    return [{
      key: 'projection-total',
      year: 0,
      label: 'Projection total',
      note: 'No annual source rows are available for this projection.',
      amount: total,
      drillable: false,
    }]
  }

  const reconciled = rows.map((row) => ({ ...row }))
  let targetIndex = reconciled.findLastIndex((row) => row.amount !== 0)
  if (targetIndex === -1) {
    targetIndex = reconciled.length - 1
  }

  const row = reconciled[targetIndex]
  if (row) {
    row.amount = currency(row.amount).add(diff).value
    row.note = appendNote(row.note, 'Reconciles to the projection lifetime total.')
  }

  return reconciled
}

function detailRowsForMetric(job: JobProjection, metric: CareerCompLtvMetric, band: CareerCompLtvBand): LtvDetailRow[] {
  if (metric === 'cash-comp') {
    return cashRows(job)
  }

  if (metric === 'liquid-equity') {
    return liquidRows(job, band)
  }

  if (metric === 'paper-equity') {
    return paperRows(job, band)
  }

  if (metric === 'liquid-total') {
    return mergeAnnualRows(job, liquidRows(job, band), metric, totalTarget(job, metric, band))
  }

  return mergeAnnualRows(job, paperRows(job, band), metric, totalTarget(job, metric, band))
}

function detailDescription(job: JobProjection, metric: CareerCompLtvMetric, band: CareerCompLtvBand): string {
  const bandLabel = BAND_LABELS[band].toLowerCase()

  switch (metric) {
    case 'cash-comp':
      return 'Annual salary plus bonus rows that sum to lifetime cash compensation.'
    case 'liquid-equity':
      return `Annual realized equity for the ${bandLabel} outcome. The total reconciles to the selected liquid-equity LTV cell.`
    case 'paper-equity': {
      const scenario = winningPaperScenario(job, band)
      return scenario
        ? `${scenario.label} scenario points for the ${bandLabel} outcome, shown as annual changes in net paper value.`
        : `No paper-equity scenario is available for the ${bandLabel} outcome.`
    }
    case 'liquid-total':
      return `Annual cash plus ${bandLabel} liquid-equity composition for the selected lifetime total.`
    case 'paper-total':
      return `Annual cash plus ${bandLabel} paper-equity composition for the selected lifetime total.`
  }
}

export function careerCompLtvDetailColumn(projection: CareerCompProjection, instanceKey: string | undefined): CareerCompLtvDetailPayload | null {
  const params = parseLtvDetailRouteInstance(instanceKey)
  if (!params) {
    return null
  }

  const job = jobForId(projection, params.jobId)
  if (!job) {
    return null
  }

  return {
    title: `${job.name} ${METRIC_LABELS[params.metric]}${params.metric === 'cash-comp' ? '' : ` ${BAND_LABELS[params.band].toLowerCase()}`}`,
    description: detailDescription(job, params.metric, params.band),
    jobId: job.id,
    jobName: job.name,
    metric: params.metric,
    band: params.band,
    rows: detailRowsForMetric(job, params.metric, params.band),
    total: totalTarget(job, params.metric, params.band),
  }
}

function metricUsesLiquidInputs(metric: CareerCompLtvMetric): boolean {
  return metric === 'liquid-equity' || metric === 'liquid-total'
}

function metricUsesPaperInputs(metric: CareerCompLtvMetric): boolean {
  return metric === 'paper-equity' || metric === 'paper-total'
}

function cashInputRows(cash: CashYearRow): LtvDetailInputRow[] {
  return [
    inputMoneyRow('salary', 'Salary', cash.salary),
    inputMoneyRow('bonus', 'Bonus', cash.bonus),
  ]
}

function cashYearPayload(job: JobProjection, metric: CareerCompLtvMetric, year: number): CareerCompLtvDetailYearPayload | null {
  const annual = job.annual.find((candidate) => candidate.year === year)
  if (!annual) {
    return null
  }

  const cash = cashForAnnual(annual)

  return {
    title: `${job.name} ${year} cash comp inputs`,
    description: `${METRIC_LABELS[metric]} uses salary plus bonus for this year.`,
    rows: cashInputRows(cash),
    totalLabel: 'Annual cash comp',
    total: cash.amount,
  }
}

function sharePriceFormulaRows(projection: CareerCompProjection, inputs: CareerCompInputs, jobId: string, year: number, band: CareerCompLtvBand, inferredSharePrice: number): LtvDetailInputRow[] {
  const inputJob = inputJobForId(inputs, jobId)
  if (!inputJob) {
    return [{
      key: 'projection-unit-price',
      label: 'Projection unit price',
      value: formatExactMoney(inferredSharePrice),
      note: 'Inferred from cumulative liquidity divided by cumulative vested shares.',
    }]
  }

  const basePrice = inputJob.company.type === 'private' && inputJob.company.currentSharePrice <= 0
    ? inputJob.company.fourNineA
    : inputJob.company.currentSharePrice
  const growthPct = band === 'low' ? inputJob.growthBands.lowPct : band === 'high' ? inputJob.growthBands.highPct : inputJob.growthBands.mediumPct
  const dilutionPct = inputJob.company.type === 'private' ? Math.max(0, inputJob.company.annualDilutionPct) : 0
  const years = Math.max(0, year - projection.startYear)
  const growthFactor = (1 + (growthPct / 100)) ** years
  const dilutionFactor = (1 - (dilutionPct / 100)) ** years
  const formulaPrice = currency(basePrice).multiply(growthFactor).multiply(dilutionFactor).value

  return [
    {
      key: 'formula',
      label: 'Share price formula',
      value: `${formatExactMoney(basePrice)} × (1 + ${formatPercent(growthPct)})^${years} × (1 − ${formatPercent(dilutionPct)})^${years}`,
      note: 'basePrice × (1 + growth)^n × (1 − dilution)^n',
    },
    {
      key: 'growth-factor',
      label: 'Growth factor',
      value: formatDecimal(growthFactor),
    },
    {
      key: 'dilution-factor',
      label: 'Dilution factor',
      value: formatDecimal(dilutionFactor),
    },
    {
      key: 'formula-price',
      label: 'Formula share price',
      value: formatExactMoney(formulaPrice),
    },
    {
      key: 'projection-unit-price',
      label: 'Projection unit price',
      value: formatExactMoney(inferredSharePrice),
      note: 'Used for the per-grant amount rows above.',
    },
  ]
}

function liquidInputRows(projection: CareerCompProjection, inputs: CareerCompInputs, job: JobProjection, band: CareerCompLtvBand, year: number): { rows: LtvDetailInputRow[]; total: number } | null {
  const row = liquidRows(job, band).find((candidate) => candidate.year === year)
  if (!row || !row.liquidSources || row.sharePrice === undefined) {
    return null
  }

  const grantRows = row.liquidSources.map((source) => ({
    key: source.key,
    label: `${source.grantId} (${source.type.toUpperCase()})`,
    value: formatExactMoney(source.amount),
    note: source.shares > 0
      ? `${formatShares(source.shares)} vested shares × ${formatExactMoney(row.sharePrice)}${source.source === 'projected_refresher' ? ' · projected refresher' : ''}`
      : 'Projection reconciliation.',
  }))

  return {
    rows: [
      ...grantRows,
      ...sharePriceFormulaRows(projection, inputs, job.id, year, band, row.sharePrice),
    ],
    total: row.liquidAmount ?? row.amount,
  }
}

function liquidYearPayload(projection: CareerCompProjection, inputs: CareerCompInputs, job: JobProjection, metric: CareerCompLtvMetric, band: CareerCompLtvBand, year: number): CareerCompLtvDetailYearPayload | null {
  const liquid = liquidInputRows(projection, inputs, job, band, year)
  if (!liquid) {
    return null
  }

  return {
    title: `${job.name} ${year} liquid equity inputs`,
    description: `${METRIC_LABELS[metric]} uses the ${BAND_LABELS[band].toLowerCase()} outcome for this year.`,
    rows: liquid.rows,
    totalLabel: 'Annual liquid equity',
    total: liquid.total,
  }
}

function inputMoneyRow(key: string, label: string, value: number, note?: string): LtvDetailInputRow {
  return {
    key,
    label,
    value: formatExactMoney(value),
    note,
    tone: value < 0 ? 'destructive' : undefined,
  }
}

function paperYearPayload(job: JobProjection, metric: CareerCompLtvMetric, band: CareerCompLtvBand, year: number): CareerCompLtvDetailYearPayload | null {
  const row = paperRows(job, band).find((candidate) => candidate.year === year)
  const point = row?.paperPoint
  if (!row || !point) {
    return null
  }

  return {
    title: `${job.name} ${year} paper equity inputs`,
    description: `${point.stage ?? 'Unstaged'} stage inputs for the ${BAND_LABELS[band].toLowerCase()} outcome.`,
    rows: [
      inputMoneyRow('preferred-post-money', 'Preferred post-money valuation', point.preferredPostMoneyValuation),
      {
        key: 'diluted-ownership',
        label: 'Diluted ownership',
        value: formatPercent(point.dilutedOwnershipPct),
        note: `${formatPercent(point.capitalDilutionPct)} capital dilution · ${formatPercent(point.employeePoolDilutionPct)} employee-pool dilution`,
      },
      inputMoneyRow('common-fmv', 'Common FMV', point.commonFmv),
      inputMoneyRow('gross-ownership', 'Gross ownership value', point.grossOwnershipValue),
      inputMoneyRow('rsu-ownership', 'RSU ownership value', point.rsuOwnershipValue ?? 0),
      inputMoneyRow('option-ownership', 'Option ownership value', point.optionOwnershipValue ?? 0),
      inputMoneyRow('gross-common', 'Gross common value', point.grossCommonValue),
      inputMoneyRow('common-intrinsic', 'Common intrinsic value', point.commonIntrinsicValue),
      inputMoneyRow('exercise-cost', 'Exercise cost', -Math.abs(point.exerciseCost)),
      inputMoneyRow('previous-net-paper', 'Previous net paper value', row.previousPaperValue ?? 0),
      inputMoneyRow('annual-paper-change', 'Annual paper change', row.paperAmount ?? row.amount),
    ],
    totalLabel: 'Net paper value',
    total: point.netPaperValue,
  }
}

function totalYearPayload(projection: CareerCompProjection, inputs: CareerCompInputs, job: JobProjection, metric: CareerCompLtvMetric, band: CareerCompLtvBand, year: number): CareerCompLtvDetailYearPayload | null {
  const annual = job.annual.find((candidate) => candidate.year === year)
  const cash = annual ? cashForAnnual(annual) : null
  const component = metric === 'liquid-total'
    ? liquidInputRows(projection, inputs, job, band, year)
    : (() => {
        const payload = paperYearPayload(job, metric, band, year)
        const row = paperRows(job, band).find((candidate) => candidate.year === year)

        return payload && row ? { rows: payload.rows, total: row.paperAmount ?? row.amount } : null
      })()

  if (!cash && !component) {
    return null
  }

  const componentLabel = metric === 'liquid-total' ? 'liquid equity' : 'paper equity'
  const cashAmount = cash?.amount ?? 0
  const componentAmount = component?.total ?? 0

  return {
    title: `${job.name} ${year} ${metric === 'liquid-total' ? 'liquid total' : 'paper total'} inputs`,
    description: `Cash plus ${BAND_LABELS[band].toLowerCase()} ${componentLabel} inputs for this annual total.`,
    rows: [
      ...(cash ? cashInputRows(cash) : []),
      ...(component?.rows ?? []),
    ],
    totalLabel: metric === 'liquid-total' ? 'Annual liquid total' : 'Annual paper total',
    total: currency(cashAmount).add(componentAmount).value,
  }
}

export function careerCompLtvDetailYearColumn(projection: CareerCompProjection, inputs: CareerCompInputs, instanceKey: string | undefined): CareerCompLtvDetailYearPayload | null {
  const params = parseLtvDetailRouteInstance(instanceKey, { requireYear: true })
  if (!params || params.year === undefined) {
    return null
  }

  const job = jobForId(projection, params.jobId)
  if (!job) {
    return null
  }

  if (params.metric === 'cash-comp') {
    return cashYearPayload(job, params.metric, params.year)
  }

  if (params.metric === 'liquid-total' || params.metric === 'paper-total') {
    return totalYearPayload(projection, inputs, job, params.metric, params.band, params.year)
  }

  if (metricUsesLiquidInputs(params.metric)) {
    return liquidYearPayload(projection, inputs, job, params.metric, params.band, params.year)
  }

  if (metricUsesPaperInputs(params.metric)) {
    return paperYearPayload(job, params.metric, params.band, params.year)
  }

  return null
}

function amountClass(amount: number): string {
  if (amount < 0) {
    return 'text-destructive'
  }

  return 'text-foreground'
}

function inputToneClass(tone: LtvDetailInputRow['tone']): string {
  if (tone === 'destructive') {
    return 'text-destructive'
  }
  if (tone === 'success') {
    return 'text-success'
  }
  if (tone === 'muted') {
    return 'text-muted-foreground'
  }

  return 'text-foreground'
}

export function CareerCompLtvDetailColumn({ projection, instanceKey, onOpenYear }: CareerCompLtvDetailColumnProps): ReactElement {
  const payload = careerCompLtvDetailColumn(projection, instanceKey)

  if (!payload) {
    return <p className="text-sm text-muted-foreground">This lifetime value detail is no longer available.</p>
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">{payload.title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{payload.description}</p>
      </div>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Year</TableHead>
              <TableHead>Calculation</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-8 text-right" aria-label="Actions" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {payload.rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="text-sm font-medium">{row.label}</TableCell>
                <TableCell className="text-sm">
                  <div className="font-medium">
                    {row.cashAmount !== undefined || row.liquidAmount !== undefined || row.paperAmount !== undefined
                      ? [
                          row.cashAmount !== undefined ? `${formatExactMoney(row.cashAmount)} cash` : null,
                          row.liquidAmount !== undefined ? `${formatExactMoney(row.liquidAmount)} liquid equity` : null,
                          row.paperAmount !== undefined ? `${formatExactMoney(row.paperAmount)} paper equity` : null,
                        ].filter(Boolean).join(' + ')
                      : row.stage ?? METRIC_LABELS[payload.metric]}
                  </div>
                  {row.note ? <div className="text-[11px] leading-snug text-muted-foreground">{row.note}</div> : null}
                </TableCell>
                <TableCell className={`text-right text-sm font-currency tabular-nums ${amountClass(row.amount)}`}>
                  {formatSignedExactMoney(row.amount)}
                </TableCell>
                <TableCell className="text-right">
                  {row.drillable ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      aria-label={`Open ${payload.jobName} ${row.year} inputs`}
                      onClick={() => onOpenYear(payload.jobId, payload.metric, payload.band, row.year)}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-primary/5">
              <TableCell colSpan={2} className="text-sm font-semibold">Total</TableCell>
              <TableCell className="text-right text-sm font-semibold font-currency tabular-nums">{formatExactMoney(payload.total)}</TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export function CareerCompLtvDetailYearColumn({ projection, inputs, instanceKey }: CareerCompLtvDetailYearColumnProps): ReactElement {
  const payload = careerCompLtvDetailYearColumn(projection, inputs, instanceKey)

  if (!payload) {
    return <p className="text-sm text-muted-foreground">This lifetime value year detail is no longer available.</p>
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">{payload.title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{payload.description}</p>
      </div>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Input</TableHead>
              <TableHead className="text-right">Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payload.rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="text-sm">
                  <div className="font-medium">{row.label}</div>
                  {row.note ? <div className="text-[11px] leading-snug text-muted-foreground">{row.note}</div> : null}
                </TableCell>
                <TableCell className={`text-right text-sm font-currency tabular-nums ${inputToneClass(row.tone)}`}>{row.value}</TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-primary/5">
              <TableCell className="text-sm font-semibold">{payload.totalLabel}</TableCell>
              <TableCell className="text-right text-sm font-semibold font-currency tabular-nums">{formatExactMoney(payload.total)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
