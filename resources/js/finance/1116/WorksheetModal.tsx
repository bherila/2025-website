'use client'

import currency from 'currency.js'
import { Calculator, Loader2, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

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
import { fetchWrapper } from '@/fetchWrapper'

import { calculateApportionedInterest } from './k3-to-1116'
import type { ForeignTaxSummary } from './types'

interface WorksheetModalProps {
  open: boolean
  onClose: () => void
  /** Foreign tax summaries collected from all reviewed documents for the tax year. */
  foreignTaxSummaries: ForeignTaxSummary[]
  /** Tax year for basis discovery (used to filter lots held as-of year-end). */
  taxYear?: number
}

interface Lot {
  lot_id: number
  acct_id: number
  cost_basis: string | number
  symbol: string
}

/**
 * Form 1116 Apportionment Worksheet Modal.
 */
export default function WorksheetModal({ open, onClose, foreignTaxSummaries, taxYear }: WorksheetModalProps) {
  const [totalInterest, setTotalInterest] = useState('')
  const [foreignBasis, setForeignBasis] = useState('')
  const [totalBasis, setTotalBasis] = useState('')
  const [loadingBasis, setLoadingBasis] = useState(false)
  const [suggestedValues, setSuggestedValues] = useState<{ foreign: number; total: number } | null>(null)

  const totalForeignTax = useMemo(
    () => foreignTaxSummaries.reduce((sum, s) => currency(sum).add(s.totalForeignTaxPaid).value, 0),
    [foreignTaxSummaries],
  )

  const fetchBasisDiscovery = useCallback(async () => {
    if (!open) return
    setLoadingBasis(true)
    try {
      // Pass as_of=YYYY-12-31 when a tax year is known so the backend returns lots
      // held as of year-end (purchase_date <= as_of AND sale_date IS NULL OR > as_of).
      const asOf = taxYear ? `${taxYear}-12-31` : null
      const url = asOf ? `/api/finance/all/lots?as_of=${asOf}` : '/api/finance/all/lots?status=open'
      const data = await fetchWrapper.get(url) as { lots: Lot[] }
      const lots = data.lots || []
      
      // Total assets: sum of cost_basis for ALL open lots
      const total = lots.reduce((sum, lot) => currency(sum).add(lot.cost_basis).value, 0)
      
      // Foreign assets: sum of cost_basis for lots in accounts that have foreign tax
      const foreignAccountIds = new Set(foreignTaxSummaries.map(s => s.accountId).filter(Boolean))
      const foreign = lots
        .filter(lot => foreignAccountIds.has(lot.acct_id))
        .reduce((sum, lot) => currency(sum).add(lot.cost_basis).value, 0)
      
      setSuggestedValues({ foreign, total })
    } catch {
      toast.error('Failed to discover adjusted basis from lots')
    } finally {
      setLoadingBasis(false)
    }
  }, [open, foreignTaxSummaries, taxYear])

  useEffect(() => {
    fetchBasisDiscovery()
  }, [fetchBasisDiscovery])

  const applySuggestions = () => {
    if (suggestedValues) {
      setForeignBasis(String(suggestedValues.foreign))
      setTotalBasis(String(suggestedValues.total))
    }
  }

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
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">
                Asset Method — Interest Expense Apportionment (Line 4b)
              </p>
              {suggestedValues && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[10px] gap-1 text-primary hover:text-primary hover:bg-primary/5"
                  onClick={applySuggestions}
                  disabled={loadingBasis}
                >
                  {loadingBasis ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  Use Suggested Values
                </Button>
              )}
            </div>
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
                <div className="relative">
                  <Input
                    id="foreign-basis"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={foreignBasis}
                    onChange={e => setForeignBasis(e.target.value)}
                    className="h-8 text-sm pr-16"
                  />
                  {suggestedValues && !foreignBasis && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
                      Sug: {currency(suggestedValues.foreign).format()}
                    </span>
                  )}
                </div>
              </div>
              <div className="grid gap-1 col-span-2">
                <Label htmlFor="total-basis" className="text-xs">
                  Adjusted Basis of All Assets ($)
                </Label>
                <div className="relative">
                  <Input
                    id="total-basis"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={totalBasis}
                    onChange={e => setTotalBasis(e.target.value)}
                    className="h-8 text-sm pr-20"
                  />
                  {suggestedValues && !totalBasis && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
                      Sug: {currency(suggestedValues.total).format()}
                    </span>
                  )}
                </div>
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
