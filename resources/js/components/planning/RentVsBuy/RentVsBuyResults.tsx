'use client'

import currency from 'currency.js'
import { type ReactElement, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { Button } from '@/components/ui/button'
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
import type { RentVsBuyDetailSection, RentVsBuyResults, RentVsBuyYearRow } from '@/lib/planning/rentVsBuy'

import RentVsBuyDetailsModal from './RentVsBuyDetailsModal'

interface RentVsBuyResultsProps {
  results: RentVsBuyResults
}

interface DetailButtonProps {
  children: ReactElement | string
  row: RentVsBuyYearRow
  section: RentVsBuyDetailSection
  onOpenDetails: (row: RentVsBuyYearRow, section: RentVsBuyDetailSection) => void
}

function DetailButton({ children, row, section, onOpenDetails }: DetailButtonProps): ReactElement {
  return (
    <Button
      type="button"
      variant="link"
      className="h-auto min-h-0 p-0 text-right font-normal"
      onClick={() => onOpenDetails(row, section)}
    >
      {children}
    </Button>
  )
}

export default function RentVsBuyResults({ results }: RentVsBuyResultsProps): ReactElement {
  const finalRow = results.rows.at(-1)
  const [detailState, setDetailState] = useState<{
    row: RentVsBuyYearRow
    section: RentVsBuyDetailSection
  } | null>(null)

  function formatMoney(value: number | string | undefined): string {
    if (value === undefined) {
      return currency(0, { precision: 0 }).format()
    }

    return currency(value, { precision: 0 }).format()
  }

  function absoluteMoney(value: number): number {
    return value < 0 ? currency(value).multiply(-1).value : currency(value).value
  }

  function formatTooltipValue(value: number | string | undefined): string {
    return formatMoney(value)
  }

  function openDetails(row: RentVsBuyYearRow, section: RentVsBuyDetailSection): void {
    setDetailState({ row, section })
  }

  function closeDetails(): void {
    setDetailState(null)
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryTile title="Break-even horizon" kind={results.breakEvenYear === null ? 'yellow' : 'green'}>
          {results.breakEvenYear === null ? 'Renter wealth stays ahead' : `Year ${results.breakEvenYear}`}
        </SummaryTile>
        <SummaryTile title="Own vs. rent wealth delta" kind={results.finalWealthDelta >= 0 ? 'green' : 'red'}>
          {results.finalWealthDelta >= 0 ? '+' : '-'}
          {formatMoney(absoluteMoney(results.finalWealthDelta))}
        </SummaryTile>
        <SummaryTile title="Buyer total wealth">
          {formatMoney(finalRow?.buyerTotalWealth)}
        </SummaryTile>
        <SummaryTile title="Renter portfolio">
          {formatMoney(finalRow?.renterPortfolio.total)}
        </SummaryTile>
        <SummaryTile title="Nonrecoverable costs">
          Buy {formatMoney(finalRow?.buyNonrecoverableCosts.total)} / Rent {formatMoney(finalRow?.rentNonrecoverableCosts.total)}
        </SummaryTile>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Wealth over time</CardTitle>
          <CardDescription>
            Break-even is based on total wealth: buyer portfolio plus cash received from selling the home, compared with the renter&apos;s invested portfolio. Amounts are shown in today&apos;s dollars.
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
              <YAxis tickFormatter={(value: number) => formatMoney(value)} width={96} />
              <Tooltip formatter={(value) => formatTooltipValue(value as number | string | undefined)} />
              <Legend />
              {results.breakEvenYear !== null ? (
                <ReferenceLine x={results.breakEvenYear} stroke="var(--color-success, #22c55e)" strokeDasharray="4 4" label="Break-even" />
              ) : null}
              <Line type="monotone" dataKey="buyerTotalWealth" name="Buyer total wealth" stroke="#2563eb" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="renterTotalWealth" name="Renter total wealth" stroke="#f97316" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Year-by-year comparison</CardTitle>
          <CardDescription>Click linked values for the supporting present-dollar components behind each scenario.</CardDescription>
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
                    <TableHead className="text-right">Buy nonrecoverable</TableHead>
                    <TableHead className="text-right">Rent nonrecoverable</TableHead>
                    <TableHead className="text-right">Buyer portfolio</TableHead>
                    <TableHead className="text-right">Renter portfolio</TableHead>
                    <TableHead className="text-right">Buyer total wealth</TableHead>
                    <TableHead className="text-right">Renter total wealth</TableHead>
                    <TableHead className="text-right">Wealth delta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.rows.map((row) => (
                    <TableRow key={row.year} className={results.breakEvenYear === row.year ? 'bg-success/10' : undefined}>
                      <TableCell>{row.year}</TableCell>
                      <TableCell className="text-right">
                        <DetailButton row={row} section="buy-costs" onOpenDetails={openDetails}>{formatMoney(row.buyNonrecoverableCosts.total)}</DetailButton>
                      </TableCell>
                      <TableCell className="text-right">
                        <DetailButton row={row} section="rent-costs" onOpenDetails={openDetails}>{formatMoney(row.rentNonrecoverableCosts.total)}</DetailButton>
                      </TableCell>
                      <TableCell className="text-right">
                        <DetailButton row={row} section="buyer-portfolio" onOpenDetails={openDetails}>{formatMoney(row.buyerPortfolio.total)}</DetailButton>
                      </TableCell>
                      <TableCell className="text-right">
                        <DetailButton row={row} section="renter-portfolio" onOpenDetails={openDetails}>{formatMoney(row.renterPortfolio.total)}</DetailButton>
                      </TableCell>
                      <TableCell className="text-right">
                        <DetailButton row={row} section="buyer-wealth" onOpenDetails={openDetails}>{formatMoney(row.buyerTotalWealth)}</DetailButton>
                      </TableCell>
                      <TableCell className="text-right">{formatMoney(row.renterTotalWealth)}</TableCell>
                      <TableCell className="text-right">
                        {row.wealthDelta >= 0 ? '+' : '-'}
                        {formatMoney(absoluteMoney(row.wealthDelta))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </details>
        </CardContent>
      </Card>
      <RentVsBuyDetailsModal
        row={detailState?.row ?? null}
        section={detailState?.section ?? null}
        onClose={closeDetails}
      />
    </div>
  )
}
