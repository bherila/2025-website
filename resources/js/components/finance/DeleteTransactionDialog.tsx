'use client'

import currency from 'currency.js'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { AccountLineItem } from '@/data/finance/AccountLineItem'

interface DeleteTransactionDialogProps {
  transaction: AccountLineItem | null
  onClose: () => void
  onConfirm: (transactionId: string) => void
}

export function DeleteTransactionDialog({ transaction, onClose, onConfirm }: DeleteTransactionDialogProps) {
  return (
    <AlertDialog open={!!transaction} onOpenChange={() => onClose()}>
      <AlertDialogContent className="border-border bg-card">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-mono text-destructive">Delete Transaction?</AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            Are you sure you want to delete this transaction? This action cannot be undone.
            {transaction && (
              <div className="mt-4 p-3 bg-surface border border-border rounded-sm text-sm font-mono text-foreground space-y-1">
                <p><span className="text-muted-foreground uppercase text-[10px] tracking-wider inline-block w-24">Date:</span> {transaction.t_date}</p>
                <p><span className="text-muted-foreground uppercase text-[10px] tracking-wider inline-block w-24">Description:</span> {transaction.t_description}</p>
                <p><span className="text-muted-foreground uppercase text-[10px] tracking-wider inline-block w-24">Amount:</span> <span className={Number(transaction.t_amt) >= 0 ? "text-success" : "text-destructive"}>{currency(transaction.t_amt || 0).format()}</span></p>
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-border hover:bg-muted/50">Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              if (transaction) {
                onConfirm(transaction.t_id?.toString() || '')
                onClose()
              }
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
