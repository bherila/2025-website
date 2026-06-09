import currency from 'currency.js'
import { type ReactElement } from 'react'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import {
  type CareerCompLiquidityMode,
  type CareerCompLtvBand,
  parseLiquidityDetailRouteInstance,
} from './careerCompRoute'
import { BAND_LABELS, mapAfterTaxLiquidityChartData, mapLiquidityChartData, mapLiquiditySeries } from './mappers'
import type { AnnualProjection, CareerCompProjection, EquityCompensationAfterTaxAnnual, JobProjection } from './types'

interface LiquidityDetailRow {
  key: string
  label: string
  amount: number
  note?: string | undefined
  tone?: 'default' | 'muted' | 'destructive' | undefined
}

export interface CareerCompLiquidityDetailPayload {
  title: string
  description: string
  jobName: string
  year: number
  mode: CareerCompLiquidityMode
  band: CareerCompLtvBand
  includedRows: LiquidityDetailRow[]
  contextRows: LiquidityDetailRow[]
  finalAmount: number
}

interface CareerCompLiquidityDetailColumnProps {
  projection: CareerCompProjection
  instanceKey: string | undefined
}

interface MappedLiquidityValue {
  finalAmount: number
}

interface PreTaxContext {
  cumulativeCashComp: number
  cumulativeShareSaleProceeds: number
  cumulativeExerciseOutlay: number
  cumulativeFreeCashFlow: number
  cumulativeCashFlowExcludingEquity: number
}

interface AfterTaxContext {
  cashFlowBase: number
  cumulativeFreeCashFlow: number
  cumulativeEquitySaleProceeds: number
  cumulativeEstimatedRegularTax: number
  cumulativeEstimatedAmt: number
  cumulativeTotalEstimatedTax: number
}

function formatExactMoney(value: number | null | undefined): string {
  return currency(value ?? 0).format()
}

function formatSignedExactMoney(value: number): string {
  const amount = currency(value).value

  return amount < 0 ? `-${formatExactMoney(currency(amount).multiply(-1).value)}` : formatExactMoney(amount)
}

function sumMoney(values: readonly number[]): number {
  return values.reduce((total, value) => currency(total).add(value).value, 0)
}

function negativeMoney(value: number): number {
  return value > 0 ? currency(value).multiply(-1).value : 0
}

function jobForId(projection: CareerCompProjection, jobId: string): JobProjection | null {
  return projection.jobs.find((job) => job.id === jobId) ?? null
}

function annualRowsThroughYear(job: JobProjection, year: number): AnnualProjection[] {
  return job.annual.filter((annual) => annual.year <= year)
}

function afterTaxRowsThroughYear(job: JobProjection, year: number): EquityCompensationAfterTaxAnnual[] {
  return (job.afterTax?.annual ?? []).filter((annual) => annual.year <= year)
}

function liquidityValueForYear(job: JobProjection, band: CareerCompLtvBand, year: number): number {
  const point = job.liquidity[band].find((entry) => entry.year === year)

  return currency(point?.cumulativeValue ?? 0).value
}

function preTaxContext(job: JobProjection, year: number): PreTaxContext {
  const rows = annualRowsThroughYear(job, year)
  const cumulativeCashComp = rows.reduce((total, annual) => currency(total).add(annual.salary).add(annual.bonus).value, 0)
  const cumulativeShareSaleProceeds = sumMoney(rows.map((annual) => annual.shareSaleProceeds))
  const cumulativeExerciseOutlay = sumMoney(rows.map((annual) => annual.exerciseOutlay))
  const cumulativeFreeCashFlow = sumMoney(rows.map((annual) => annual.freeCashFlow))
  const cumulativeCashFlowExcludingEquity = rows.reduce(
    (total, annual) => currency(total).add(currency(annual.freeCashFlow).subtract(annual.shareSaleProceeds).value).value,
    0,
  )

  return {
    cumulativeCashComp,
    cumulativeShareSaleProceeds,
    cumulativeExerciseOutlay,
    cumulativeFreeCashFlow,
    cumulativeCashFlowExcludingEquity,
  }
}

function afterTaxContext(job: JobProjection, year: number): AfterTaxContext | null {
  if (!job.afterTax) {
    return null
  }

  const rows = afterTaxRowsThroughYear(job, year)
  const cumulativeFreeCashFlow = sumMoney(rows.map((annual) => annual.freeCashFlow))
  const cumulativeEquitySaleProceeds = sumMoney(rows.map((annual) => annual.equitySaleProceeds))
  const cashFlowBase = rows.reduce(
    (total, annual) => currency(total).add(currency(annual.freeCashFlow).subtract(annual.equitySaleProceeds).value).value,
    0,
  )
  const cumulativeEstimatedRegularTax = sumMoney(rows.map((annual) => annual.estimatedRegularTax))
  const cumulativeEstimatedAmt = sumMoney(rows.map((annual) => annual.estimatedAmt))
  const cumulativeTotalEstimatedTax = sumMoney(rows.map((annual) => annual.totalEstimatedTax))

  return {
    cashFlowBase,
    cumulativeFreeCashFlow,
    cumulativeEquitySaleProceeds,
    cumulativeEstimatedRegularTax,
    cumulativeEstimatedAmt,
    cumulativeTotalEstimatedTax,
  }
}

