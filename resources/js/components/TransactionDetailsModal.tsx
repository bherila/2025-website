'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { Textarea } from './ui/textarea'
import { Button } from './ui/button'
import type { AccountLineItem } from '@/data/finance/AccountLineItem'
import { fetchWrapper } from '../fetchWrapper'

interface TransactionDetailsModalProps {
  transaction: AccountLineItem
  isOpen: boolean
  onClose: () => void
  onSave?: (comment: string) => Promise<void>
}

export default function TransactionDetailsModal({ transaction, isOpen, onClose, onSave }: TransactionDetailsModalProps) {
  const [comment, setComment] = useState(transaction.t_comment || '')
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await fetchWrapper.post(`/api/finance/transactions/${transaction.t_id}/comment`, { comment });

      // Call optional onSave prop if provided
      if (onSave) {
        await onSave(comment)
      }

      onClose()
    } catch (error) {
      console.error('Failed to save transaction details', error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transaction Details</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-1 items-center gap-4">
            <Textarea
              placeholder="Add transaction details..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={5}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
