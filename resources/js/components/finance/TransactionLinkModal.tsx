'use client'

import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Table } from '@/components/ui/table'
import type { AccountLineItem } from '@/data/finance/AccountLineItem'
import { fetchWrapper } from '@/fetchWrapper'
import currency from 'currency.js'
import { goToTransaction } from '@/lib/financeRouteBuilder'

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

export default function TransactionLinkModal({ 
  transaction, 
  isOpen, 
  onClose, 
  onLinkChanged 
}: TransactionLinkModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isLinking, setIsLinking] = useState(false)
  const [parentTransaction, setParentTransaction] = useState<LinkedTransaction | null>(null)
  const [childTransactions, setChildTransactions] = useState<LinkedTransaction[]>([])
  const [linkableTransactions, setLinkableTransactions] = useState<LinkedTransaction[]>([])
  const [error, setError] = useState<string | null>(null)

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

  // Load link data when modal opens
  useEffect(() => {
    if (isOpen && transaction.t_id) {
      loadLinkData()
    }
  }, [isOpen, transaction.t_id])

  // Only load linkable transactions if not already balanced
  useEffect(() => {
    if (isOpen && transaction.t_id && !isLoading && !isBalanced) {
      loadLinkableTransactions()
    } else if (isBalanced) {
      setLinkableTransactions([])
    }
  }, [isOpen, transaction.t_id, isLoading, isBalanced])

  const loadLinkData = async () => {
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
  }

  const loadLinkableTransactions = async () => {
    try {
      const data = await fetchWrapper.get(`/api/finance/transactions/${transaction.t_id}/linkable`)
      setLinkableTransactions(data.potential_matches || [])
    } catch (e) {
      console.error('Failed to load linkable transactions:', e)
    }
  }

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

  const navigateToTransaction = (accountId: number, transactionId: number, transactionDate?: string) => {
    // Extract year from transaction date for year selector compatibility
    const year = transactionDate ? new Date(transactionDate).getFullYear() : undefined
    goToTransaction(accountId, transactionId, year)
  }

  const hasExistingLinks = parentTransaction || childTransactions.length > 0

  // Reusable component for displaying a linked transaction
  const LinkedTransactionCard = ({ 
    linkedTx, 
    label, 
  }: { 
    linkedTx: LinkedTransaction
    label: string
  }) => (
    <div className="mb-2">
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">{label}:</p>
      <div className="border rounded p-3">
        <div className="flex justify-between items-start">
          <div className="text-sm">
            <p><strong>Account:</strong> {linkedTx.acct_name}</p>
            <p><strong>Date:</strong> {linkedTx.t_date}</p>
            <p><strong>Description:</strong> {linkedTx.t_description}</p>
            <p><strong>Amount:</strong> {currency(linkedTx.t_amt).format()}</p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigateToTransaction(linkedTx.t_account, linkedTx.t_id, linkedTx.t_date)}
            >
              Go to
            </Button>
            <Button 
              variant="destructive" 
              size="sm"
              onClick={() => handleUnlink(linkedTx.t_id)}
              disabled={isLinking}
            >
              Unlink
            </Button>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transaction Links</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="text-red-500 text-sm mb-4">{error}</div>
        )}

        <div className="space-y-6">
          {/* Current Transaction Info */}
          <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded">
            <h4 className="font-semibold mb-2">Current Transaction</h4>
            <div className="text-sm">
              <p><strong>Date:</strong> {transaction.t_date}</p>
              <p><strong>Description:</strong> {transaction.t_description}</p>
              <p><strong>Amount:</strong> {currency(transaction.t_amt || 0).format()}</p>
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
                />
              )}

              {/* Child Transactions */}
              {childTransactions.map((child) => (
                <LinkedTransactionCard 
                  key={child.t_id}
                  linkedTx={child}
                  label="Linked Transaction (destination of transfer)"
                />
              ))}

              {/* Show balanced status */}
              {isBalanced && (
                <div className="mt-4 p-3 bg-green-100 dark:bg-green-900 rounded border border-green-300 dark:border-green-700">
                  <p className="text-sm text-green-800 dark:text-green-200">
                    ✓ Linked transactions are balanced (sum to $0.00)
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No linked transactions.</p>
          )}

          {/* Linkable Transactions Section - only show if not balanced */}
          {!isBalanced && (
            <div>
              <h4 className="font-semibold mb-2">
                Available Transactions to Link
                <span className="text-sm font-normal text-gray-500 ml-2">
                  (±7 days, ±5% amount)
                </span>
              </h4>
              
              {linkableTransactions.length > 0 ? (
                <div className="max-h-[300px] overflow-y-auto">
                  <Table style={{ fontSize: '85%' }}>
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th>Date</th>
                        <th>Description</th>
                        <th className="text-right">Amount</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {linkableTransactions.map((linkable) => (
                        <tr key={linkable.t_id}>
                          <td className="text-sm">{linkable.acct_name}</td>
                          <td className="text-sm">{linkable.t_date}</td>
                          <td className="text-sm max-w-[200px] truncate" title={linkable.t_description}>
                            {linkable.t_description}
                          </td>
                          <td 
                            className="text-sm text-right"
                            style={{ color: Number(linkable.t_amt) >= 0 ? 'green' : 'red' }}
                          >
                            {currency(linkable.t_amt).format()}
                          </td>
                          <td>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleLink(linkable.t_id)}
                              disabled={isLinking}
                            >
                              Link
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  No matching transactions found in other accounts.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