function mappedLiquidityValue(projection: CareerCompProjection, jobId: string, band: CareerCompLtvBand, year: number, mode: CareerCompLiquidityMode): MappedLiquidityValue | null {
  const chartOptions = { band, jobIds: [jobId], requiresAfterTax: mode === 'afterTax' }
  const series = mapLiquiditySeries(projection, chartOptions)[0]
  if (!series) {
    return null
  }

  const rows = mode === 'afterTax'
    ? mapAfterTaxLiquidityChartData(projection, chartOptions)
    : mapLiquidityChartData(projection, chartOptions)
  const row = rows.find((candidate) => candidate.year === year)
  const value = row?.[series.key]

  return typeof value === 'number' ? { finalAmount: currency(value).value } : null
}

function reconcileIncludedRows(rows: readonly LiquidityDetailRow[], finalAmount: number): LiquidityDetailRow[] {
  const diff = currency(finalAmount).subtract(sumMoney(rows.map((row) => row.amount))).value
  if (diff === 0) {
    return [...rows]
  }

  return [
    ...rows,
    {
      key: 'projection-reconciliation',
      label: 'Projection reconciliation',
      amount: diff,
      note: 'Adjusts the displayed components to the mapper output for this table cell.',
      tone: diff < 0 ? 'destructive' : undefined,
    },
  ]
}

function buildPreTaxRows(job: JobProjection, band: CareerCompLtvBand, year: number, finalAmount: number): Pick<CareerCompLiquidityDetailPayload, 'includedRows' | 'contextRows' | 'description'> {
  const context = preTaxContext(job, year)
  const liquidValue = liquidityValueForYear(job, band, year)
  const includedRows = reconcileIncludedRows([
    {
      key: 'liquid-equity',
      label: `${BAND_LABELS[band]} cumulative liquid equity`,
      amount: liquidValue,
      note: 'Mapped from the projection liquidity series used by the before-tax table.',
    },
  ], finalAmount)
  const contextRows: LiquidityDetailRow[] = [
    {
      key: 'cash-comp',
      label: 'Cumulative cash compensation',
      amount: context.cumulativeCashComp,
      note: 'Salary plus bonus through the selected year; shown for projection context.',
      tone: 'muted',
    },
    {
      key: 'share-sale-proceeds',
      label: 'Cumulative share sale proceeds',
      amount: context.cumulativeShareSaleProceeds,
      note: 'Medium-outcome annual proceeds in the pre-tax free-cash-flow rows.',
      tone: 'muted',
    },
    {
      key: 'exercise-outlay',
      label: 'Cumulative exercise outlay',
      amount: negativeMoney(context.cumulativeExerciseOutlay),
      note: 'Deducted by annual free cash flow; the before-tax liquidity table itself is the equity-liquidity series.',
      tone: context.cumulativeExerciseOutlay > 0 ? 'destructive' : 'muted',
    },
    {
      key: 'free-cash-flow',
      label: 'Cumulative pre-tax free cash flow',
      amount: context.cumulativeFreeCashFlow,
      note: `${formatExactMoney(context.cumulativeCashFlowExcludingEquity)} before equity proceeds, then medium proceeds/outlays reflected by backend annual rows.`,
      tone: 'muted',
    },
  ]

  return {
    description: 'Before-tax liquidity table cells are mapped directly from cumulative liquid equity for the selected band.',
    includedRows,
    contextRows,
  }
}

