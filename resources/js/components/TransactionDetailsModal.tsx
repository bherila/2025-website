'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { Textarea } from './ui/textarea'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Button } from './ui/button'
import type { AccountLineItem } from '@/data/finance/AccountLineItem'
import { fetchWrapper } from '../fetchWrapper'

interface TransactionDetailsModalProps {
  transaction: AccountLineItem
  isOpen: boolean
  onClose: () => void
  onSave?: (updatedTransaction: Partial<AccountLineItem>) => Promise<void>
}

export default function TransactionDetailsModal({ transaction, isOpen, onClose, onSave }: TransactionDetailsModalProps) {
  const [isSaving, setIsSaving] = useState(false)

  // Helper to format numeric value for form input
  const formatNumericValue = (value: number | string | null | undefined): string => {
    if (value === null || value === undefined) return ''
    const num = typeof value === 'string' ? parseFloat(value) : value
    if (isNaN(num) || num === 0) return ''
    return num.toString()
  }

  const [comment, setComment] = useState(transaction.t_comment || '')
  const [description, setDescription] = useState(transaction.t_description || '')
  const [qty, setQty] = useState(formatNumericValue(transaction.t_qty))
  const [price, setPrice] = useState(formatNumericValue(transaction.t_price))
  const [commission, setCommission] = useState(formatNumericValue(transaction.t_commission))
  const [fee, setFee] = useState(formatNumericValue(transaction.t_fee))
  const [symbol, setSymbol] = useState(transaction.t_symbol || '')

  // Reset form when transaction changes
  useEffect(() => {
    setComment(transaction.t_comment || '')
    setDescription(transaction.t_description || '')
    setQty(formatNumericValue(transaction.t_qty))
    setPrice(formatNumericValue(transaction.t_price))
    setCommission(formatNumericValue(transaction.t_commission))
    setFee(formatNumericValue(transaction.t_fee))
    setSymbol(transaction.t_symbol || '')
  }, [transaction])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const updatedFields: Partial<AccountLineItem> = {
        t_comment: comment || null,
        t_description: description || null,
        t_qty: qty ? parseFloat(qty) : 0,
        t_price: price ? parseFloat(price) : 0,
        t_commission: commission ? parseFloat(commission) : 0,
        t_fee: fee ? parseFloat(fee) : 0,
        t_symbol: symbol || null,
      }

      await fetchWrapper.post(`/api/finance/transactions/${transaction.t_id}/update`, updatedFields);

      // Call optional onSave prop if provided
      if (onSave) {
        await onSave(updatedFields)
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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Transaction Details</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="description" className="text-right">
              Description
            </Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="symbol" className="text-right">
              Symbol
            </Label>
            <Input
              id="symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="qty" className="text-right">
              Qty
            </Label>
            <Input
              id="qty"
              type="number"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="price" className="text-right">
              Price
            </Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="commission" className="text-right">
              Commission
            </Label>
            <Input
              id="commission"
              type="number"
              step="0.01"
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="fee" className="text-right">
              Fee
            </Label>
            <Input
              id="fee"
              type="number"
              step="0.01"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="comment" className="text-right">
              Memo
            </Label>
            <Textarea
              id="comment"
              placeholder="Add transaction memo..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="col-span-3"
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
