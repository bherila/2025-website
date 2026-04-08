'use client'
import currency from 'currency.js'
import type { ReactNode } from 'react'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { calculateTax } from '@/lib/tax/taxBracket'

import type { fin_payslip } from './payslipDbCols'

// ─── Aggregation helpers ─────────────────────────────────────────────────────

function totalIncome(data: fin_payslip[]) {
  return data.reduce(
    (acc, row) =>
      acc
        .add(row.ps_salary ?? 0)
        .add(row.earnings_rsu ?? 0)
        .add(row.earnings_bonus ?? 0)
        .add(row.ps_vacation_payout ?? 0)
        .add(row.imp_ltd ?? 0)
        .add(row.imp_legal ?? 0)
        .add(row.imp_fitness ?? 0)
        .add(row.imp_other ?? 0),
    currency(0),
  )
}

function totalFedWH(data: fin_payslip[]) {
  return data.reduce(
    (acc, row) =>
      acc
        .add(row.ps_fed_tax ?? 0)
        .add(row.ps_fed_tax_addl ?? 0)
        .subtract(row.ps_fed_tax_refunded ?? 0),
    currency(0),
  )
}

function totalStateWH(data: fin_payslip[]) {
  return data.reduce(
    (acc, row) => acc.add(row.ps_state_tax ?? 0).add(row.ps_state_tax_addl ?? 0),
    currency(0),
  )
}

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmtCurrency(val: currency | number): string {
  return currency(val).format()
}

