'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { AccountLineItem } from '@/data/finance/AccountLineItem'
import { fetchWrapper } from '@/fetchWrapper'

// Common transaction types
const TRANSACTION_TYPES = [
  'Buy',
  'Sell',
  'Buy (Covered)',
  'Buy (Opening)',
  'Sell (Covered)',
  'Sell (Opening)',
  'Dividend',
  'Interest',
  'Fee',
  'Transfer',
  'Deposit',
  'Withdrawal',
  'Option Assignment',
  'Option Exercise',
  'Option Expiration',
  'Stock Split',
  'Reinvestment',
  'Other',
]

interface TransactionDetailsModalProps {
  transaction: AccountLineItem
  isOpen: boolean
  onClose: () => void
  onSave?: (updatedTransaction: Partial<AccountLineItem>) => Promise<void>
}

export default function TransactionDetailsModal({ transaction, isOpen, onClose, onSave }: TransactionDetailsModalProps) {
  const [isSaving, setIsSaving] = useState(false)

  // Helper to format numeric value for form input (as text)
  const formatNumericValue = (value: number | string | null | undefined): string => {
    if (value === null || value === undefined || value === '') return ''
    const num = typeof value === 'string' ? parseFloat(value) : value
    if (isNaN(num)) return ''
    return num.toString()
  }

  // Helper to format date for input[type="date"]
  const formatDateValue = (value: string | null | undefined): string => {
    if (!value) return ''
    // Handle various date formats
    const date = new Date(value)
    if (isNaN(date.getTime())) return ''
    return date.toISOString().split('T')[0] || ''
  }

  const [transactionDate, setTransactionDate] = useState(formatDateValue(transaction.t_date))
  const [transactionType, setTransactionType] = useState(transaction.t_type || '')
  const [amount, setAmount] = useState(formatNumericValue(transaction.t_amt))
  const [comment, setComment] = useState(transaction.t_comment || '')
  const [description, setDescription] = useState(transaction.t_description || '')
  const [qty, setQty] = useState(formatNumericValue(transaction.t_qty))
  const [price, setPrice] = useState(formatNumericValue(transaction.t_price))
  const [commission, setCommission] = useState(formatNumericValue(transaction.t_commission))
  const [fee, setFee] = useState(formatNumericValue(transaction.t_fee))
  const [symbol, setSymbol] = useState(transaction.t_symbol || '')

  // Reset form when transaction changes
  useEffect(() => {
    setTransactionDate(formatDateValue(transaction.t_date))
    setTransactionType(transaction.t_type || '')
    setAmount(formatNumericValue(transaction.t_amt))
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
        ...(transactionDate ? { t_date: transactionDate } : {}),
        t_type: transactionType || null,
        t_amt: amount ? parseFloat(amount) : 0,
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
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transaction Details</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="t_date" className="text-right">
              Date
            </Label>
            <Input
              id="t_date"
              type="date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="t_type" className="text-right">
              Type
            </Label>
            <div className="col-span-3">
              <Select value={transactionType} onValueChange={setTransactionType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  {TRANSACTION_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="t_amt" className="text-right">
              Amount
            </Label>
            <Input
              id="t_amt"
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="col-span-3"
              placeholder="e.g., 1000.00 or -500.50"
            />
          </div>
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
              type="text"
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
              type="text"
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
              type="text"
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
              type="text"
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
