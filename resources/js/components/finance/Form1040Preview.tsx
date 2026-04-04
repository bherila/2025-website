'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

interface Form1040PreviewProps {
  w2Income: number
  interestIncome: number
  dividendIncome: number
  scheduleCIncome: number
  selectedYear: number
}

interface LineItem {
  line: string
  label: string
  value: number | null
  bold?: boolean
  refSchedule?: string
}

export default function Form1040Preview({
  w2Income,
  interestIncome,
  dividendIncome,
  scheduleCIncome,
  selectedYear,
}: Form1040PreviewProps) {
  const totalIncome = w2Income + interestIncome + dividendIncome + scheduleCIncome

  const lines: LineItem[] = [
    { line: '1a', label: 'Wages, salaries, tips (W-2, box 1)', value: w2Income },
    { line: '2b', label: 'Taxable interest', value: interestIncome, refSchedule: 'Schedule B' },
    { line: '3b', label: 'Ordinary dividends', value: dividendIncome, refSchedule: 'Schedule B' },
    ...(scheduleCIncome !== 0
      ? [{ line: '8', label: 'Business income or loss (Schedule C)', value: scheduleCIncome, refSchedule: 'Schedule C' }]
      : []),
    { line: '9', label: 'Total income', value: totalIncome, bold: true },
  ]

  return (
    <div className="px-4 pb-4">
      <h2 className="text-lg font-semibold mt-4 mb-2">Form 1040 Preview — {selectedYear}</h2>
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Line</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right w-40">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map(item => (
              <TableRow key={item.line} className={item.bold ? 'font-semibold bg-muted/30' : ''}>
                <TableCell className="text-sm font-mono">{item.line}</TableCell>
                <TableCell className="text-sm">
                  {item.label}
                  {item.refSchedule && (
                    <span className="ml-1 text-xs text-muted-foreground">({item.refSchedule})</span>
                  )}
                </TableCell>
                <TableCell className="text-right text-sm font-mono">
                  {item.value !== null ? formatCurrency(item.value) : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
