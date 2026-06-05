import currency from 'currency.js'
import { type ReactElement, useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import { formatMoney } from '../formatters'
import { type AfterTaxAnnualFreeCashFlowRow, type AnnualFreeCashFlowRow, mapAfterTaxAnnualFreeCashFlowRows, mapAnnualFreeCashFlowRows } from '../mappers'
import type { CareerCompProjection } from '../types'

interface AnnualFreeCashFlowChartProps {
  projection: CareerCompProjection
  mode?: 'preTax' | 'afterTax'
}

function absoluteMoney(value: number): number {
  return value < 0 ? currency(value).multiply(-1).value : currency(value).value
}

function totalEstimatedTax(row: AnnualFreeCashFlowRow | AfterTaxAnnualFreeCashFlowRow): number {
  return 'totalEstimatedTax' in row ? row.totalEstimatedTax : 0
}

export function AnnualFreeCashFlowChart({ projection, mode = 'preTax' }: AnnualFreeCashFlowChartProps): ReactElement {
  const isAfterTax = mode === 'afterTax'
  const rows = useMemo(
    () => (isAfterTax ? mapAfterTaxAnnualFreeCashFlowRows(projection) : mapAnnualFreeCashFlowRows(projection)),
    [isAfterTax, projection],
  )
  // Stacked bars must sum to freeCashFlow. In v1, vestedLiquidEquity equals shareSaleProceeds
  // (equity is realized as it vests), so only proceeds are charted to avoid double counting, and
  // the exercise outlay is plotted as a negative so it subtracts below the zero axis.
  const barRows = useMemo(
    () => rows.map((row) => ({
      ...row,
      exerciseOutlayPlot: currency(row.exerciseOutlay).multiply(-1).value,
      estimatedTaxPlot: currency(totalEstimatedTax(row)).multiply(-1).value,
    })),
    [rows],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isAfterTax ? 'After-tax annual free cash flow' : 'Annual free cash flow'}</CardTitle>
        <CardDescription>
          {isAfterTax
            ? 'Cash flow after backend-modeled federal regular tax and AMT. Exercise outlays and tax are shown below the axis.'
            : 'Pre-tax v1 cash flow by job: base + cash bonus + equity proceeds minus exercise outlays (outlays shown below the axis).'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            {isAfterTax ? 'No after-tax annual projection rows are available yet.' : 'No annual projection rows are available yet.'}
          </p>
        ) : (
          <div className="h-[360px] w-full" aria-label={isAfterTax ? 'After-tax annual free cash flow chart' : 'Annual free cash flow chart'}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barRows} margin={{ top: 8, right: 24, bottom: 8, left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis tickFormatter={(value: number) => formatMoney(value)} width={88} />
                <Tooltip formatter={(value, name) => [formatMoney(absoluteMoney(Number(value ?? 0))), String(name)]} labelFormatter={(label) => `Year ${label}`} />
                <ReferenceLine y={0} stroke="#94a3b8" />
                <Bar dataKey="salary" name="Base salary" stackId="cash" fill="#2563eb" />
                <Bar dataKey="bonus" name="Cash bonus" stackId="cash" fill="#16a34a" />
                <Bar dataKey="shareSaleProceeds" name="Equity proceeds" stackId="cash" fill="#0891b2" />
                <Bar dataKey="exerciseOutlayPlot" name="Exercise outlay" stackId="cash" fill="#dc2626" />
                {isAfterTax ? <Bar dataKey="estimatedTaxPlot" name="Federal/AMT tax" stackId="cash" fill="#9333ea" /> : null}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="overflow-auto rounded-lg border" aria-label={isAfterTax ? 'After-tax annual free cash flow data table' : 'Annual free cash flow data table'}>
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
                {isAfterTax ? <TableHead className="text-right">Federal/AMT tax</TableHead> : null}
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
                  {isAfterTax ? <TableCell className="text-right">{formatMoney(totalEstimatedTax(row))}</TableCell> : null}
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
