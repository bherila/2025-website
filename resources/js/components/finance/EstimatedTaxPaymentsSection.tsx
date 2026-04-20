'use client'

import currency from 'currency.js'
import type { ChangeEvent } from 'react'

import {
  fmtAmt,
  FormBlock,
  FormLine,
  FormTotalLine,
  parseCurrencyInput,
} from '@/components/finance/tax-preview-primitives'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { EstimatedTaxPaymentsData } from '@/types/finance/tax-return'

interface EstimatedTaxPaymentsSectionProps {
  planningYear: number
  priorYearTax: number
  priorYearAgi: number
  onPriorYearTaxChange: (value: number) => void
  onPriorYearAgiChange: (value: number) => void
  estimatedTaxPayments: EstimatedTaxPaymentsData | undefined
  showMfsUnsupportedNotice: boolean
}

export default function EstimatedTaxPaymentsSection({
  planningYear,
  priorYearTax,
  priorYearAgi,
  onPriorYearTaxChange,
  onPriorYearAgiChange,
  estimatedTaxPayments,
  showMfsUnsupportedNotice,
}: EstimatedTaxPaymentsSectionProps) {
  const selectedYear = planningYear - 1
  const multiplier = estimatedTaxPayments?.multiplier ?? (priorYearAgi > 150_000 ? 1.1 : 1)
  const agiThresholdApplied = estimatedTaxPayments?.agiThresholdApplied ?? 150_000
  const safeHarborAmount = estimatedTaxPayments?.safeHarborAmount ?? 0
  const expectedWithholding = estimatedTaxPayments?.expectedWithholding ?? 0
  const netDue = estimatedTaxPayments?.netDue ?? 0
  const quarterlyPayments = estimatedTaxPayments?.quarterlyPayments ?? []
  const hasInput = priorYearAgi > 0 || priorYearTax > 0
  const multiplierPercent = Math.round(multiplier * 100)
  const agiThresholdMessage = priorYearAgi > agiThresholdApplied
    ? `Prior year AGI ${fmtAmt(priorYearAgi)} exceeds ${fmtAmt(agiThresholdApplied)} threshold → ${multiplierPercent}% applies.`
    : `Prior year AGI ${fmtAmt(priorYearAgi)} is at or below ${fmtAmt(agiThresholdApplied)} threshold → ${multiplierPercent}% applies.`

  function handleTaxInputChange(event: ChangeEvent<HTMLInputElement>) {
    onPriorYearTaxChange(parseCurrencyInput(event.target.value))
  }

  function handleAgiInputChange(event: ChangeEvent<HTMLInputElement>) {
    onPriorYearAgiChange(parseCurrencyInput(event.target.value))
  }

  return (
    <div className="space-y-4">
      <h2 className="mt-4 text-lg font-semibold">
        Estimated Tax Payments — {planningYear} Planning
      </h2>
      {showMfsUnsupportedNotice ? (
        <p className="text-sm text-muted-foreground">
          Estimated tax planning depends on filing-status-specific safe harbor thresholds.
          Due dates: April 15, June 15, September 15, {planningYear}, and January 15, {planningYear + 1}.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Safe harbor method: {multiplierPercent}% of {selectedYear} total tax, divided into four quarterly payments.
          Due dates: April 15, June 15, September 15, {planningYear}, and January 15, {planningYear + 1}.
        </p>
      )}
      {!showMfsUnsupportedNotice && hasInput && (
        <p className="text-xs text-muted-foreground">{agiThresholdMessage}</p>
      )}

      <div className="grid gap-4 md:grid-cols-2 md:max-w-3xl">
        <div>
          <label className="text-sm font-medium" htmlFor="prior-year-agi-input">
            Prior Year AGI
          </label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <Input
              id="prior-year-agi-input"
              className="pl-6 font-mono"
              value={priorYearAgi === 0 ? '' : String(priorYearAgi)}
              placeholder="0"
              onChange={handleAgiInputChange}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Enter your {selectedYear} Form 1040 Line 11 adjusted gross income.
          </p>
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="prior-year-tax-input">
            Prior Year Total Tax
          </label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <Input
              id="prior-year-tax-input"
              className="pl-6 font-mono"
              value={priorYearTax === 0 ? '' : String(priorYearTax)}
              placeholder="0"
              onChange={handleTaxInputChange}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Enter your {selectedYear} Form 1040 Line 24 total tax.
          </p>
        </div>
      </div>

      {showMfsUnsupportedNotice ? (
        <Alert>
          <AlertDescription>
            Married Filing Separately is not yet supported in this estimated tax calculator.
            Because Tax Preview does not currently distinguish MFJ from MFS here, safe harbor thresholds
            and payment amounts are hidden for married users to avoid showing an incorrect result.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <FormBlock title={`Safe Harbor Computation (${multiplierPercent}% Method)`}>
            <FormLine label={`${selectedYear} prior year AGI`} value={priorYearAgi} />
            <FormLine label={`${selectedYear} prior year total tax`} value={priorYearTax} />
            <FormTotalLine
              label={`Safe harbor amount (${multiplierPercent}%)`}
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
            <h3 className="mb-2 text-sm font-semibold">{planningYear} Payment Schedule</h3>
            <div className="overflow-hidden rounded-md border">
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
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {priorYearTax > 0 && (
                    <TableRow className="bg-muted/30 font-semibold">
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
              <p className="mt-2 text-xs text-muted-foreground">
                Enter your {selectedYear} prior year AGI and total tax above to see quarterly payment amounts.
              </p>
            )}
            {priorYearTax > 0 && netDue === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Expected withholding covers the full safe harbor amount — no additional quarterly payments needed.
              </p>
            )}
          </div>

          {priorYearTax > 0 && (
            <p className="text-xs text-muted-foreground">
              Safe harbor amount: {fmtAmt(safeHarborAmount)} ({multiplierPercent}% × {fmtAmt(priorYearTax)}).
              Q4 may differ by a few cents so the four payments add up exactly to the net estimated tax due.
            </p>
          )}
        </>
      )}
    </div>
  )
}
