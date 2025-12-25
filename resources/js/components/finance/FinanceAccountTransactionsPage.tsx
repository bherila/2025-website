'use client'
import { useEffect, useState } from 'react'
import { fetchWrapper } from '@/fetchWrapper'
import TransactionsTable from './TransactionsTable'
import NewTransactionModal from './NewTransactionModal'
import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { z } from 'zod'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { Plus, Download } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { 
  getEffectiveYear, 
  YEAR_CHANGED_EVENT,
  type YearSelection 
} from '@/lib/financeRouteBuilder'

export default function FinanceAccountTransactionsPage({ id }: { id: number }) {
  const [data, setData] = useState<AccountLineItem[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [fetchKey, setFetchKey] = useState(0)
  const [selectedYear, setSelectedYear] = useState<YearSelection | null>(null)
  const [showNewTransactionModal, setShowNewTransactionModal] = useState(false)

  // Export functions
  const exportToCSV = () => {
    if (!data || data.length === 0) return
    
    const headers = ['Date', 'Type', 'Description', 'Symbol', 'Amount', 'Qty', 'Price', 'Commission', 'Fee', 'Memo']
    const csvContent = [
      headers.join(','),
      ...data.map(t => [
        t.t_date || '',
        `"${(t.t_type || '').replace(/"/g, '""')}"`,
        `"${(t.t_description || '').replace(/"/g, '""')}"`,
        t.t_symbol || '',
        t.t_amt || '',
        t.t_qty || '',
        t.t_price || '',
        t.t_commission || '',
        t.t_fee || '',
        `"${(t.t_comment || '').replace(/"/g, '""')}"`,
      ].join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `transactions_${id}_${selectedYear || 'all'}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const exportToJSON = () => {
    if (!data || data.length === 0) return
    
    const jsonContent = JSON.stringify(data, null, 2)
    const blob = new Blob([jsonContent], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `transactions_${id}_${selectedYear || 'all'}.json`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  // Get year from URL/sessionStorage on mount and listen for changes
  useEffect(() => {
    const updateYear = () => {
      const effective = getEffectiveYear(id)
      setSelectedYear(effective)
    }
    
    // Initial load
    updateYear()
    
    // Listen for year changes from year selector
    const handleYearChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ accountId: number; year: YearSelection }>
      if (customEvent.detail.accountId === id) {
        setSelectedYear(customEvent.detail.year)
      }
    }
    window.addEventListener(YEAR_CHANGED_EVENT, handleYearChange)
    
    return () => {
      window.removeEventListener(YEAR_CHANGED_EVENT, handleYearChange)
    }
  }, [id])

  useEffect(() => {
    // Only fetch once selectedYear is set
    if (selectedYear === null) return

    const fetchData = async () => {
      try {
        setIsLoading(true)
        const yearParam = selectedYear !== 'all' ? `?year=${selectedYear}` : ''
        const fetchedData = await fetchWrapper.get(`/api/finance/${id}/line_items${yearParam}`)
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
  }, [id, fetchKey, selectedYear])

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

  if (isLoading && !data) {
    return (
      <div className="d-flex justify-content-center">
        <Spinner />
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <>
        <div className="flex justify-end gap-2 mb-4">
          <Button onClick={() => setShowNewTransactionModal(true)} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Transaction
          </Button>
        </div>
        <div className="text-center p-8 bg-muted rounded-lg">
          <h2 className="text-xl font-semibold mb-4">No Transactions Found</h2>
          <p className="mb-6">
            {selectedYear === 'all'
              ? "This account doesn't have any transactions yet."
              : `No transactions found for ${selectedYear}.`}
          </p>
          <a href={`/finance/${id}/import-transactions`}>
            <Button>Import Transactions</Button>
          </a>
        </div>
        <NewTransactionModal
          accountId={id}
          isOpen={showNewTransactionModal}
          onClose={() => setShowNewTransactionModal(false)}
          onSuccess={() => setFetchKey(fetchKey + 1)}
        />
      </>
    )
  }

  return (
    <div>
      <div className="flex justify-end gap-2 mb-4">
        <Button onClick={() => setShowNewTransactionModal(true)} variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          New Transaction
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={exportToCSV}>
              Export as CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportToJSON}>
              Export as JSON
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <TransactionsTable
        enableTagging
        enableLinking
        data={data}
        onDeleteTransaction={handleDeleteTransaction}
        refreshFn={() => setFetchKey(fetchKey + 1)}
      />
      <NewTransactionModal
        accountId={id}
        isOpen={showNewTransactionModal}
        onClose={() => setShowNewTransactionModal(false)}
        onSuccess={() => setFetchKey(fetchKey + 1)}
      />
    </div>
  )
}
