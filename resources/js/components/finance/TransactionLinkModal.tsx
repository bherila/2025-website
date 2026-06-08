'use client'

import currency from 'currency.js'
import { Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { AccountLineItem } from '@/data/finance/AccountLineItem'
import { fetchWrapper } from '@/fetchWrapper'
import { goToTransaction } from '@/lib/financeRouteBuilder'
import { cn } from '@/lib/utils'

import CreateAndLinkTransactionModal from './CreateAndLinkTransactionModal'

interface LinkedTransaction {
  t_id: number
  t_account: number
  acct_name?: string
  t_date: string
  t_description?: string
  t_amt: number | string
  t_type?: string
}

interface TransactionLinkModalProps {
  transaction: AccountLineItem
  isOpen: boolean
  onClose: () => void
  onLinkChanged?: () => void
}

function getAmountToneClass(amount: number | string | undefined): string {
  const numericAmount = Number(amount ?? 0)

  if (numericAmount > 0) {
    return 'text-success'
  }

  if (numericAmount < 0) {
    return 'text-destructive'
  }

  return 'text-foreground'
}

function LinkedTransactionCard({
  linkedTx,
  label,
  isLinking,
  onNavigate,
  onUnlink,
}: {
  linkedTx: LinkedTransaction
  label: string
  isLinking: boolean
  onNavigate: (accountId: number, transactionId: number, date?: string) => void
  onUnlink: (tId: number) => void
}) {
  return (
    <div className="mb-2">
      <p className="mb-1 text-sm text-muted-foreground">{label}:</p>
      <div className="rounded border border-border bg-card p-3 text-card-foreground">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm text-card-foreground">
            <p className="text-card-foreground"><strong>Account:</strong> {linkedTx.acct_name}</p>
            <p className="text-card-foreground"><strong>Date:</strong> {linkedTx.t_date}</p>
            <p className="text-card-foreground"><strong>Description:</strong> {linkedTx.t_description}</p>
            <p className={cn('text-card-foreground', getAmountToneClass(linkedTx.t_amt))}><strong>Amount:</strong> {currency(linkedTx.t_amt).format()}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate(linkedTx.t_account, linkedTx.t_id, linkedTx.t_date)}
            >
              Go to
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onUnlink(linkedTx.t_id)}
              disabled={isLinking}
            >
              Unlink
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function TransactionLinkModal({
  transaction,
  isOpen,
  onClose,
  onLinkChanged,
}: TransactionLinkModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isLinking, setIsLinking] = useState(false)
  const [parentTransaction, setParentTransaction] = useState<LinkedTransaction | null>(null)
  const [childTransactions, setChildTransactions] = useState<LinkedTransaction[]>([])
  const [linkableTransactions, setLinkableTransactions] = useState<LinkedTransaction[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  // Calculate if linked transactions sum to zero (balanced)
  const isBalanced = useMemo(() => {
    const currentAmt = currency(transaction.t_amt || 0)
    let totalLinkedAmt = currency(0)

    if (parentTransaction) {
      totalLinkedAmt = totalLinkedAmt.add(currency(parentTransaction.t_amt))
    }
    for (const child of childTransactions) {
      totalLinkedAmt = totalLinkedAmt.add(currency(child.t_amt))
    }

    // Sum is balanced if current + all linked equals zero
    return currentAmt.add(totalLinkedAmt).value === 0
  }, [transaction.t_amt, parentTransaction, childTransactions])

  const loadLinkData = useCallback(async () => {
    try {
      setIsLoading(true)
      const data = await fetchWrapper.get(`/api/finance/transactions/${transaction.t_id}/links`)
      setParentTransaction(data.parent_transaction)
      setChildTransactions(data.child_transactions || [])
    } catch (e) {
      console.error('Failed to load link data:', e)
      setError('Failed to load link data')
    } finally {
      setIsLoading(false)
    }
  }, [transaction.t_id])

  const loadLinkableTransactions = useCallback(async () => {
    try {
      const data = await fetchWrapper.get(`/api/finance/transactions/${transaction.t_id}/linkable`)
      setLinkableTransactions(data.potential_matches || [])
    } catch (e) {
      console.error('Failed to load linkable transactions:', e)
    }
  }, [transaction.t_id])

  // Load link data when modal opens
  useEffect(() => {
    if (isOpen && transaction.t_id) {
      loadLinkData()
    }
  }, [isOpen, transaction.t_id, loadLinkData])

  // Only load linkable transactions if not already balanced
  useEffect(() => {
    if (isOpen && transaction.t_id && !isLoading && !isBalanced) {
      loadLinkableTransactions()
    } else if (isBalanced) {
      setLinkableTransactions([])
    }
  }, [isOpen, transaction.t_id, isLoading, isBalanced, loadLinkableTransactions])

  const handleLink = async (targetTransactionId: number) => {
    try {
      setIsLinking(true)
      setError(null)

      // Determine which should be parent based on amount sign
      // Typically the withdrawal (negative) is the parent, deposit (positive) is child
      const sourceAmt = parseFloat(String(transaction.t_amt))
      const targetTransaction = linkableTransactions.find(t => t.t_id === targetTransactionId)
      const targetAmt = parseFloat(String(targetTransaction?.t_amt || 0))

      let parentId: number
      let childId: number

      if (sourceAmt < 0) {
        // Source is withdrawal (parent), target is deposit (child)
        parentId = transaction.t_id!
        childId = targetTransactionId
      } else {
        // Source is deposit (child), target is withdrawal (parent)
        parentId = targetTransactionId
        childId = transaction.t_id!
      }

      await fetchWrapper.post('/api/finance/transactions/link', {
        parent_t_id: parentId,
        child_t_id: childId,
      })

      // Reload link data (linkable transactions will be updated via useEffect based on balanced state)
      await loadLinkData()

      if (onLinkChanged) {
        onLinkChanged()
      }
    } catch (e) {
      console.error('Failed to link transactions:', e)
      setError(e instanceof Error ? e.message : 'Failed to link transactions')
    } finally {
      setIsLinking(false)
    }
  }

  const handleUnlink = async (linkedTId: number) => {
    try {
      setIsLinking(true)
      setError(null)

      await fetchWrapper.post(`/api/finance/transactions/${transaction.t_id}/unlink`, {
        linked_t_id: linkedTId,
      })

      // Reload link data (linkable transactions will be updated via useEffect based on balanced state)
      await loadLinkData()

      if (onLinkChanged) {
        onLinkChanged()
      }
    } catch (e) {
      console.error('Failed to unlink transaction:', e)
      setError(e instanceof Error ? e.message : 'Failed to unlink transaction')
    } finally {
      setIsLinking(false)
    }
  }

  const handleCreateAndLinkSuccess = useCallback(async () => {
    // Reload link data after creating and linking
    await loadLinkData()
    if (onLinkChanged) {
      onLinkChanged()
    }
  }, [loadLinkData, onLinkChanged])

  const navigateToTransaction = (accountId: number, transactionId: number, transactionDate?: string) => {
    // Extract year from transaction date for year selector compatibility
    const year = transactionDate ? new Date(transactionDate).getFullYear() : undefined
    goToTransaction(accountId, transactionId, year)
  }

  const hasExistingLinks = parentTransaction || childTransactions.length > 0

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transaction Links</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="mb-4 text-sm text-destructive">{error}</div>
        )}

        <div className="space-y-6">
          {/* Current Transaction Info */}
          <div className="rounded border border-border bg-muted p-3 text-foreground">
            <h4 className="mb-2 font-semibold text-foreground">Current Transaction</h4>
            <div className="text-sm text-foreground">
              <p className="text-foreground"><strong>Date:</strong> {transaction.t_date}</p>
              <p className="text-foreground"><strong>Description:</strong> {transaction.t_description}</p>
              <p className={cn('text-foreground', getAmountToneClass(transaction.t_amt))}><strong>Amount:</strong> {currency(transaction.t_amt || 0).format()}</p>
            </div>
          </div>

          {/* Existing Links Section */}
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : hasExistingLinks ? (
            <div>
              <h4 className="font-semibold mb-2">Linked Transactions</h4>

              {/* Parent Transaction */}
              {parentTransaction && (
                <LinkedTransactionCard
                  linkedTx={parentTransaction}
                  label="Linked Transaction (source of transfer)"
                  isLinking={isLinking}
                  onNavigate={navigateToTransaction}
                  onUnlink={handleUnlink}
                />
              )}

              {/* Child Transactions */}
              {childTransactions.map((child) => (
                <LinkedTransactionCard
                  key={child.t_id}
                  linkedTx={child}
                  label="Linked Transaction (destination of transfer)"
                  isLinking={isLinking}
                  onNavigate={navigateToTransaction}
                  onUnlink={handleUnlink}
                />
              ))}

              {/* Show balanced status */}
              {isBalanced && (
                <div className="mt-4 rounded border border-success/30 bg-success/10 p-3">
                  <p className="text-sm text-success">
                    ✓ Linked transactions are balanced (sum to $0.00)
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No linked transactions.</p>
          )}

          {/* Linkable Transactions Section - only show if not balanced */}
          {!isBalanced && (
            <div>
              <h4 className="font-semibold mb-2">
                Available Transactions to Link
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  (±7 days, ±5% amount)
                </span>
              </h4>

              {linkableTransactions.length > 0 ? (
                <div className="max-h-[300px] overflow-y-auto">
                  <Table className="text-[85%]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead><span className="sr-only">Actions</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {linkableTransactions.map((linkable) => (
                        <TableRow key={linkable.t_id}>
                          <TableCell className="text-sm text-foreground">{linkable.acct_name}</TableCell>
                          <TableCell className="text-sm text-foreground">{linkable.t_date}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm text-foreground" title={linkable.t_description}>
                            {linkable.t_description}
                          </TableCell>
                          <TableCell className={cn('text-right text-sm', getAmountToneClass(linkable.t_amt))}>
                            {currency(linkable.t_amt).format()}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleLink(linkable.t_id)}
                              disabled={isLinking}
                            >
                              Link
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No matching transactions found in other accounts.
                </p>
              )}

              <div className="mt-4 border-t border-border pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreateModal(true)}
                  disabled={isLinking}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Matching Transaction in Another Account
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>

      {transaction.t_id && (
        <CreateAndLinkTransactionModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          sourceTransactionId={transaction.t_id}
          sourceDate={transaction.t_date || ''}
          sourceAmount={transaction.t_amt || 0}
          sourceDescription={transaction.t_description || ''}
          sourceAccountId={transaction.t_account ?? 0}
          onSuccess={handleCreateAndLinkSuccess}
        />
      )}
    </Dialog>
  )
}
