import currency from 'currency.js'

import type { CareerCompProjection, EquityCompensationAfterTaxAnnual, JobProjection, TaxFactSource } from '../types'

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

export interface AfterTaxAnnualFreeCashFlowRow extends AnnualFreeCashFlowRow {
  taxableCompIncome: number
  nsoOrdinaryIncome: number
  isoAmtPreference: number
  equitySaleProceeds: number
  estimatedRegularTax: number
  estimatedAmt: number
  totalEstimatedTax: number
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

export interface AfterTaxLifetimeValueRow {
  jobId: string
  name: string
  isCurrent: boolean
  taxableCompIncome: number
  nsoOrdinaryIncome: number
  isoAmtPreference: number
  equitySaleProceeds: number
  estimatedRegularTax: number
  estimatedAmt: number
  totalEstimatedTax: number
  freeCashFlow: number
  totalValueLow: number
  totalValueMedium: number
  totalValueHigh: number
  eightyThreeBElectionAmount: number
  freeCashFlowDelta: number | null
  totalValueDeltaLow: number | null
  totalValueDeltaMedium: number | null
  totalValueDeltaHigh: number | null
}

export interface AfterTaxSourceBreakdownRow {
  jobId: string
  jobName: string
  sourceId: string
  label: string
  sourceType: string
  routing: string | null
  amount: number
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

function annualForYear(job: JobProjection, year: number): EquityCompensationAfterTaxAnnual | undefined {
  return job.afterTax?.annual.find((annual) => annual.year === year)
}

function cumulativeAfterTaxCashFlowExcludingMediumEquityProceeds(job: JobProjection, year: number): number {
  return (job.afterTax?.annual ?? [])
    .filter((annual) => annual.year <= year)
    .reduce((total, annual) => {
      // Backend after-tax FCF already includes medium equity sale proceeds. Remove them
      // before adding the selected liquidity band so equity is represented once.
      const afterTaxCashFlowExcludingEquityProceeds = currency(annual.freeCashFlow).subtract(annual.equitySaleProceeds).value

      return currency(total).add(afterTaxCashFlowExcludingEquityProceeds).value
    }, 0)
}

function sumSourcesByType(sources: readonly TaxFactSource[] | undefined, sourceType: string): number {
  return (sources ?? []).reduce(
    (total, source) => (source.sourceType === sourceType ? currency(total).add(source.amount).value : total),
    0,
  )
}

export function mapLiquiditySeries(projection: CareerCompProjection): LiquiditySeries[] {
  return projection.jobs.flatMap((job) => (['low', 'medium', 'high'] as ProjectionBand[]).map((band) => ({
    key: seriesKey(job, band),
    label: `${job.name} ${BAND_LABELS[band]}`,
    jobId: job.id,
    jobName: job.name,
    band,
    strokeDasharray: BAND_DASHES[band],
  })))
}

export function mapLiquidityChartData(projection: CareerCompProjection): LiquidityChartRow[] {
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

export function mapAfterTaxLiquidityChartData(projection: CareerCompProjection): LiquidityChartRow[] {
  const years = Array.from({ length: projection.horizonYears }, (_entry, index) => projection.startYear + index)

  return years.map((year) => {
    const row: LiquidityChartRow = { year }

    projection.jobs.forEach((job) => {
      const cashFlowBase = cumulativeAfterTaxCashFlowExcludingMediumEquityProceeds(job, year)

      ;(['low', 'medium', 'high'] as ProjectionBand[]).forEach((band) => {
        const point = job.liquidity[band].find((entry) => entry.year === year)
        row[seriesKey(job, band)] = currency(cashFlowBase).add(point?.cumulativeValue ?? 0).value
      })
    })

    return row
  })
}

export function mapAnnualFreeCashFlowRows(projection: CareerCompProjection): AnnualFreeCashFlowRow[] {
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

export function mapAfterTaxAnnualFreeCashFlowRows(projection: CareerCompProjection): AfterTaxAnnualFreeCashFlowRow[] {
  return projection.jobs.flatMap((job) => (job.afterTax?.annual ?? []).map((afterTaxAnnual) => {
    const annual = job.annual.find((entry) => entry.year === afterTaxAnnual.year)

    return {
      year: afterTaxAnnual.year,
      jobId: job.id,
      jobName: job.name,
      salary: currency(annual?.salary ?? 0).value,
      bonus: currency(annual?.bonus ?? 0).value,
      vestedLiquidEquity: currency(annual?.vestedLiquidEquity ?? 0).value,
      shareSaleProceeds: currency(afterTaxAnnual.equitySaleProceeds).value,
      exerciseOutlay: currency(annual?.exerciseOutlay ?? 0).value,
      freeCashFlow: currency(afterTaxAnnual.freeCashFlow).value,
      taxableCompIncome: currency(afterTaxAnnual.taxableCompIncome).value,
      nsoOrdinaryIncome: currency(afterTaxAnnual.nsoOrdinaryIncome).value,
      isoAmtPreference: currency(afterTaxAnnual.isoAmtPreference).value,
      equitySaleProceeds: currency(afterTaxAnnual.equitySaleProceeds).value,
      estimatedRegularTax: currency(afterTaxAnnual.estimatedRegularTax).value,
      estimatedAmt: currency(afterTaxAnnual.estimatedAmt).value,
      totalEstimatedTax: currency(afterTaxAnnual.totalEstimatedTax).value,
    }
  }))
}

export function mapLifetimeValueRows(projection: CareerCompProjection): LifetimeValueRow[] {
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

export function mapAfterTaxLifetimeValueRows(projection: CareerCompProjection): AfterTaxLifetimeValueRow[] {
  const currentJob = projection.currentJobId
    ? projection.jobs.find((job) => job.id === projection.currentJobId)
    : undefined
  const current = currentJob?.afterTax?.lifetime

  return projection.jobs
    .filter((job) => job.afterTax !== undefined)
    .map((job) => {
      const lifetime = job.afterTax!.lifetime
      const hasDelta = current !== undefined && !job.isCurrent

      return {
        jobId: job.id,
        name: job.name,
        isCurrent: job.isCurrent,
        taxableCompIncome: currency(lifetime.taxableCompIncome).value,
        nsoOrdinaryIncome: currency(lifetime.nsoOrdinaryIncome).value,
        isoAmtPreference: currency(lifetime.isoAmtPreference).value,
        equitySaleProceeds: currency(lifetime.equitySaleProceeds).value,
        estimatedRegularTax: currency(lifetime.estimatedRegularTax).value,
        estimatedAmt: currency(lifetime.estimatedAmt).value,
        totalEstimatedTax: currency(lifetime.totalEstimatedTax).value,
        freeCashFlow: currency(lifetime.freeCashFlow).value,
        totalValueLow: currency(lifetime.totalValue.low).value,
        totalValueMedium: currency(lifetime.totalValue.medium).value,
        totalValueHigh: currency(lifetime.totalValue.high).value,
        eightyThreeBElectionAmount: sumSourcesByType(job.afterTax?.sources, 'equity_comp_83b_election'),
        freeCashFlowDelta: hasDelta ? currency(lifetime.freeCashFlow).subtract(current.freeCashFlow).value : null,
        totalValueDeltaLow: hasDelta ? currency(lifetime.totalValue.low).subtract(current.totalValue.low).value : null,
        totalValueDeltaMedium: hasDelta ? currency(lifetime.totalValue.medium).subtract(current.totalValue.medium).value : null,
        totalValueDeltaHigh: hasDelta ? currency(lifetime.totalValue.high).subtract(current.totalValue.high).value : null,
      }
    })
}

export function mapAfterTaxSourceBreakdownRows(projection: CareerCompProjection): AfterTaxSourceBreakdownRow[] {
  return projection.jobs.flatMap((job) => (job.afterTax?.sources ?? []).map((source) => ({
    jobId: job.id,
    jobName: job.name,
    sourceId: source.id,
    label: source.label,
    sourceType: source.sourceType,
    routing: source.routing,
    amount: currency(source.amount).value,
  })))
}
