'use client'

import currency from 'currency.js'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

import { fmtAmt } from '@/components/finance/tax-preview-primitives'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export interface TaxFactSourceLike {
  id?: string
  label: string
  amount: number
  formType?: string | null
  notes?: string | null
  reviewAction?: string | null
  taxDocumentId?: number | null
  isReviewed?: boolean
}

export function taxFactSourcesNeedReview(sources: readonly TaxFactSourceLike[]): boolean {
  return sources.some((source) => source.isReviewed === false)
}

function sourceTargetLabel(source: TaxFactSourceLike): string {
  return source.formType?.replaceAll('_', '-').toUpperCase() ?? 'source'
}

function displayAmount(amount: number, amountMode: 'signed' | 'absolute'): string {
  if (amountMode === 'absolute') {
    return currency(Math.abs(amount)).format()
  }

  return fmtAmt(amount)
}

interface TaxFactSourcesModalProps {
  open: boolean
  title: string
  sources: readonly TaxFactSourceLike[]
  total: number
  onClose: () => void
  onOpenDoc?: (docId: number) => void
  referenceText?: ReactNode
  amountMode?: 'signed' | 'absolute'
  positiveAmountTone?: 'success' | 'destructive'
}

export function TaxFactSourcesModal({
  open,
  title,
  sources,
  total,
  onClose,
  onOpenDoc,
  referenceText,
  amountMode = 'signed',
  positiveAmountTone = 'success',
}: TaxFactSourcesModalProps) {
  const hasUnreviewedSources = taxFactSourcesNeedReview(sources)
  const reviewedTone = (amount: number): string => {
    if (amount < 0) {
      return 'text-destructive'
    }

    return positiveAmountTone === 'destructive' ? 'text-destructive' : 'text-success'
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {sources.map((source, index) => {
            const isReviewed = source.isReviewed !== false

            return (
            <div
              key={source.id ?? `${source.label}-${index}`}
              className={`rounded-md border p-3 ${isReviewed ? 'border-border/60' : 'border-warning/50 bg-warning/10'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="text-sm font-medium leading-snug">{source.label}</div>
                  {!isReviewed && (
                    <div className="text-xs font-medium text-warning">Estimated — review required</div>
                  )}
                  {source.notes && <div className="text-xs leading-snug text-muted-foreground">{source.notes}</div>}
                  {!isReviewed && source.reviewAction && (
                    <div className="text-xs leading-snug text-warning">{source.reviewAction}</div>
                  )}
                </div>
                <div className={`font-currency shrink-0 text-right text-sm tabular-nums ${isReviewed ? reviewedTone(source.amount) : 'text-warning'}`}>
                  {displayAmount(source.amount, amountMode)}
                </div>
              </div>
              {source.taxDocumentId != null && onOpenDoc && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 h-7 gap-1.5 px-2 text-xs"
                  onClick={() => {
                    onOpenDoc(source.taxDocumentId!)
                    onClose()
                  }}
                >
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  Go to {sourceTargetLabel(source)}
                </Button>
              )}
            </div>
            )
          })}
          <div className="flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-semibold">
            <span>Total</span>
            <span className={`font-currency tabular-nums ${hasUnreviewedSources ? 'text-warning' : reviewedTone(total)}`}>
              {displayAmount(total, amountMode)}
            </span>
          </div>
          {referenceText && (
            <p className="text-xs text-muted-foreground">{referenceText}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