function buildAfterTaxRows(job: JobProjection, band: CareerCompLtvBand, year: number, finalAmount: number): Pick<CareerCompLiquidityDetailPayload, 'includedRows' | 'contextRows' | 'description'> | null {
  const context = afterTaxContext(job, year)
  if (!context) {
    return null
  }

  const liquidValue = liquidityValueForYear(job, band, year)
  const includedRows = reconcileIncludedRows([
    {
      key: 'after-tax-cash-flow-base',
      label: 'After-tax cash-flow base',
      amount: context.cashFlowBase,
      note: 'Cumulative backend after-tax free cash flow with medium equity sale proceeds removed before adding the selected band.',
    },
    {
      key: 'liquid-equity',
      label: `${BAND_LABELS[band]} cumulative liquid equity`,
      amount: liquidValue,
      note: 'Selected band value from the same projection liquidity series used by the table.',
    },
  ], finalAmount)
  const contextRows: LiquidityDetailRow[] = [
    {
      key: 'after-tax-free-cash-flow',
      label: 'Cumulative after-tax free cash flow',
      amount: context.cumulativeFreeCashFlow,
      note: 'Backend projection value before removing medium equity proceeds for band substitution.',
      tone: 'muted',
    },
    {
      key: 'equity-proceeds-removed',
      label: 'Medium equity proceeds removed',
      amount: negativeMoney(context.cumulativeEquitySaleProceeds),
      note: 'Removed so the selected low/medium/high liquidity band is represented once.',
      tone: context.cumulativeEquitySaleProceeds > 0 ? 'destructive' : 'muted',
    },
    {
      key: 'tax-adjustment',
      label: 'Backend tax adjustment reflected',
      amount: negativeMoney(context.cumulativeTotalEstimatedTax),
      note: `${formatExactMoney(context.cumulativeEstimatedRegularTax)} regular tax + ${formatExactMoney(context.cumulativeEstimatedAmt)} AMT from annual after-tax projection rows.`,
      tone: context.cumulativeTotalEstimatedTax > 0 ? 'destructive' : 'muted',
    },
  ]

  return {
    description: 'After-tax liquidity adds backend after-tax cash-flow base to the selected banded liquid-equity value; no tax calculation is performed in the browser.',
    includedRows,
    contextRows,
  }
}

export function careerCompLiquidityDetailColumn(projection: CareerCompProjection, instanceKey: string | undefined): CareerCompLiquidityDetailPayload | null {
  const params = parseLiquidityDetailRouteInstance(instanceKey)
  if (!params) {
    return null
  }

  const job = jobForId(projection, params.jobId)
  const mappedValue = mappedLiquidityValue(projection, params.jobId, params.band, params.year, params.mode)
  if (!job || !mappedValue) {
    return null
  }

  const rows = params.mode === 'afterTax'
    ? buildAfterTaxRows(job, params.band, params.year, mappedValue.finalAmount)
    : buildPreTaxRows(job, params.band, params.year, mappedValue.finalAmount)
  if (!rows) {
    return null
  }

  return {
    title: `${job.name} ${params.year} ${params.mode === 'afterTax' ? 'after-tax' : 'before-tax'} liquidity`,
    description: rows.description,
    jobName: job.name,
    year: params.year,
    mode: params.mode,
    band: params.band,
    includedRows: rows.includedRows,
    contextRows: rows.contextRows,
    finalAmount: mappedValue.finalAmount,
  }
}

function amountClass(row: LiquidityDetailRow): string {
  if (row.tone === 'muted') {
    return 'text-muted-foreground'
  }

  if (row.tone === 'destructive' || row.amount < 0) {
    return 'text-destructive'
  }

  return 'text-foreground'
}

function DetailRowsTable({ rows, totalLabel, total }: { rows: readonly LiquidityDetailRow[]; totalLabel?: string | undefined; total?: number | undefined }): ReactElement {
  return (
    <div className="overflow-hidden rounded-md border border-muted">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Component</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell className="text-sm">
                <div className="font-medium">{row.label}</div>
                {row.note ? <div className="text-[11px] leading-snug text-muted-foreground">{row.note}</div> : null}
              </TableCell>
              <TableCell className={`text-right text-sm font-currency tabular-nums ${amountClass(row)}`}>
                {formatSignedExactMoney(row.amount)}
              </TableCell>
            </TableRow>
          ))}
          {total !== undefined ? (
            <TableRow className="bg-primary/5">
              <TableCell className="text-sm font-semibold">{totalLabel ?? 'Final table value'}</TableCell>
              <TableCell className="text-right text-sm font-semibold font-currency tabular-nums">{formatExactMoney(total)}</TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  )
}

export function CareerCompLiquidityDetailColumn({ projection, instanceKey }: CareerCompLiquidityDetailColumnProps): ReactElement {
  const payload = careerCompLiquidityDetailColumn(projection, instanceKey)

  if (!payload) {
    return <p className="text-sm text-muted-foreground">This liquidity detail is no longer available.</p>
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold">{payload.title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {BAND_LABELS[payload.band]} outcome · {payload.mode === 'afterTax' ? 'After tax' : 'Before tax'} · {payload.description}
        </p>
      </div>

      <DetailRowsTable rows={payload.includedRows} total={payload.finalAmount} />

      {payload.contextRows.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase text-muted-foreground">Projection context</h3>
          <DetailRowsTable rows={payload.contextRows} />
        </div>
      ) : null}
    </div>
  )
}
