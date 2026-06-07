'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Form4952CalculationRow, TaxFactSource } from '@/types/generated/tax-preview-facts'

import { fmtAmt, NavGlyphIcon } from './tax-preview-primitives'

interface Form4952SourceDetailModalProps {
  open: boolean
  title: string
  description?: string
  sources: TaxFactSource[]
  calculationRows?: Form4952CalculationRow[]
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
  calculationRows = [],
  amountMode = 'signed',
  onGoToSource,
  onClose,
}: Form4952SourceDetailModalProps) {
  const hasCalculationRows = calculationRows.length > 0
  const hasSources = sources.length > 0

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">{title}</DialogTitle>
        </DialogHeader>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
        {!hasCalculationRows && !hasSources ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No sources found.</p>
        ) : (
          <div className="space-y-3">
            {hasCalculationRows && (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Calculation</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-8 text-right" aria-label="Actions" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {calculationRows.map((row, index) => (
                      <TableRow key={`${row.label}-${index}`} className={row.role === 'result' ? 'bg-primary/5' : undefined}>
                        <TableCell className="text-sm">
                          <div className={row.role === 'result' ? 'font-semibold' : 'font-medium'}>{row.label}</div>
                          {row.note && <div className="text-[11px] text-muted-foreground leading-snug">{row.note}</div>}
                        </TableCell>
                        <TableCell className={`text-right text-sm font-currency tabular-nums ${row.amount < 0 ? 'text-destructive' : 'text-success'}`}>
                          {fmtAmt(row.amount)}
                        </TableCell>
                        <TableCell aria-hidden="true" />
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {hasSources && (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-8 text-right" aria-label="Actions" />
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
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="h-7 w-7 border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-700/70 dark:text-amber-300 dark:hover:bg-amber-950/40 dark:hover:text-amber-200"
                                  aria-label={goToLabel(source)}
                                  onClick={() => { onGoToSource(source); onClose() }}
                                >
                                  <NavGlyphIcon glyph={source.taxDocumentId != null ? 'window' : 'column'} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{goToLabel(source)}</TooltipContent>
                            </Tooltip>
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
