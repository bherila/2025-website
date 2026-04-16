'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { z } from 'zod'

import { useFinanceTags } from '@/components/finance/useFinanceTags'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { fetchWrapper } from '@/fetchWrapper'
import { importUrl } from '@/lib/financeRouteBuilder'
import { buildCacheKey, getCachedTransactions, setCachedTransactions } from '@/services/transactionCache'

import NewTransactionModal from './NewTransactionModal'
import { exportToCSV, exportToJSON } from './transactionExport'
import { type FilterType,TransactionsPageToolbar } from './TransactionsPageToolbar'
import TransactionsTable from './TransactionsTable'

interface TransactionsPageProps {
  accountId: number | 'all'
  initialAvailableYears?: number[]
  /** Current authenticated user ID — used as part of the IndexedDB cache key */
  userId?: number
}

function getUrlParam(key: string): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get(key)
}

function setUrlParams(updates: Record<string, string>) {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  for (const [key, value] of Object.entries(updates)) {
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
  }
  window.history.replaceState(null, '', `?${params.toString()}`)
}

export default function TransactionsPage({ accountId, initialAvailableYears = [], userId }: TransactionsPageProps) {
  const isAllAccounts = accountId === 'all'

  const [data, setData] = useState<AccountLineItem[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [fetchKey, setFetchKey] = useState(0)
  const [showNewTransactionModal, setShowNewTransactionModal] = useState(false)

  const [availableYears, setAvailableYears] = useState<number[]>(initialAvailableYears)

  const [selectedYear, setSelectedYear] = useState<string>(() => {
    const fromUrl = getUrlParam('year')
    if (fromUrl) return fromUrl
    const currentYear = new Date().getFullYear()
    if (initialAvailableYears.includes(currentYear)) return currentYear.toString()
    const firstYear = initialAvailableYears[0]
    return firstYear !== undefined ? firstYear.toString() : 'all'
  })
  const [filter, setFilter] = useState<FilterType>(() => {
    const fromUrl = getUrlParam('show') as FilterType | null
    return fromUrl === 'cash' || fromUrl === 'stock' ? fromUrl : 'all'
  })
  const [selectedTag, setSelectedTag] = useState<string>(() => getUrlParam('tag') || 'all')

  const { tags: availableTags } = useFinanceTags({ enabled: true })

  useEffect(() => {
    const fetchYears = async () => {
      try {
        const endpoint = isAllAccounts
          ? '/api/finance/all/transaction-years'
          : `/api/finance/${accountId}/transaction-years`
        const years = await fetchWrapper.get(endpoint)
        const parsedYears = z.array(z.number()).parse(years)
        setAvailableYears(parsedYears)
        const currentYear = new Date().getFullYear()
        setSelectedYear((prev) => {
          if (prev !== 'all') return prev
          if (parsedYears.includes(currentYear)) return currentYear.toString()
          const first = parsedYears[0]
          return first !== undefined ? first.toString() : 'all'
        })
      } catch {
        // keep initialAvailableYears on error
      }
    }
    fetchYears()
  }, [accountId, isAllAccounts])

  const handleYearChange = (year: string) => {
    setSelectedYear(year)
    setUrlParams({ year })
  }

  const handleFilterChange = (f: FilterType) => {
    setFilter(f)
    setUrlParams({ show: f === 'all' ? '' : f })
  }

  const handleTagChange = (tag: string) => {
    setSelectedTag(tag)
    setUrlParams({ tag: tag === 'all' ? '' : tag })
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true)

        // Cache single-account, unfiltered fetches by accountId (no year scoping).
        const canUseCache = !isAllAccounts && filter === 'all' && selectedTag === 'all'
        const cacheKey = canUseCache ? buildCacheKey(accountId) : null

        // 1. Show cached data immediately if available (filter by year in JS if needed)
        if (cacheKey) {
          const cached = await getCachedTransactions(cacheKey)
          if (cached) {
            const fromCache = selectedYear !== 'all'
              ? cached.transactions.filter((t) => t.t_date?.startsWith(selectedYear))
              : cached.transactions
            setData(fromCache)
            setIsLoading(false)
          }
        }

        // 2. Always fetch fresh data from the API.
        // Cache stores the full all-year dataset; year filter is applied in JS above.
        const params = new URLSearchParams()
        if (filter !== 'all') params.append('filter', filter)
        if (selectedTag !== 'all') params.append('tag', selectedTag)
        const queryString = params.toString() ? `?${params.toString()}` : ''
        const endpoint = isAllAccounts
          ? `/api/finance/all/line_items${queryString}`
          : `/api/finance/${accountId}/line_items${queryString}`
        const fetchedData = await fetchWrapper.get(endpoint)
        const allParsed = z.array(AccountLineItemSchema).parse(fetchedData).filter(Boolean)

        // Apply year filter in JS for display
        const yearFiltered = selectedYear !== 'all'
          ? allParsed.filter((t) => t.t_date?.startsWith(selectedYear))
          : allParsed
        setData(yearFiltered)

        // 3. Persist the FULL (all-year) dataset to cache for reuse
        if (cacheKey) {
          await setCachedTransactions(cacheKey, allParsed)
        }
      } catch (error) {
        console.error('Error fetching transactions:', error)
        setData([])
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [accountId, isAllAccounts, selectedYear, filter, selectedTag, fetchKey, userId])

  const highlightTransactionId = useMemo(() => {
    if (typeof window === 'undefined') return undefined
    const hash = window.location.hash
    if (hash && hash.startsWith('#t_id=')) {
      return parseInt(hash.replace('#t_id=', ''), 10)
    }
    return undefined
  }, [])

  useEffect(() => {
    if (!data || data.length === 0 || !highlightTransactionId) return
    setTimeout(() => {
      const element = document.querySelector(`tr[data-transaction-id="${highlightTransactionId}"]`)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        element.classList.add('highlight-transaction')
        setTimeout(() => element.classList.remove('highlight-transaction'), 3000)
      }
    }, 200)
  }, [data, highlightTransactionId])

  const handleDeleteTransaction = useCallback(
    async (t_id: string) => {
      if (isAllAccounts) return
      try {
        setData((prev) => prev?.filter((t) => t.t_id?.toString() !== t_id) ?? null)
        await fetchWrapper.delete(`/api/finance/${accountId}/line_items`, { t_id })
      } catch (error) {
        const refreshed = await fetchWrapper.get(`/api/finance/${accountId}/line_items`)
        setData(refreshed)
        console.error('Delete transaction error:', error)
      }
    },
    [accountId, isAllAccounts],
  )

  const handleRefresh = useCallback(() => setFetchKey((k) => k + 1), [])

  const handleExportCSV = useCallback(() => {
    if (data) exportToCSV(data, accountId, selectedYear)
  }, [data, accountId, selectedYear])

  const handleExportJSON = useCallback(() => {
    if (data) exportToJSON(data, accountId, selectedYear)
  }, [data, accountId, selectedYear])

  const toolbar = (
    <TransactionsPageToolbar
      accountId={accountId}
      isAllAccounts={isAllAccounts}
      selectedYear={selectedYear}
      availableYears={availableYears}
      onYearChange={handleYearChange}
      filter={filter}
      onFilterChange={handleFilterChange}
      selectedTag={selectedTag}
      availableTags={availableTags}
      onTagChange={handleTagChange}
      data={data}
      isLoading={isLoading}
      onExportCSV={handleExportCSV}
      onExportJSON={handleExportJSON}
      onNewTransaction={() => setShowNewTransactionModal(true)}
    />
  )

  if (isLoading && !data) {
    return (
      <div className="pb-8">
        {toolbar}
        <div className="space-y-2 px-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="pb-8">
        {toolbar}
        <div className="text-center p-8 bg-muted rounded-lg mx-8">
          <h2 className="text-xl font-semibold mb-4">No Transactions Found</h2>
          <p className="mb-6">
            {filter === 'stock'
              ? 'No stock transactions found'
              : filter === 'cash'
                ? 'No cash transactions found'
                : selectedYear === 'all'
                  ? isAllAccounts
                    ? 'No transactions found across your accounts.'
                    : "This account doesn't have any transactions yet."
                  : `No transactions found for ${selectedYear}.`}
          </p>
          {!isAllAccounts && (
            <a href={importUrl(accountId as number)}>
              <Button>Import Transactions</Button>
            </a>
          )}
        </div>
        {!isAllAccounts && (
          <NewTransactionModal
            accountId={accountId as number}
            isOpen={showNewTransactionModal}
            onClose={() => setShowNewTransactionModal(false)}
            onSuccess={handleRefresh}
          />
        )}
      </div>
    )
  }

  return (
    <div>
      {toolbar}
      <TransactionsTable
        enableTagging
        enableLinking={!isAllAccounts}
        accountId={!isAllAccounts ? (accountId as number) : undefined}
        data={data}
        onDeleteTransaction={!isAllAccounts ? handleDeleteTransaction : undefined}
        refreshFn={handleRefresh}
        highlightTransactionId={highlightTransactionId}
      />
      {!isAllAccounts && (
        <NewTransactionModal
          accountId={accountId as number}
          isOpen={showNewTransactionModal}
          onClose={() => setShowNewTransactionModal(false)}
          onSuccess={handleRefresh}
        />
      )}
    </div>
  )
}
