import currency from 'currency.js'
import { type ReactElement, useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import { formatMoney } from '../formatters'
import { mapAnnualFreeCashFlowRows } from '../mappers'
import type { OpportunityCostProjection } from '../types'

interface AnnualFreeCashFlowChartProps {
  projection: OpportunityCostProjection
}

export function AnnualFreeCashFlowChart({ projection }: AnnualFreeCashFlowChartProps): ReactElement {
  const rows = useMemo(() => mapAnnualFreeCashFlowRows(projection), [projection])
  // Stacked bars must sum to freeCashFlow. In v1, vestedLiquidEquity equals shareSaleProceeds
  // (equity is realized as it vests), so only proceeds are charted to avoid double counting, and
  // the exercise outlay is plotted as a negative so it subtracts below the zero axis.
  const barRows = useMemo(
    () => rows.map((row) => ({ ...row, exerciseOutlayPlot: currency(row.exerciseOutlay).multiply(-1).value })),
    [rows],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Annual free cash flow</CardTitle>
        <CardDescription>Pre-tax v1 cash flow by job: base + cash bonus + equity proceeds − exercise outlays (outlays shown below the axis).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No annual projection rows are available yet.</p>
        ) : (
          <div className="h-[360px] w-full" aria-label="Annual free cash flow chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barRows} margin={{ top: 8, right: 24, bottom: 8, left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis tickFormatter={(value: number) => formatMoney(value)} width={88} />
                <Tooltip formatter={(value, name) => [formatMoney(Math.abs(Number(value ?? 0))), String(name)]} labelFormatter={(label) => `Year ${label}`} />
                <ReferenceLine y={0} stroke="#94a3b8" />
                <Bar dataKey="salary" name="Base salary" stackId="cash" fill="#2563eb" />
                <Bar dataKey="bonus" name="Cash bonus" stackId="cash" fill="#16a34a" />
                <Bar dataKey="shareSaleProceeds" name="Equity proceeds" stackId="cash" fill="#0891b2" />
                <Bar dataKey="exerciseOutlayPlot" name="Exercise outlay" stackId="cash" fill="#dc2626" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="overflow-auto rounded-lg border" aria-label="Annual free cash flow data table">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Year</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">Bonus</TableHead>
                <TableHead className="text-right">Liquid equity</TableHead>
                <TableHead className="text-right">Sale proceeds</TableHead>
                <TableHead className="text-right">Exercise outlay</TableHead>
                <TableHead className="text-right">FCF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.jobId}-${row.year}`}>
                  <TableCell>{row.jobName}</TableCell>
                  <TableCell>{row.year}</TableCell>
                  <TableCell className="text-right">{formatMoney(row.salary)}</TableCell>
                  <TableCell className="text-right">{formatMoney(row.bonus)}</TableCell>
                  <TableCell className="text-right">{formatMoney(row.vestedLiquidEquity)}</TableCell>
                  <TableCell className="text-right">{formatMoney(row.shareSaleProceeds)}</TableCell>
                  <TableCell className="text-right">{formatMoney(row.exerciseOutlay)}</TableCell>
                  <TableCell className="text-right">{formatMoney(row.freeCashFlow)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
