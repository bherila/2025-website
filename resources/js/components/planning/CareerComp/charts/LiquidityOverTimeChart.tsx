import { type ReactElement, useMemo } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import { formatFriendlyMoney, formatMoney } from '../formatters'
import { mapAfterTaxLiquidityChartData, mapLiquidityChartData, mapLiquiditySeries } from '../mappers'
import type { CareerCompProjection } from '../types'

interface LiquidityOverTimeChartProps {
  projection: CareerCompProjection
  mode?: 'preTax' | 'afterTax'
}

const SERIES_COLORS = ['#2563eb', '#16a34a', '#dc2626', '#9333ea', '#ea580c', '#0891b2']

export function LiquidityOverTimeChart({ projection, mode = 'preTax' }: LiquidityOverTimeChartProps): ReactElement {
  const isAfterTax = mode === 'afterTax'
  const rows = useMemo(
    () => (isAfterTax ? mapAfterTaxLiquidityChartData(projection) : mapLiquidityChartData(projection)),
    [isAfterTax, projection],
  )
  const series = useMemo(() => mapLiquiditySeries(projection), [projection])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isAfterTax ? 'After-tax expected liquidity value over time' : 'Expected liquidity value over time'}</CardTitle>
        <CardDescription>
          {isAfterTax
            ? 'Cumulative after-tax cash flow plus realizable equity value, using the backend federal regular tax and AMT projection.'
            : 'Low, medium, and high bands use dotted, solid, and dashed lines in addition to color.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {projection.jobs.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Add at least one job to see a liquidity projection.</p>
        ) : (
          <div className="h-[360px] w-full" aria-label={isAfterTax ? 'After-tax expected liquidity chart' : 'Expected liquidity chart'}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 24, bottom: 8, left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis tickFormatter={(value: number) => formatFriendlyMoney(value)} width={88} />
                <Tooltip formatter={(value, name) => [formatMoney(Number(value ?? 0)), String(name)]} labelFormatter={(label) => `Year ${label}`} />
                {series.map((entry, index) => (
                  <Line
                    key={entry.key}
                    type="monotone"
                    dataKey={entry.key}
                    name={entry.label}
                    stroke={SERIES_COLORS[index % SERIES_COLORS.length] ?? '#2563eb'}
                    {...(entry.strokeDasharray ? { strokeDasharray: entry.strokeDasharray } : {})}
                    dot={entry.band !== 'medium'}
                    strokeWidth={entry.band === 'medium' ? 2.5 : 2}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="overflow-auto rounded-lg border" aria-label={isAfterTax ? 'After-tax expected liquidity data table' : 'Expected liquidity data table'}>
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
                  {series.map((entry) => <TableCell key={entry.key} className="text-right">{formatFriendlyMoney(row[entry.key])}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
