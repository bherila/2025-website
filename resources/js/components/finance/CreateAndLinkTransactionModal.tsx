'use client'

import currency from 'currency.js'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fetchWrapper } from '@/fetchWrapper'

interface Account {
  acct_id: number
  acct_name: string
  when_closed: string | null
}

interface CreateAndLinkTransactionModalProps {
  isOpen: boolean
  onClose: () => void
  /** The source transaction we're creating a match for */
  sourceTransactionId: number
  sourceDate: string
  sourceAmount: number | string
  sourceDescription: string
  /** Account ID of the source transaction (excluded from account selector) */
  sourceAccountId: number
  onSuccess: () => void
}

export default function CreateAndLinkTransactionModal({
  isOpen,
  onClose,
  sourceTransactionId,
  sourceDate,
  sourceAmount,
  sourceDescription,
  sourceAccountId,
  onSuccess,
}: CreateAndLinkTransactionModalProps) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [transactionDate, setTransactionDate] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pre-fill form when modal opens
  useEffect(() => {
    if (isOpen) {
      const negatedAmount = currency(sourceAmount).multiply(-1).value
      const dateStr = sourceDate ? sourceDate.split(/[ T]/)[0] : new Date().toISOString().split('T')[0]
      setTransactionDate(dateStr ?? '')
      setAmount(String(negatedAmount))
      setDescription(sourceDescription || '')
      setError(null)
      setSelectedAccountId('')
    }
  }, [isOpen, sourceDate, sourceAmount, sourceDescription])

  // Fetch accounts when modal opens
  const fetchAccounts = useCallback(async () => {
    setLoadingAccounts(true)
    try {
      const data = await fetchWrapper.get('/api/finance/accounts')
      // Flatten all account categories and filter out closed accounts & source account
      const allAccounts: Account[] = [
        ...(data.assetAccounts || []),
        ...(data.liabilityAccounts || []),
        ...(data.retirementAccounts || []),
      ].filter((a: Account) => !a.when_closed && a.acct_id !== sourceAccountId)
      setAccounts(allAccounts)
    } catch (err) {
      console.error('Failed to load accounts:', err)
      setError('Failed to load accounts')
    } finally {
      setLoadingAccounts(false)
    }
  }, [sourceAccountId])

  useEffect(() => {
    if (isOpen) {
      fetchAccounts()
    }
  }, [isOpen, fetchAccounts])

  const handleSave = async () => {
    if (!selectedAccountId) {
      setError('Please select a destination account')
      return
    }
    if (!transactionDate) {
      setError('Date is required')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      // 1. Create the transaction in the selected account
      const createResult = await fetchWrapper.post(`/api/finance/${selectedAccountId}/transaction`, {
        t_date: transactionDate,
        t_amt: parseFloat(amount),
        t_description: description || null,
        t_type: 'Transfer',
      })

      const newTransactionId = createResult.t_id

      // 2. Link the new transaction to the source
      const sourceAmt = parseFloat(String(sourceAmount))
      const parentId = sourceAmt < 0 ? sourceTransactionId : newTransactionId
      const childId = sourceAmt < 0 ? newTransactionId : sourceTransactionId

      await fetchWrapper.post('/api/finance/transactions/link', {
        parent_t_id: parentId,
        child_t_id: childId,
      })

      // 3. Notify parent and close
      onSuccess()
      onClose()
    } catch (err) {
      console.error('Failed to create and link transaction:', err)
      setError(err instanceof Error ? err.message : 'Failed to create and link transaction')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Matching Transaction</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {error && (
            <div className="bg-destructive/15 text-destructive px-4 py-2 rounded-md text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="dest-account" className="text-right">
              Account <span className="text-destructive">*</span>
            </Label>
            <div className="col-span-3">
              <Select
                value={selectedAccountId}
                onValueChange={setSelectedAccountId}
                disabled={loadingAccounts}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingAccounts ? 'Loading accounts...' : 'Select account...'} />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((acct) => (
                    <SelectItem key={acct.acct_id} value={String(acct.acct_id)}>
                      {acct.acct_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="txn-date" className="text-right">
              Date <span className="text-destructive">*</span>
            </Label>
            <Input
              id="txn-date"
              type="date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              className="col-span-3"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="txn-amount" className="text-right">
              Amount <span className="text-destructive">*</span>
            </Label>
            <Input
              id="txn-amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="col-span-3"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="txn-description" className="text-right">
              Description
            </Label>
            <Input
              id="txn-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="col-span-3"
              placeholder="Transfer description"
            />
          </div>

          <div className="text-xs text-muted-foreground px-4">
            This will create a new transaction in the selected account and automatically link it to the current transaction.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !selectedAccountId}>
            {isSaving ? 'Creating...' : 'Create & Link'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
