import { type ReactElement, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import type { CareerCompLiquidityMode, CareerCompLtvBand } from '../careerCompRoute'
import { formatFriendlyMoney, formatMoney } from '../formatters'
import { type LiquidityChartRow, type LiquiditySeries, mapAfterTaxLiquidityChartData, mapLiquidityChartData, mapLiquiditySeries, type ProjectionBand, SERIES_COLORS } from '../mappers'
import type { CareerCompProjection } from '../types'

export type LiquidityMode = CareerCompLiquidityMode

interface LiquidityOverTimeChartProps {
  projection: CareerCompProjection
  initialMode?: LiquidityMode | undefined
  initialBand?: CareerCompLtvBand | undefined
  onOpenDetail?: ((jobId: string, year: number, band: CareerCompLtvBand, mode: LiquidityMode) => void) | undefined
}

type ValueScale = 'linear' | 'log'

const BAND_FILTER_LABELS: Record<ProjectionBand, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

function hasAfterTaxLiquidity(projection: CareerCompProjection): boolean {
  return projection.jobs.some((job) => job.afterTax !== undefined)
}

function chartRowsForScale(rows: LiquidityChartRow[], series: LiquiditySeries[], scale: ValueScale): LiquidityChartRow[] {
  if (scale === 'linear') {
    return rows
  }

  return rows.map((row) => {
    const nextRow: LiquidityChartRow = { year: row.year }

    series.forEach((entry) => {
      const value = row[entry.key] ?? 0
      nextRow[`${entry.key}__actual`] = value
      nextRow[entry.key] = value > 0 ? value : 1
    })

    return nextRow
  })
}

function LiquidityDrillButton({
  entry,
  year,
  mode,
  value,
  onOpenDetail,
}: {
  entry: LiquiditySeries
  year: number
  mode: LiquidityMode
  value: number
  onOpenDetail?: ((jobId: string, year: number, band: CareerCompLtvBand, mode: LiquidityMode) => void) | undefined
}): ReactElement {
  if (!onOpenDetail) {
    return <span className="font-currency tabular-nums">{formatFriendlyMoney(value)}</span>
  }

  const modeLabel = mode === 'afterTax' ? 'after-tax' : 'before-tax'
  const bandLabel = BAND_FILTER_LABELS[entry.band].toLowerCase()

  return (
    <button
      type="button"
      className="inline-flex min-w-16 justify-end rounded-sm text-right font-currency tabular-nums text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Drill into ${entry.jobName} ${modeLabel} liquidity ${bandLabel} ${year}`}
      onClick={() => onOpenDetail(entry.jobId, year, entry.band, mode)}
    >
      {formatFriendlyMoney(value)}
    </button>
  )
}

export function LiquidityOverTimeChart({ projection, initialMode = 'preTax', initialBand = 'medium', onOpenDetail }: LiquidityOverTimeChartProps): ReactElement {
  const hasAfterTaxData = hasAfterTaxLiquidity(projection)
  const [requestedLiquidityMode, setRequestedLiquidityMode] = useState<LiquidityMode>(initialMode)
  const liquidityMode = requestedLiquidityMode === 'afterTax' && hasAfterTaxData ? 'afterTax' : 'preTax'
  const [selectedBand, setSelectedBand] = useState<ProjectionBand>(initialBand)
  const [valueScale, setValueScale] = useState<ValueScale>('linear')
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>(() => projection.jobs.map((job) => job.id))
  const [jobSelectionTouched, setJobSelectionTouched] = useState(false)
  const projectionJobIds = useMemo(() => projection.jobs.map((job) => job.id), [projection.jobs])
  const effectiveSelectedJobIds = useMemo(() => {
    if (!jobSelectionTouched) {
      return projectionJobIds
    }

    const projectionJobIdSet = new Set(projectionJobIds)
    const retainedIds = selectedJobIds.filter((id) => projectionJobIdSet.has(id))

    return retainedIds.length > 0 || selectedJobIds.length === 0 ? retainedIds : projectionJobIds
  }, [jobSelectionTouched, projectionJobIds, selectedJobIds])
  const chartOptions = useMemo(
    () => ({ band: selectedBand, jobIds: effectiveSelectedJobIds, requiresAfterTax: liquidityMode === 'afterTax' }),
    [effectiveSelectedJobIds, liquidityMode, selectedBand],
  )
  const rows = useMemo(
    () => (liquidityMode === 'afterTax' ? mapAfterTaxLiquidityChartData(projection, chartOptions) : mapLiquidityChartData(projection, chartOptions)),
    [chartOptions, liquidityMode, projection],
  )
  const series = useMemo(() => mapLiquiditySeries(projection, chartOptions), [chartOptions, projection])
  const chartRows = useMemo(() => chartRowsForScale(rows, series, valueScale), [rows, series, valueScale])
  const jobColorById = useMemo(() => Object.fromEntries(projection.jobs.map((job, index) => [job.id, SERIES_COLORS[index % SERIES_COLORS.length] ?? '#2563eb'])), [projection.jobs])
  const emptyMessage = projection.jobs.length === 0
    ? 'Add at least one job to see a liquidity projection.'
    : liquidityMode === 'afterTax'
      ? 'After-tax liquidity is unavailable for the selected jobs.'
      : 'Select at least one job to see a liquidity projection.'

  const selectLiquidityMode = (nextMode: LiquidityMode): void => {
    if (nextMode === 'afterTax' && !hasAfterTaxData) {
      return
    }

    setRequestedLiquidityMode(nextMode)
  }

  const toggleJob = (jobId: string, checked: boolean): void => {
    setJobSelectionTouched(true)
    setSelectedJobIds((currentIds) => {
      const baseIds = jobSelectionTouched ? currentIds : effectiveSelectedJobIds

      if (checked) {
        return baseIds.includes(jobId) ? baseIds : [...baseIds, jobId]
      }

      return baseIds.filter((id) => id !== jobId)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Liquidity</CardTitle>
        <CardDescription>
          {liquidityMode === 'afterTax'
            ? 'Cumulative after-tax cash flow plus realizable equity value, using the backend federal regular tax and AMT projection.'
            : 'Cumulative realizable equity value by job and selected growth band.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 rounded-md border bg-card p-4 lg:grid-cols-[auto_auto_auto_1fr]">
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase text-muted-foreground">Tax</div>
            <ButtonGroup role="group" aria-label="Liquidity tax mode">
              <Button type="button" size="sm" variant={liquidityMode === 'preTax' ? 'secondary' : 'outline'} onClick={() => selectLiquidityMode('preTax')} aria-pressed={liquidityMode === 'preTax'}>
                Before tax
              </Button>
              <Button type="button" size="sm" variant={liquidityMode === 'afterTax' ? 'secondary' : 'outline'} onClick={() => selectLiquidityMode('afterTax')} aria-pressed={liquidityMode === 'afterTax'} disabled={!hasAfterTaxData}>
                After tax
              </Button>
            </ButtonGroup>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase text-muted-foreground">Band</div>
            <ButtonGroup role="group" aria-label="Liquidity band">
              {(['low', 'medium', 'high'] as ProjectionBand[]).map((band) => (
                <Button key={band} type="button" size="sm" variant={selectedBand === band ? 'secondary' : 'outline'} onClick={() => setSelectedBand(band)} aria-pressed={selectedBand === band}>
                  {BAND_FILTER_LABELS[band]}
                </Button>
              ))}
            </ButtonGroup>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase text-muted-foreground">Scale</div>
            <ButtonGroup role="group" aria-label="Liquidity chart scale">
              <Button type="button" size="sm" variant={valueScale === 'linear' ? 'secondary' : 'outline'} onClick={() => setValueScale('linear')} aria-pressed={valueScale === 'linear'}>
                Linear
              </Button>
              <Button type="button" size="sm" variant={valueScale === 'log' ? 'secondary' : 'outline'} onClick={() => setValueScale('log')} aria-pressed={valueScale === 'log'}>
                Log
              </Button>
            </ButtonGroup>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase text-muted-foreground">Jobs</div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {projection.jobs.map((job) => (
                <label key={job.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={effectiveSelectedJobIds.includes(job.id)} onCheckedChange={(checked) => toggleJob(job.id, checked === true)} aria-label={`Show ${job.name}`} />
                  <span>{job.name}{job.isCurrent ? ' (current)' : ''}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {!hasAfterTaxData ? (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground" role="status">
            After-tax liquidity unavailable. Before-tax liquidity remains available; recalculate the scenario to populate after-tax projection fields.
          </p>
        ) : null}

        {series.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="h-[360px] w-full" aria-label="Liquidity chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartRows} margin={{ top: 8, right: 24, bottom: 8, left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis
                  tickFormatter={(value: number) => formatFriendlyMoney(value)}
                  width={88}
                  {...(valueScale === 'log' ? { scale: 'log' as const, domain: [1, 'auto'] as const, allowDataOverflow: true } : {})}
                />
                <Tooltip
                  formatter={(value, name, item) => {
                    const dataKey = typeof item?.dataKey === 'string' ? item.dataKey : ''
                    const payload = item?.payload as Record<string, number> | undefined
                    const actualValue = payload?.[`${dataKey}__actual`] ?? Number(value ?? 0)

                    return [formatMoney(actualValue), String(name)]
                  }}
                  labelFormatter={(label) => `Year ${label}`}
                />
                {series.map((entry) => (
                  <Line
                    key={entry.key}
                    type="monotone"
                    dataKey={entry.key}
                    name={entry.label}
                    stroke={jobColorById[entry.jobId] ?? '#2563eb'}
                    {...(entry.strokeDasharray ? { strokeDasharray: entry.strokeDasharray } : {})}
                    dot={entry.band !== 'medium'}
                    strokeWidth={entry.band === 'medium' ? 2.5 : 2}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {series.length > 0 ? (
          <div className="overflow-auto rounded-lg border" aria-label="Liquidity data table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Year</TableHead>
                  {series.map((entry) => <TableHead key={entry.key} className="text-right">{entry.label}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.year}>
                    <TableCell>{row.year}</TableCell>
                    {series.map((entry) => (
                      <TableCell key={entry.key} className="text-right">
                        <LiquidityDrillButton entry={entry} year={row.year} mode={liquidityMode} value={row[entry.key] ?? 0} onOpenDetail={onOpenDetail} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
