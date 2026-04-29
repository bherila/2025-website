'use client'

import type { ReactElement } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import SummaryTile from '@/components/ui/summary-tile'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency } from '@/lib/formatCurrency'
import type { RentVsBuyResults } from '@/lib/planning/rentVsBuy'

interface RentVsBuyResultsProps {
  results: RentVsBuyResults
}

export default function RentVsBuyResults({ results }: RentVsBuyResultsProps): ReactElement {
  const finalRow = results.rows.at(-1)

  function formatTooltipValue(value: number | string | undefined): string {
    if (typeof value === 'number') {
      return formatCurrency(value)
    }

    if (typeof value === 'string') {
      return formatCurrency(Number.parseFloat(value))
    }

    return formatCurrency(0)
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryTile title="Break-even horizon" kind={results.breakEvenYear === null ? 'yellow' : 'green'}>
          {results.breakEvenYear === null ? 'Renting stays cheaper' : `Year ${results.breakEvenYear}`}
        </SummaryTile>
        <SummaryTile title="Own vs. rent wealth delta" kind={results.finalWealthDelta >= 0 ? 'green' : 'red'}>
          {results.finalWealthDelta >= 0 ? '+' : '-'}
          {formatCurrency(Math.abs(results.finalWealthDelta))}
        </SummaryTile>
        <SummaryTile title="Sellable home equity">
          {formatCurrency(finalRow?.homeEquity ?? 0)}
        </SummaryTile>
        <SummaryTile title="Invested rent portfolio">
          {formatCurrency(finalRow?.investedPortfolio ?? 0)}
        </SummaryTile>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ownership vs. renting over time</CardTitle>
          <CardDescription>
            Cumulative economic cost is shown in today&apos;s dollars using the inflation assumption.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[420px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={results.rows}
              margin={{
                top: 16,
                right: 24,
                left: 8,
                bottom: 8,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" allowDecimals={false} />
              <YAxis tickFormatter={(value: number) => formatCurrency(value)} width={96} />
              <Tooltip formatter={(value) => formatTooltipValue(value as number | string | undefined)} />
              <Legend />
              {results.breakEvenYear !== null ? (
                <ReferenceLine x={results.breakEvenYear} stroke="var(--color-success, #22c55e)" strokeDasharray="4 4" label="Break-even" />
              ) : null}
              <Line type="monotone" dataKey="ownCumulativeCost" name="Buy cumulative cost" stroke="#2563eb" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="rentCumulativeCost" name="Rent cumulative cost" stroke="#f97316" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Year-by-year comparison</CardTitle>
          <CardDescription>Net positions combine discounted wealth with cumulative discounted cost through each year.</CardDescription>
        </CardHeader>
        <CardContent>
          <details open className="grid gap-4">
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
              Toggle detailed table
            </summary>
            <div className="max-h-[520px] overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Year</TableHead>
                    <TableHead className="text-right">Buy cost</TableHead>
                    <TableHead className="text-right">Rent cost</TableHead>
                    <TableHead className="text-right">Sellable equity</TableHead>
                    <TableHead className="text-right">Portfolio</TableHead>
                    <TableHead className="text-right">Net own</TableHead>
                    <TableHead className="text-right">Net rent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.rows.map((row) => (
                    <TableRow key={row.year} className={results.breakEvenYear === row.year ? 'bg-success/10' : undefined}>
                      <TableCell>{row.year}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.ownCumulativeCost)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.rentCumulativeCost)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.homeEquity)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.investedPortfolio)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.netOwnPosition)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.netRentPosition)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </details>
        </CardContent>
      </Card>
    </div>
  )
}
