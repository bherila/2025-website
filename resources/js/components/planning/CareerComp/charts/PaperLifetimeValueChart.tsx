import { type ReactElement, useMemo } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import { formatMoney } from '../formatters'
import { mapPaperEquityChartData, mapPaperEquitySeries, SERIES_COLORS } from '../mappers'
import type { CareerCompProjection } from '../types'

interface PaperLifetimeValueChartProps {
  projection: CareerCompProjection
}

export function PaperLifetimeValueChart({ projection }: PaperLifetimeValueChartProps): ReactElement {
  const rows = useMemo(() => mapPaperEquityChartData(projection), [projection])
  const series = useMemo(() => mapPaperEquitySeries(projection), [projection])
  const jobColorById = useMemo(() => Object.fromEntries(projection.jobs.map((job, index) => [job.id, SERIES_COLORS[index % SERIES_COLORS.length] ?? '#2563eb'])), [projection.jobs])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Paper equity value over time</CardTitle>
        <CardDescription>
          Scenario lines mark private-company paper value from vested diluted ownership, net of cumulative exercise cost. Color identifies the job; line style identifies the scenario outcome.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {series.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Add private-company valuation scenarios to see paper equity value.</p>
        ) : (
          <div className="h-[340px] w-full" aria-label="Paper equity value chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 24, bottom: 8, left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis tickFormatter={(value: number) => formatMoney(value)} width={88} />
                <Tooltip formatter={(value, name) => [formatMoney(Number(value ?? 0)), String(name)]} labelFormatter={(label) => `Year ${label}`} />
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
