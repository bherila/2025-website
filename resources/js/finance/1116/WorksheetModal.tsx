'use client'

import currency from 'currency.js'
import { Calculator } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import { calculateApportionedInterest } from './k3-to-1116'
import type { ForeignTaxSummary } from './types'

interface WorksheetModalProps {
  open: boolean
  onClose: () => void
  /** Foreign tax summaries collected from all reviewed documents for the tax year. */
  foreignTaxSummaries: ForeignTaxSummary[]
}

/**
 * Form 1116 Apportionment Worksheet Modal.
 *
 * Assists the user in computing the asset-method apportionment for
 * Form 1116 Line 4b (apportioned investment interest expense).
 *
 * Formula (IRS Publication 514, Asset Method):
 *   Apportioned = TotalInterestExpense × (ForeignBasis / TotalBasis)
 */
export default function WorksheetModal({ open, onClose, foreignTaxSummaries }: WorksheetModalProps) {
  const [totalInterest, setTotalInterest] = useState('')
  const [foreignBasis, setForeignBasis] = useState('')
  const [totalBasis, setTotalBasis] = useState('')

  const totalForeignTax = useMemo(
    () => foreignTaxSummaries.reduce((sum, s) => currency(sum).add(s.totalForeignTaxPaid).value, 0),
    [foreignTaxSummaries],
  )

  const result = useMemo(() => {
    const ti = parseFloat(totalInterest) || 0
    const fb = parseFloat(foreignBasis) || 0
    const tb = parseFloat(totalBasis) || 0
    if (tb === 0) return null
    return calculateApportionedInterest(ti, fb, tb)
  }, [totalInterest, foreignBasis, totalBasis])

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Form 1116 Apportionment Worksheet
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Foreign tax summary table */}
          {foreignTaxSummaries.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-1">Foreign Taxes Paid (from reviewed documents)</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Foreign Tax</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {foreignTaxSummaries.map((s, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs capitalize">{s.sourceType.replace('_', '-')}</TableCell>
                      <TableCell className="text-xs">{s.country ?? '—'}</TableCell>
                      <TableCell className="text-xs capitalize">{s.category ?? '—'}</TableCell>
                      <TableCell className="text-xs text-right">
                        {currency(s.totalForeignTaxPaid).format()}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={3} className="text-xs font-semibold">
                      Total Foreign Taxes
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-right">
                      {currency(totalForeignTax).format()}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}

          {/* Asset method apportionment inputs */}
          <div>
            <p className="text-sm font-medium mb-2">
              Asset Method — Interest Expense Apportionment (Line 4b)
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              Apportioned Foreign Interest = Total Interest Expense × (Foreign Basis / Total Basis)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label htmlFor="total-interest" className="text-xs">
                  Total Investment Interest Expense ($)
                </Label>
                <Input
                  id="total-interest"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={totalInterest}
                  onChange={e => setTotalInterest(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="foreign-basis" className="text-xs">
                  Adjusted Basis of Foreign Assets ($)
                </Label>
                <Input
                  id="foreign-basis"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={foreignBasis}
                  onChange={e => setForeignBasis(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="grid gap-1 col-span-2">
                <Label htmlFor="total-basis" className="text-xs">
                  Adjusted Basis of All Assets ($)
                </Label>
                <Input
                  id="total-basis"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={totalBasis}
                  onChange={e => setTotalBasis(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className="bg-muted/40 rounded-md p-3 border border-muted-foreground/10">
              <p className="text-xs text-muted-foreground mb-1">
                Foreign / Total ratio: {(result.ratio * 100).toFixed(2)}%
              </p>
              <p className="text-sm font-medium">
                Apportioned Foreign Interest (Form 1116 Line 4b):{' '}
                <span className="font-bold">{currency(result.apportionedForeignInterest).format()}</span>
              </p>
            </div>
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