function fmtPct(numerator: currency, denominator: currency): string {
  if (denominator.value === 0) return 'N/A'
  return `${numerator.divide(denominator).multiply(100).value.toFixed(0)}%`
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  valueClass = 'text-foreground',
}: {
  label: string
  value: string
  sub?: string
  valueClass?: string
}) {
  return (
    <div className="border border-border bg-card rounded-sm p-3">
      <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5">{label}</div>
      <div className={`font-mono text-lg font-semibold leading-tight ${valueClass}`}>{value}</div>
      {sub && <div className="font-mono text-[10px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  )
}

// ─── Bracket form-block ───────────────────────────────────────────────────────

function BracketBlock({
  label,
  taxes,
}: {
  label: string
  taxes: { tax: currency; amt: currency; bracket: currency }[]
}) {
  return (
    <div className="border border-border bg-card rounded-sm overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-muted/30">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-info">
          {label}
        </span>
      </div>
      <div className="px-3 py-2 space-y-0">
        {taxes.map((t, i) => {
          const isLast = i === taxes.length - 1
          return (
            <div
              key={i}
              className={`flex items-baseline justify-between gap-3 py-1 font-mono text-[11px] ${
                isLast
                  ? 'border-t border-border mt-1 pt-2 font-semibold'
                  : 'border-b border-dashed border-border/50'
              }`}
            >
              <span className="text-muted-foreground">
                {fmtCurrency(t.amt)} @ {t.bracket.multiply(100).value.toFixed(0)}%
              </span>
              <span className={isLast ? 'text-primary' : 'text-foreground'}>{fmtCurrency(t.tax)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Table cell helpers ───────────────────────────────────────────────────────

function Td({
  children,
  right,
  className = '',
}: {
  children: ReactNode
  right?: boolean
  className?: string
}) {
  return (
    <TableCell
      className={`font-mono text-xs py-2 px-3 ${right ? 'text-right tabular-nums' : ''} ${className}`}
    >
      {children}
    </TableCell>
  )
}

function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <TableHead
      className={`font-mono text-[10px] uppercase tracking-wide text-muted-foreground py-2 px-3 ${right ? 'text-right' : ''}`}
    >
      {children}
    </TableHead>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TotalsTable({
  series,
  taxConfig,
  extraIncome = 0,
}: {
  series: [string, fin_payslip[]][]
  taxConfig: {
    year: string
    state: string
    filingStatus: 'Single' | 'Married' | 'Married Filing Separately' | 'Head of Household'
    standardDeduction: number
  }
  extraIncome?: number | Record<string, number>
}) {
  const calculateTotals = (label: string, data: fin_payslip[]) => {
    const extra = typeof extraIncome === 'number' ? extraIncome : (extraIncome[label] ?? 0)
    const income = totalIncome(data).add(extra)
    const fedWH = totalFedWH(data)
    const stateWH = taxConfig.state ? totalStateWH(data) : currency(0)
    const withheld = taxConfig.state ? stateWH : fedWH
    const estTaxIncome = income.subtract(taxConfig.standardDeduction)
    const { taxes, totalTax } = calculateTax(taxConfig.year, taxConfig.state, estTaxIncome, taxConfig.filingStatus)
    const taxDue = totalTax.subtract(withheld)
    return { income, fedWH, stateWH, withheld, estTaxIncome, taxes, totalTax, taxDue }
  }

  const allTotals = series.map(([label, data]) => ({ label, totals: calculateTotals(label, data) }))

  // Summary cards use the last (full-year) series
  const last = allTotals[allTotals.length - 1]?.totals

  // ── Summary cards ────────────────────────────────────────────────────────
  const summaryCards = last ? (
    <div className="grid grid-cols-2 gap-3 mb-5 sm:grid-cols-4">
      <SummaryCard
        label="Full Year Est. Income"
        value={fmtCurrency(last.income)}
        sub="Gross estimated income"
        valueClass="text-success"
      />
      <SummaryCard
        label="Total Est. Tax"
        value={fmtCurrency(last.totalTax)}
        sub={`Effective Rate: ${fmtPct(last.totalTax, last.estTaxIncome)}`}
        valueClass="text-destructive"
      />
      <SummaryCard
        label="Taxes Withheld"
        value={fmtCurrency(last.withheld)}
        sub={`Withholding Rate: ${fmtPct(last.withheld, last.income)}`}
        valueClass="text-primary"
      />
      {last.taxDue.value <= 0 ? (
        <SummaryCard
          label="Est. Tax Refund"
          value={fmtCurrency(Math.abs(last.taxDue.value))}
          sub="Overpayment"
          valueClass="text-success"
        />
      ) : (
        <SummaryCard
          label="Est. Tax Due"
          value={fmtCurrency(last.taxDue.value)}
          sub="Underpayment"
          valueClass="text-destructive"
        />
      )}
    </div>
  ) : null

  return (
    <div className="space-y-5">
      {summaryCards}

      {/* ── Main table ─────────────────────────────────────────────────── */}
      <div className="overflow-x-auto border border-border rounded-sm">
        <Table className="w-full">
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <Th>Description</Th>
              {allTotals.map(({ label }) => (
                <Th key={label} right>{label}</Th>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Estimated Income */}
            <TableRow className="border-border hover:bg-muted/30">
              <Td>Estimated Income</Td>
              {allTotals.map(({ label, totals }, i) => (
                <Td key={label} right className={i === allTotals.length - 1 ? 'text-success' : ''}>
                  {fmtCurrency(totals.income)}
                </Td>
              ))}
            </TableRow>

            {/* Standard Deduction */}
            <TableRow className="border-border hover:bg-muted/30">
              <Td>Standard Deduction</Td>
              {allTotals.map(({ label }, i) => (
                <Td key={label} right className={i === allTotals.length - 1 ? 'text-destructive' : ''}>
                  ({fmtCurrency(taxConfig.standardDeduction)})
                </Td>
              ))}
            </TableRow>

            {/* Taxable Income */}
            <TableRow className="border-border hover:bg-muted/30">
              <Td>Estimated Taxable Income</Td>
              {allTotals.map(({ label, totals }) => (
                <Td key={label} right>{fmtCurrency(totals.estTaxIncome)}</Td>
              ))}
            </TableRow>

            {/* Total Tax — subtotal row */}
            <TableRow className="border-t-2 border-border bg-success/5 hover:bg-success/10">
              <Td className="font-semibold text-success">Total Tax</Td>
              {allTotals.map(({ label, totals }) => (
                <Td key={label} right className="font-semibold text-success">
                  {fmtCurrency(totals.totalTax)}
                </Td>
              ))}
            </TableRow>

            {/* Effective Rate */}
            <TableRow className="border-border hover:bg-muted/30">
              <Td>Effective Tax Rate</Td>
              {allTotals.map(({ label, totals }, i) => (
                <Td
                  key={label}
                  right
                  className={i === allTotals.length - 1 ? 'text-primary font-semibold' : ''}
                >
                  {fmtPct(totals.totalTax, totals.estTaxIncome)}
                </Td>
              ))}
            </TableRow>

            {/* Taxes Withheld */}
            <TableRow className="border-border hover:bg-muted/30">
              <Td>Taxes Withheld</Td>
              {allTotals.map(({ label, totals }, i) => (
                <Td key={label} right className={i === allTotals.length - 1 ? 'text-success' : ''}>
                  {fmtCurrency(totals.withheld)}{' '}
                  <span className="text-muted-foreground text-[10px]">
                    ({fmtPct(totals.withheld, totals.income)})
                  </span>
                </Td>
              ))}
            </TableRow>

            {/* Est. Due / Refund — total row */}
            <TableRow className="border-t-2 border-primary bg-primary/5 font-semibold hover:bg-primary/10">
              <Td className="font-semibold text-primary">Est. Tax Due / (Refund)</Td>
              {allTotals.map(({ label, totals }) => {
                const due = totals.taxDue
                const isRefund = due.value < 0
                return (
                  <Td
                    key={label}
                    right
                    className={`font-semibold ${isRefund ? 'text-success' : due.value > 0 ? 'text-destructive' : 'text-foreground'}`}
                  >
                    {isRefund
                      ? `Refund ${fmtCurrency(Math.abs(due.value))}`
                      : due.value > 0
                        ? `Due ${fmtCurrency(due.value)}`
                        : '$0.00'}
                  </Td>
                )
              })}
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* ── Bracket blocks ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {allTotals.map(({ label, totals }) =>
          totals.taxes.length > 0 ? (
            <BracketBlock key={label} label={`${label} Brackets`} taxes={totals.taxes} />
          ) : null,
        )}
      </div>
    </div>
  )
}
