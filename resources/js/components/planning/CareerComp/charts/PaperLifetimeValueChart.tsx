import { type ReactElement, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import { formatMoney } from '../formatters'
import { type LiquidityChartRow,mapPaperEquityChartData, mapPaperEquitySeries, SERIES_COLORS } from '../mappers'
import type { CareerCompProjection } from '../types'

interface PaperLifetimeValueChartProps {
  projection: CareerCompProjection
}

type ValueScale = 'linear' | 'log'

function chartRowsForScale(rows: ReturnType<typeof mapPaperEquityChartData>, series: ReturnType<typeof mapPaperEquitySeries>, scale: ValueScale): ReturnType<typeof mapPaperEquityChartData> {
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

export function PaperLifetimeValueChart({ projection }: PaperLifetimeValueChartProps): ReactElement {
  const [valueScale, setValueScale] = useState<ValueScale>('linear')
  const rows = useMemo(() => mapPaperEquityChartData(projection), [projection])
  const series = useMemo(() => mapPaperEquitySeries(projection), [projection])
  const chartRows = useMemo(() => chartRowsForScale(rows, series, valueScale), [rows, series, valueScale])
  const jobColorById = useMemo(() => Object.fromEntries(projection.jobs.map((job, index) => [job.id, SERIES_COLORS[index % SERIES_COLORS.length] ?? '#2563eb'])), [projection.jobs])

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle>Paper equity value over time</CardTitle>
          <CardDescription>
            Scenario lines mark private-company paper value from vested diluted ownership, net of cumulative exercise cost. Public current jobs are included as a medium liquid-equity comparison line.
          </CardDescription>
        </div>
        {series.length > 0 ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Scale</span>
            <ButtonGroup role="group" aria-label="Paper equity chart scale">
              <Button type="button" size="sm" variant={valueScale === 'linear' ? 'secondary' : 'outline'} onClick={() => setValueScale('linear')} aria-pressed={valueScale === 'linear'}>
                Linear
              </Button>
              <Button type="button" size="sm" variant={valueScale === 'log' ? 'secondary' : 'outline'} onClick={() => setValueScale('log')} aria-pressed={valueScale === 'log'}>
                Log
              </Button>
            </ButtonGroup>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-6">
        {series.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Add private-company valuation scenarios to see paper equity value.</p>
        ) : (
          <div className="h-[340px] w-full" aria-label="Paper equity value chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartRows} margin={{ top: 8, right: 24, bottom: 8, left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis
                  tickFormatter={(value: number) => formatMoney(value)}
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
                    dot={entry.outcome !== 'medium'}
                    strokeWidth={entry.outcome === 'medium' ? 2.5 : 2}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {series.length > 0 ? (
          <div className="overflow-auto rounded-lg border" aria-label="Paper equity value data table">
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
                    {series.map((entry) => <TableCell key={entry.key} className="text-right">{formatMoney(row[entry.key])}</TableCell>)}
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
