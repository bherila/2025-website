'use client'

import currency from 'currency.js'

import type { fin_payslip } from '@/components/payslip/payslipDbCols'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface PayslipDataSourceModalProps {
  open: boolean
  /** Title suffix shown after "Data Source —" */
  label: string
  payslips: fin_payslip[]
  /** Return the monetary contribution of a single payslip for this field. */
  valueGetter: (p: fin_payslip) => currency
  onClose: () => void
}

/**
 * Shared modal that lists the payslip rows that contributed to a computed value.
 * Used by TaxPreviewPage (W-2 Income Summary) and TaxDocumentReviewModal (W-2 comparison).
 */
export default function PayslipDataSourceModal({
  open,
  label,
  payslips,
  valueGetter,
  onClose,
}: PayslipDataSourceModalProps) {
  const rows = payslips
    .map(p => ({ payslip: p, value: valueGetter(p) }))
    .filter(r => r.value.value !== 0)
  const total = rows.reduce((acc, r) => acc.add(r.value), currency(0))

  return (
    <Dialog open={open} onOpenChange={isOpen => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Data Source — {label}</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto max-h-[60vh]">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No payslip contributions found for this field.
            </p>
          ) : (
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>Pay Date</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono">{r.payslip.pay_date}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.payslip.period_start} – {r.payslip.period_end}
                    </TableCell>
                    <TableCell className="text-right font-mono">{r.value.format()}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold bg-muted/30">
                  <TableCell colSpan={2}>Total ({rows.length} payslips)</TableCell>
                  <TableCell className="text-right font-mono">{total.format()}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
