'use client'

import { ArrowRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { TaxFactSource } from '@/types/generated/tax-preview-facts'

import { fmtAmt } from './tax-preview-primitives'

interface Form4952SourceDetailModalProps {
  open: boolean
  title: string
  description?: string
  sources: TaxFactSource[]
  /** How to render each source amount: signed (as-is), absolute, or expense (always negative). */
  amountMode?: 'signed' | 'absolute' | 'expense'
  /** Invoked with a source when the user clicks its "go to source" button. */
  onGoToSource: (source: TaxFactSource) => void
  onClose: () => void
}

function displayAmount(amount: number, mode: 'signed' | 'absolute' | 'expense'): number {
  if (mode === 'absolute') {
    return Math.abs(amount)
  }
  if (mode === 'expense') {
    return -Math.abs(amount)
  }
  return amount
}

function goToLabel(source: TaxFactSource): string {
  return source.formType === 'k1' ? 'Go to K-1' : 'Go to source'
}

/**
 * Lists the individual sources behind a Form 4952 line (e.g. line 4a gross investment
 * income from K-1s, or line 4b qualified dividends) and lets the user jump to each one's
 * source document or schedule.
 */
export default function Form4952SourceDetailModal({
  open,
  title,
  description,
  sources,
  amountMode = 'signed',
  onGoToSource,
  onClose,
}: Form4952SourceDetailModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">{title}</DialogTitle>
        </DialogHeader>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
        {sources.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No sources found.</p>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Go to source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((source) => (
                  <TableRow key={source.id}>
                    <TableCell className="text-sm">
                      <div className="font-medium">{source.label}</div>
                      {source.notes && <div className="text-[11px] text-muted-foreground leading-snug">{source.notes}</div>}
                    </TableCell>
                    <TableCell className="text-right text-sm font-currency tabular-nums">
                      {fmtAmt(displayAmount(source.amount, amountMode))}
                    </TableCell>
                    <TableCell className="text-right">
                      {source.taxDocumentId != null || source.formType === '1099_div' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-xs"
                          onClick={() => { onGoToSource(source); onClose() }}
                        >
                          {goToLabel(source)}
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
