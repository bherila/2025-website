'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { z } from 'zod'

import { useFinanceTags } from '@/components/finance/useFinanceTags'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { fetchWrapper } from '@/fetchWrapper'
import { importUrl } from '@/lib/financeRouteBuilder'
import { useScrollAndHighlight } from '@/lib/useScrollAndHighlight'
import { buildCacheKey, getCachedTransactions, syncCachedTransactions } from '@/services/transactionCache'

import NewTransactionModal from './NewTransactionModal'
import { type FilterType,TransactionsPageToolbar } from './TransactionsPageToolbar'
import { exportToCSV, exportToJSON } from './transactionTable/transactionExport'
import TransactionsTable from './transactionTable/TransactionsTable'

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

function filterTransactions(
  transactions: AccountLineItem[],
  selectedYear: string,
  filter: FilterType,
  selectedTag: string,
): AccountLineItem[] {
  return transactions.filter((transaction) => {
    if (selectedYear !== 'all' && !transaction.t_date?.startsWith(selectedYear)) {
      return false
    }
    if (filter === 'stock' && !transaction.t_symbol) {
      return false
    }
    if (filter === 'cash' && transaction.t_symbol) {
      return false
    }
    if (selectedTag !== 'all' && !transaction.tags?.some((tag) => tag.tag_label === selectedTag)) {
      return false
    }

    return true
  })
}

export default function TransactionsPage({ accountId, initialAvailableYears = [], userId }: TransactionsPageProps) {
  const isAllAccounts = accountId === 'all'
  const sourceDocumentId = getUrlParam('source_document_id')

  const [data, setData] = useState<AccountLineItem[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [fetchKey, setFetchKey] = useState(0)
  const [showNewTransactionModal, setShowNewTransactionModal] = useState(false)

  const [availableYears, setAvailableYears] = useState<number[]>(initialAvailableYears)

  const [selectedYear, setSelectedYear] = useState<string>(() => {
    if (sourceDocumentId) return 'all'
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
          if (sourceDocumentId) return prev
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
  }, [accountId, isAllAccounts, sourceDocumentId])

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

        if (sourceDocumentId) {
          const endpoint = isAllAccounts
            ? '/api/finance/all/line_items'
            : `/api/finance/${accountId}/line_items`
          const params = new URLSearchParams({ source_document_id: sourceDocumentId })
          const fetched = await fetchWrapper.get(`${endpoint}?${params.toString()}`)
          const parsed = z.array(AccountLineItemSchema).parse(fetched).filter(Boolean)
          setData(filterTransactions(parsed, selectedYear, filter, selectedTag))
          return
        }

        const cacheKey = buildCacheKey(accountId)

        const cached = await getCachedTransactions(cacheKey)
        if (cached) {
          setData(filterTransactions(cached.transactions, selectedYear, filter, selectedTag))
          setIsLoading(false)
        }

        const endpoint = isAllAccounts
          ? '/api/finance/all/line_items/sync'
          : `/api/finance/${accountId}/line_items/sync`
        const synced = await syncCachedTransactions(cacheKey, endpoint)
        if (synced) {
          const parsed = z.array(AccountLineItemSchema).parse(synced.transactions).filter(Boolean)
          setData(filterTransactions(parsed, selectedYear, filter, selectedTag))
        } else if (!cached) {
          setData([])
        }
      } catch (error) {
        console.error('Error fetching transactions:', error)
        setData([])
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [accountId, isAllAccounts, selectedYear, filter, selectedTag, fetchKey, sourceDocumentId, userId])

  const highlightTransactionId = useMemo(() => {
    if (typeof window === 'undefined') return undefined
    const hash = window.location.hash
    if (hash && hash.startsWith('#t_id=')) {
      return parseInt(hash.replace('#t_id=', ''), 10)
    }
    return undefined
  }, [])

  useScrollAndHighlight({
    selector: highlightTransactionId ? `tr[data-transaction-id="${highlightTransactionId}"]` : null,
    triggerKey: `${highlightTransactionId ?? ''}:${data?.length ?? 0}`,
    enabled: Boolean(data && data.length > 0 && highlightTransactionId),
  })

  const handleDeleteTransaction = useCallback(
    async (t_id: string) => {
      if (isAllAccounts) return
      try {
        setData((prev) => prev?.filter((t) => t.t_id?.toString() !== t_id) ?? null)
        await fetchWrapper.delete(`/api/finance/${accountId}/line_items`, { t_id })
      } catch (error) {
        const refreshEndpoint = sourceDocumentId
          ? `/api/finance/${accountId}/line_items?${new URLSearchParams({ source_document_id: sourceDocumentId }).toString()}`
          : `/api/finance/${accountId}/line_items`
        const refreshed = await fetchWrapper.get(refreshEndpoint)
        setData(refreshed)
        console.error('Delete transaction error:', error)
      }
    },
    [accountId, isAllAccounts, sourceDocumentId],
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
          {isAllAccounts ? (
            <a href={importUrl('all')}>
              <Button>Import multi-account statement</Button>
            </a>
          ) : (
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
