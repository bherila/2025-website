'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

interface ScheduleBPreviewProps {
  interestIncome: number
  dividendIncome: number
  qualifiedDividends: number
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
    qualifiedDividends > 0
      ? { label: 'Qualified Dividends', value: qualifiedDividends }
      : null,
  ].filter(Boolean) as { label: string; value: number; bold?: boolean }[]

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
                <TableCell className="text-right text-sm font-mono">{formatCurrency(row.value)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/20">
              <TableCell className="text-sm font-medium" colSpan={3}>Part II — Ordinary Dividends</TableCell>
            </TableRow>
            {dividendRows.map((row, i) => (
              <TableRow key={`div-${i}`} className={row.bold ? 'font-semibold' : ''}>
                <TableCell />
                <TableCell className="text-sm">{row.label}</TableCell>
                <TableCell className="text-right text-sm font-mono">{formatCurrency(row.value)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
