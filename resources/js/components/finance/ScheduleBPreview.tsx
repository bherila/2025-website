'use client'

import currency from 'currency.js'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface ScheduleBPreviewProps {
  interestIncome: currency
  dividendIncome: currency
  qualifiedDividends: currency
  selectedYear: number
}

export default function ScheduleBPreview({
  interestIncome,
  dividendIncome,
  qualifiedDividends,
  selectedYear,
}: ScheduleBPreviewProps) {
  const interestRows = [
    { label: 'Total Interest Income', value: interestIncome, bold: true },
  ]

  const dividendRows = [
    { label: 'Total Ordinary Dividends', value: dividendIncome, bold: true },
    qualifiedDividends.value > 0
      ? { label: 'Qualified Dividends', value: qualifiedDividends }
      : null,
  ].filter(Boolean) as { label: string; value: currency; bold?: boolean }[]

  return (
    <div>
      <h3 className="text-base font-semibold mb-2">Schedule B — {selectedYear}</h3>
      <p className="text-xs text-muted-foreground mb-2">Interest and Ordinary Dividends</p>
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Part</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-muted/20">
              <TableCell className="text-sm font-medium" colSpan={3}>Part I — Interest</TableCell>
            </TableRow>
            {interestRows.map((row, i) => (
              <TableRow key={`int-${i}`} className={row.bold ? 'font-semibold' : ''}>
                <TableCell />
                <TableCell className="text-sm">{row.label}</TableCell>
                <TableCell className="text-right text-sm font-mono">{row.value.format()}</TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/20">
              <TableCell className="text-sm font-medium" colSpan={3}>Part II — Ordinary Dividends</TableCell>
            </TableRow>
            {dividendRows.map((row, i) => (
              <TableRow key={`div-${i}`} className={row.bold ? 'font-semibold' : ''}>
                <TableCell />
                <TableCell className="text-sm">{row.label}</TableCell>
                <TableCell className="text-right text-sm font-mono">{row.value.format()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
