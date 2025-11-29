'use client'
import { useEffect, useMemo, useState } from 'react'
import { fetchWrapper } from '../../fetchWrapper'
import TransactionsTable from '../TransactionsTable'
import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { z } from 'zod'
import { Spinner } from '../ui/spinner'
import { Button } from '../ui/button'

export default function FinanceAccountTransactionsPage({ id }: { id: number }) {
  const [data, setData] = useState<AccountLineItem[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [fetchKey, setFetchKey] = useState(0)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const fetchedData = await fetchWrapper.get(`/api/finance/${id}/line_items`)
        const parsedData = z.array(AccountLineItemSchema).parse(fetchedData)
        setData(parsedData.filter(Boolean))
        setIsLoading(false)
      } catch (error) {
        console.error('Error fetching transactions:', error)
        setData([])
        setIsLoading(false)
      }
    }
    fetchData()
  }, [id, fetchKey])

  // Handle URL hash to scroll to specific transaction
  useEffect(() => {
    if (!data || data.length === 0) return
    
    const hash = window.location.hash
    if (hash && hash.startsWith('#t_id=')) {
      const targetId = hash.replace('#t_id=', '')
      // Small delay to ensure DOM is rendered
      setTimeout(() => {
        const element = document.querySelector(`tr[data-transaction-id="${targetId}"]`)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
          // Highlight the row temporarily
          element.classList.add('highlight-transaction')
          setTimeout(() => {
            element.classList.remove('highlight-transaction')
          }, 3000)
        }
      }, 100)
    }
  }, [data])

  const handleDeleteTransaction = async (t_id: string) => {
    try {
      // Optimistic update
      const updatedData = data?.filter((transaction) => transaction.t_id?.toString() !== t_id) || []
      setData(updatedData)

      // Perform server-side deletion
      await fetchWrapper.delete(`/api/finance/${id}/line_items`, { t_id })
    } catch (error) {
      // Revert optimistic update on error
      const refreshedData = await fetchWrapper.get(`/api/finance/${id}/line_items`)
      setData(refreshedData)

      console.error('Delete transaction error:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center">
        <Spinner />
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center p-8 bg-muted rounded-lg">
        <h2 className="text-xl font-semibold mb-4">No Transactions Found</h2>
        <p className="mb-6">This account doesn't have any transactions yet.</p>
        <a href={`/finance/${id}/import-transactions`}>
          <Button>Import Transactions</Button>
        </a>
      </div>
    )
  }

  return (
    <TransactionsTable
      enableTagging
      enableLinking
      data={data}
      onDeleteTransaction={handleDeleteTransaction}
      refreshFn={() => setFetchKey(fetchKey + 1)}
    />
  )
}
