'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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

interface NewTransactionModalProps {
  accountId: number
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function NewTransactionModal({ accountId, isOpen, onClose, onSuccess }: NewTransactionModalProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().split('T')[0])
  const [transactionType, setTransactionType] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [symbol, setSymbol] = useState('')
  const [qty, setQty] = useState('')
  const [price, setPrice] = useState('')
  const [commission, setCommission] = useState('')
  const [fee, setFee] = useState('')
  const [comment, setComment] = useState('')

  const resetForm = () => {
    setTransactionDate(new Date().toISOString().split('T')[0])
    setTransactionType('')
    setAmount('')
    setDescription('')
    setSymbol('')
    setQty('')
    setPrice('')
    setCommission('')
    setFee('')
    setComment('')
    setError(null)
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleSave = async () => {
    setError(null)

    // Validation
    if (!transactionDate) {
      setError('Date is required')
      return
    }

    setIsSaving(true)
    try {
      const newTransaction = {
        t_date: transactionDate,
        t_type: transactionType || null,
        t_amt: amount ? parseFloat(amount) : 0,
        t_description: description || null,
        t_symbol: symbol || null,
        t_qty: qty ? parseFloat(qty) : 0,
        t_price: price ? parseFloat(price) : 0,
        t_commission: commission ? parseFloat(commission) : 0,
        t_fee: fee ? parseFloat(fee) : 0,
        t_comment: comment || null,
      }

      await fetchWrapper.post(`/api/finance/${accountId}/transaction`, newTransaction)

      if (onSuccess) {
        onSuccess()
      }
      handleClose()
    } catch (err) {
      console.error('Failed to create transaction', err)
      setError('Failed to create transaction. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Transaction</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {error && (
            <div className="bg-destructive/15 text-destructive px-4 py-2 rounded-md text-sm">
              {error}
            </div>
          )}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="t_date" className="text-right">
              Date <span className="text-destructive">*</span>
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
          <Button type="button" variant="outline" onClick={handleClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Creating...' : 'Create Transaction'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
