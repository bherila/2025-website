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
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [selectedYear, setSelectedYear] = useState<number | 'all' | null>(null)
  const [yearsLoaded, setYearsLoaded] = useState(false)

  // Parse year from URL query parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const yearParam = urlParams.get('year')
    if (yearParam) {
      const parsedYear = parseInt(yearParam, 10)
      if (!isNaN(parsedYear)) {
        setSelectedYear(parsedYear)
      }
    }
  }, [])

  // Fetch available years on mount
  useEffect(() => {
    const fetchYears = async () => {
      try {
        const years = await fetchWrapper.get(`/api/finance/${id}/transaction-years`)
        const parsedYears = z.array(z.number()).parse(years)
        setAvailableYears(parsedYears)
        // Default to the most recent year if no year from URL
        if (selectedYear === null && parsedYears.length > 0 && parsedYears[0] !== undefined) {
          setSelectedYear(parsedYears[0])
        } else if (selectedYear === null) {
          setSelectedYear('all')
        }
        setYearsLoaded(true)
      } catch (error) {
        console.error('Error fetching years:', error)
        setAvailableYears([])
        if (selectedYear === null) {
          setSelectedYear('all')
        }
        setYearsLoaded(true)
      }
    }
    fetchYears()
  }, [id])

  useEffect(() => {
    // Only fetch once years are loaded and selectedYear is set
    if (!yearsLoaded || selectedYear === null) return

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
  }, [id, fetchKey, selectedYear, yearsLoaded])

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

  const YearSelector = () => (
    <div className="flex gap-1 mb-4 items-center flex-wrap">
      <span className="text-sm text-muted-foreground mr-2">Year:</span>
      <Button
        variant={selectedYear === 'all' ? 'default' : 'outline'}
        size="sm"
        onClick={() => setSelectedYear('all')}
      >
        All
      </Button>
      {availableYears.map((year) => (
        <Button
          key={year}
          variant={selectedYear === year ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedYear(year)}
        >
          {year}
        </Button>
      ))}
    </div>
  )

  if (isLoading && !data) {
    return (
      <div className="d-flex justify-content-center">
        <Spinner />
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div>
        <YearSelector />
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
      </div>
    )
  }

  return (
    <div>
      <YearSelector />
      <TransactionsTable
        enableTagging
        enableLinking
        data={data}
        onDeleteTransaction={handleDeleteTransaction}
        refreshFn={() => setFetchKey(fetchKey + 1)}
      />
    </div>
  )
}
