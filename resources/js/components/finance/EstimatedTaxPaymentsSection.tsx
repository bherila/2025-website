'use client'

import currency from 'currency.js'

import { fmtAmt, FormBlock, FormLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { EstimatedTaxPaymentsData } from '@/types/finance/tax-return'

interface EstimatedTaxPaymentsSectionProps {
  selectedYear: number
  priorYearTax: number
  onPriorYearTaxChange: (value: number) => void
  estimatedTaxPayments: EstimatedTaxPaymentsData
}

export default function EstimatedTaxPaymentsSection({
  selectedYear,
  priorYearTax,
  onPriorYearTaxChange,
  estimatedTaxPayments,
}: EstimatedTaxPaymentsSectionProps) {
  const { planningYear, safeHarborAmount, expectedWithholding, netDue, quarterlyPayments } = estimatedTaxPayments

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^0-9.]/g, '')
    const n = parseFloat(raw)
    onPriorYearTaxChange(isNaN(n) ? 0 : n)
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold mt-4">
        Estimated Tax Payments — {planningYear} Planning
      </h2>
      <p className="text-sm text-muted-foreground">
        Safe harbor method: 110% of {selectedYear} total tax, divided into 4 equal quarterly payments.
        Due dates: April 15, June 15, September 15 ({planningYear}), and January 15 ({planningYear + 1}).
      </p>

      <div className="max-w-sm">
        <label className="text-sm font-medium" htmlFor="prior-year-tax-input">
          {selectedYear} Total Tax (prior year)
        </label>
        <div className="relative mt-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
          <Input
            id="prior-year-tax-input"
            className="pl-6 font-mono"
            value={priorYearTax === 0 ? '' : String(priorYearTax)}
            placeholder="0"
            onChange={handleInputChange}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Enter your {selectedYear} Form 1040 Line 24 total tax.
        </p>
      </div>

      <FormBlock title="Safe Harbor Computation (110% Method)">
        <FormLine
          label={`${selectedYear} total tax`}
          value={priorYearTax}
        />
        <FormTotalLine
          label="Safe harbor amount (110%)"
          value={safeHarborAmount}
        />
        <FormLine
          label={`Expected ${planningYear} withholding (estimated from payslips)`}
          value={-expectedWithholding}
        />
        <FormTotalLine
          label="Net estimated tax due"
          value={netDue}
          double
        />
      </FormBlock>

      <div>
        <h3 className="text-sm font-semibold mb-2">{planningYear} Payment Schedule</h3>
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Quarter</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quarterlyPayments.map((payment) => (
                <TableRow key={payment.paymentNumber}>
                  <TableCell className="font-mono text-sm">Q{payment.paymentNumber}</TableCell>
                  <TableCell className="text-sm">{payment.dueDate}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {priorYearTax > 0
                      ? currency(payment.amount).format()
                      : <span className="text-muted-foreground">—</span>
                    }
                  </TableCell>
                </TableRow>
              ))}
              {priorYearTax > 0 && (
                <TableRow className="font-semibold bg-muted/30">
                  <TableCell colSpan={2} className="text-sm">Total estimated payments</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {currency(netDue).format()}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {priorYearTax === 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            Enter your {selectedYear} total tax above to see quarterly payment amounts.
          </p>
        )}
        {priorYearTax > 0 && netDue === 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            Expected withholding covers the full safe harbor amount — no additional quarterly payments needed.
          </p>
        )}
      </div>

      {priorYearTax > 0 && (
        <p className="text-xs text-muted-foreground">
          Safe harbor amount: {fmtAmt(safeHarborAmount)} (110% × {fmtAmt(priorYearTax)}).
          Pay via IRS Direct Pay or EFTPS. Mark calendar reminders for each due date.
        </p>
      )}
    </div>
  )
}
