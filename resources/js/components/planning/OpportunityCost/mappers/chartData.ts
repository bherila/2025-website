import currency from 'currency.js'

import type { JobProjection, OpportunityCostProjection } from '../types'

export type ProjectionBand = 'low' | 'medium' | 'high'

export interface LiquidityChartRow {
  year: number
  [seriesKey: string]: number
}

export interface LiquiditySeries {
  key: string
  label: string
  jobId: string
  jobName: string
  band: ProjectionBand
  strokeDasharray: string | undefined
}

export interface AnnualFreeCashFlowRow {
  year: number
  jobId: string
  jobName: string
  salary: number
  bonus: number
  vestedLiquidEquity: number
  shareSaleProceeds: number
  exerciseOutlay: number
  freeCashFlow: number
}

export interface LifetimeValueRow {
  jobId: string
  name: string
  isCurrent: boolean
  totalCashComp: number
  totalEquityLow: number
  totalEquityMedium: number
  totalEquityHigh: number
  totalValueLow: number
  totalValueMedium: number
  totalValueHigh: number
  cashCompDelta: number | null
  totalValueDeltaLow: number | null
  totalValueDeltaMedium: number | null
  totalValueDeltaHigh: number | null
}

const BAND_LABELS: Record<ProjectionBand, string> = {
  low: 'Low',
  medium: 'Med',
  high: 'High',
}

const BAND_DASHES: Record<ProjectionBand, string | undefined> = {
  low: '2 4',
  medium: undefined,
  high: '8 4',
}

function seriesKey(job: JobProjection, band: ProjectionBand): string {
  return `${job.id}-${band}`
}

export function mapLiquiditySeries(projection: OpportunityCostProjection): LiquiditySeries[] {
  return projection.jobs.flatMap((job) => (['low', 'medium', 'high'] as ProjectionBand[]).map((band) => ({
    key: seriesKey(job, band),
    label: `${job.name} ${BAND_LABELS[band]}`,
    jobId: job.id,
    jobName: job.name,
    band,
    strokeDasharray: BAND_DASHES[band],
  })))
}

export function mapLiquidityChartData(projection: OpportunityCostProjection): LiquidityChartRow[] {
  const years = Array.from({ length: projection.horizonYears }, (_entry, index) => projection.startYear + index)

  return years.map((year) => {
    const row: LiquidityChartRow = { year }
    projection.jobs.forEach((job) => {
      ;(['low', 'medium', 'high'] as ProjectionBand[]).forEach((band) => {
        const point = job.liquidity[band].find((entry) => entry.year === year)
        row[seriesKey(job, band)] = currency(point?.cumulativeValue ?? 0).value
      })
    })
    return row
  })
}

export function mapAnnualFreeCashFlowRows(projection: OpportunityCostProjection): AnnualFreeCashFlowRow[] {
  return projection.jobs.flatMap((job) => job.annual.map((annual) => ({
    year: annual.year,
    jobId: job.id,
    jobName: job.name,
    salary: currency(annual.salary).value,
    bonus: currency(annual.bonus).value,
    vestedLiquidEquity: currency(annual.vestedLiquidEquity).value,
    shareSaleProceeds: currency(annual.shareSaleProceeds).value,
    exerciseOutlay: currency(annual.exerciseOutlay).value,
    freeCashFlow: currency(annual.freeCashFlow).value,
  })))
}

export function mapLifetimeValueRows(projection: OpportunityCostProjection): LifetimeValueRow[] {
  return projection.jobs.map((job) => {
    const delta = projection.deltasVsCurrent.find((entry) => entry.jobId === job.id)

    return {
      jobId: job.id,
      name: job.name,
      isCurrent: job.isCurrent,
      totalCashComp: currency(job.lifetime.totalCashComp).value,
      totalEquityLow: currency(job.lifetime.totalEquityValue.low).value,
      totalEquityMedium: currency(job.lifetime.totalEquityValue.medium).value,
      totalEquityHigh: currency(job.lifetime.totalEquityValue.high).value,
      totalValueLow: currency(job.lifetime.totalValue.low).value,
      totalValueMedium: currency(job.lifetime.totalValue.medium).value,
      totalValueHigh: currency(job.lifetime.totalValue.high).value,
      cashCompDelta: delta ? currency(delta.cashCompDelta).value : null,
      totalValueDeltaLow: delta ? currency(delta.totalValueDelta.low).value : null,
      totalValueDeltaMedium: delta ? currency(delta.totalValueDelta.medium).value : null,
      totalValueDeltaHigh: delta ? currency(delta.totalValueDelta.high).value : null,
    }
  })
}
