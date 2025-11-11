'use client'
import { Table, TableBody, TableRow, TableCell, TableHeader, TableHead } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { calculateTax } from '@/lib/tax/taxBracket'
import currency from 'currency.js'
import type { fin_payslip } from './payslipDbCols'

function totalTaxableIncomeBeforeSubtractions(data: fin_payslip[]) {
  let tot = currency(0)
  for (const row of data) {
    tot = tot
      .add(row.ps_salary ?? 0)
      .add(row.earnings_rsu ?? 0)
      .add(row.imp_ltd ?? 0)
      .add(row.imp_legal ?? 0)
      .add(row.imp_fitness ?? 0)
      .add(row.imp_other ?? 0)
  }
  return tot
}

function totalFedWH(data: fin_payslip[]) {
  let tot = currency(0)
  for (const row of data) {
    tot = tot
      .add(row.ps_fed_tax ?? 0)
      .add(row.ps_fed_tax_addl ?? 0)
      .subtract(row.ps_fed_tax_refunded ?? 0)
  }
  return tot
}

function totalStateWH(data: fin_payslip[]) {
  let tot = currency(0)
  for (const row of data) {
    tot = tot.add(row.ps_state_tax ?? 0).add(row.ps_state_tax_addl ?? 0)
  }
  return tot
}

export default function TotalsTable({
  series,
  taxConfig,
}: {
  series: [string, fin_payslip[]][]
  taxConfig: {
    year: string
    state: string
    filingStatus: 'Single' | 'Married' | 'Married Filing Separately' | 'Head of Household'
    standardDeduction: number
  }
}) {
  const calculateTotals = (data: fin_payslip[]) => {
    const income = totalTaxableIncomeBeforeSubtractions(data)
    const fedWH = totalFedWH(data)
    const stateWH = taxConfig.state ? totalStateWH(data) : currency(0)
    const estTaxIncome = income.subtract(taxConfig.standardDeduction)
    const { taxes, totalTax } = calculateTax(taxConfig.year, taxConfig.state, estTaxIncome, taxConfig.filingStatus)
    return { income, fedWH, stateWH, estTaxIncome, taxes, totalTax }
  }
  const rows = [
    {
      description: 'Estimated Income',
      getValue: (totals: ReturnType<typeof calculateTotals>) => totals.income.value.toFixed(2),
    },
    {
      description: 'Standard Deduction',
      getValue: () => taxConfig.standardDeduction.toFixed(2),
    },
    {
      description: 'Estimated Taxable Income',
      getValue: (totals: ReturnType<typeof calculateTotals>) => totals.estTaxIncome.value.toFixed(2),
    },
    {
      description: 'Marginal Tax Brackets',
      getValue: (totals: ReturnType<typeof calculateTotals>) => (
        <Table>
          <TableBody>
            {totals.taxes.map((m) => (
              <TableRow key={m.bracket.toString()}>
                <TableCell>
                  ${m.amt.value} @ {m.bracket.toString()}
                </TableCell>
                <TableCell>{m.tax.toString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ),
    },
    {
      description: 'Total Tax',
      getValue: (totals: ReturnType<typeof calculateTotals>) => totals.totalTax.value.toFixed(2),
    },
    {
      description: 'Effective Tax Rate',
      getValue: (totals: ReturnType<typeof calculateTotals>) =>
        totals.estTaxIncome.value > 0
          ? `${totals.totalTax.divide(totals.estTaxIncome).multiply(100).value.toFixed(2)}%`
          : 'N/A',
    },
    {
      description: 'Taxes Withheld',
      getValue: (totals: ReturnType<typeof calculateTotals>) => {
        const withholding = taxConfig.state ? (totals.stateWH?.value ?? 0) : totals.fedWH.value
        const withholdingPercentage = taxConfig.state
          ? (totals.stateWH?.divide(totals.income).multiply(100).value.toFixed(1) ?? '0.0')
          : totals.fedWH.divide(totals.income).multiply(100).value.toFixed(1)
        return `${withholding.toFixed(2)} (${withholdingPercentage}%)`
      },
    },
    {
      description: 'Est Tax Due/Refund',
      getValue: (totals: ReturnType<typeof calculateTotals>) => {
        const taxDueOrRefund = totals.totalTax.subtract(taxConfig.state ? totals.stateWH : totals.fedWH)
        const absValue = Math.abs(taxDueOrRefund.value)

        if (taxDueOrRefund.value < 0) {
          return (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{absValue.toFixed(2)}</Badge>
              <Badge variant="outline" className="text-green-600">
                Refund
              </Badge>
            </div>
          )
        } else if (taxDueOrRefund.value > 0) {
          return (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{absValue.toFixed(2)}</Badge>
              <Badge variant="outline" className="text-red-600">
                Due
              </Badge>
            </div>
          )
        } else {
          return '0.00'
        }
      },
    },
  ]
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Description</TableHead>
          {series.map(([label]) => (
            <TableHead key={label}>{label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={index}>
            <TableCell style={{ width: '240px' }}>{row.description}</TableCell>
            {series.map(([label, data], seriesIndex) => {
              const t = calculateTotals(data)
              return (
                <TableCell style={{ width: '320px' }} key={label}>
                  {row.getValue(t)}
                </TableCell>
              )
            })}
            <TableCell />
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
