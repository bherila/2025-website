'use client'

import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import type { LotSale } from '@/lib/finance/washSaleEngine'
import { goToTransaction } from '@/lib/financeRouteBuilder'

function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '—'
    try {
        const d = new Date(dateStr + 'T00:00:00')
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
        return dateStr
    }
}

function calcDaysBetween(a: string, b: string): number {
    const dateA = new Date(a + 'T00:00:00')
    const dateB = new Date(b + 'T00:00:00')
    return Math.round(Math.abs(dateA.getTime() - dateB.getTime()) / 86400000)
}

interface WashSaleDetailModalProps {
    lot: LotSale
    isOpen: boolean
    onClose: () => void
}

/**
 * Modal dialog that shows the details of the disqualifying acquisition
 * (wash purchase) that caused a wash sale for a given lot.
 *
 * Displays the sale date, purchase date, number of days between them,
 * and the IRS rule that was applied. Includes a "Go to" button that
 * navigates to the purchase transaction in the account's transactions page.
 */
export function WashSaleDetailModal({ lot, isOpen, onClose }: WashSaleDetailModalProps) {
    const days =
        lot.washPurchaseDate && lot.dateSold
            ? calcDaysBetween(lot.dateSold, lot.washPurchaseDate)
            : null

    const handleGoTo = () => {
        if (lot.washPurchaseTransactionId != null && lot.washPurchaseAccountId != null) {
            const year = lot.washPurchaseDate
                ? new Date(lot.washPurchaseDate + 'T00:00:00').getFullYear()
                : undefined
            goToTransaction(lot.washPurchaseAccountId, lot.washPurchaseTransactionId, year)
        }
    }

    const canGoTo = lot.washPurchaseTransactionId != null && lot.washPurchaseAccountId != null

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Wash Sale Details</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Sale info */}
                    <div>
                        <h4 className="text-sm font-semibold mb-1">Sale</h4>
                        <div className="text-sm space-y-1">
                            <p>
                                <span className="font-medium">Security:</span>{' '}
                                <span className="text-muted-foreground">{lot.description}</span>
                            </p>
                            <p>
                                <span className="font-medium">Date sold:</span>{' '}
                                <span className="text-muted-foreground">{formatDate(lot.dateSold)}</span>
                            </p>
                        </div>
                    </div>

                    {/* Disqualifying acquisition */}
                    <div>
                        <h4 className="text-sm font-semibold mb-1">Disqualifying Acquisition</h4>
                        <div className="text-sm space-y-1">
                            {lot.washPurchaseDescription && (
                                <p>
                                    <span className="font-medium">Description:</span>{' '}
                                    <span className="text-muted-foreground">{lot.washPurchaseDescription}</span>
                                </p>
                            )}
                            <p>
                                <span className="font-medium">Purchase date:</span>{' '}
                                <span className="text-muted-foreground">{formatDate(lot.washPurchaseDate)}</span>
                            </p>
                            {days !== null && (
                                <p>
                                    <span className="font-medium">Days between sale and acquisition:</span>{' '}
                                    <span className="text-muted-foreground">
                                        {days} day{days !== 1 ? 's' : ''}
                                    </span>
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Rule applied */}
                    {lot.washSaleReason && (
                        <div>
                            <h4 className="text-sm font-semibold mb-1">Rule Applied</h4>
                            <p className="text-sm text-muted-foreground">{lot.washSaleReason}</p>
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    {canGoTo && (
                        <Button variant="outline" onClick={handleGoTo}>
                            Go to Transaction
                        </Button>
                    )}
                    <Button variant="outline" onClick={onClose}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
