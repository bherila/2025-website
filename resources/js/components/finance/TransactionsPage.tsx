'use client'

import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'

import { useFinanceTags } from '@/components/finance/useFinanceTags'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { fetchWrapper } from '@/fetchWrapper'

import FinanceAccountTransactionsPage from './FinanceAccountTransactionsPage'
import TransactionsTable from './TransactionsTable'

type FilterType = 'all' | 'cash' | 'stock'

interface TransactionsPageProps {
  accountId: number | 'all'
  initialAvailableYears?: number[]
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

function AllAccountsTransactionsContent({ initialAvailableYears = [] }: { initialAvailableYears?: number[] }) {
  const [data, setData] = useState<AccountLineItem[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [accountMap, setAccountMap] = useState<Map<number, string>>(new Map())

  const [selectedYear, setSelectedYear] = useState<string>(() => {
    const fromUrl = getUrlParam('year')
    if (fromUrl) return fromUrl
    const currentYear = new Date().getFullYear()
    if (initialAvailableYears.includes(currentYear)) return currentYear.toString()
    const firstYear = initialAvailableYears[0]
    return firstYear !== undefined ? firstYear.toString() : 'all'
  })
  const [availableYears] = useState<number[]>(initialAvailableYears)
  const [filter, setFilter] = useState<FilterType>(() => {
    const fromUrl = getUrlParam('show') as FilterType | null
    return fromUrl === 'cash' || fromUrl === 'stock' ? fromUrl : 'all'
  })
  const [selectedTag, setSelectedTag] = useState<string>(() => getUrlParam('tag') || 'all')

  const { tags: availableTags } = useFinanceTags({ enabled: true })

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

  const fetchAccounts = useCallback(async () => {
    try {
      const response = await fetchWrapper.get('/api/finance/accounts')
      if (response && typeof response === 'object') {
        const map = new Map<number, string>()
        const categories = ['assetAccounts', 'liabilityAccounts', 'retirementAccounts']
        categories.forEach((cat) => {
          const accts = (response as Record<string, unknown>)[cat]
          if (Array.isArray(accts)) {
            accts.forEach((acc: { acct_id: number; acct_name: string }) => {
              if (acc.acct_id && acc.acct_name) {
                map.set(Number(acc.acct_id), String(acc.acct_name))
              }
            })
          }
        })
        setAccountMap(map)
      }
    } catch (error) {
      console.error('Error fetching accounts:', error)
    }
  }, [])

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      if (accountMap.size === 0) {
        await fetchAccounts()
      }
      const params = new URLSearchParams()
      if (selectedYear !== 'all') params.append('year', selectedYear)
      if (filter !== 'all') params.append('filter', filter)
      if (selectedTag !== 'all') params.append('tag', selectedTag)
      const queryString = params.toString() ? `?${params.toString()}` : ''
      const fetchedData = await fetchWrapper.get(`/api/finance/all-line-items${queryString}`)
      const parsedData = z.array(AccountLineItemSchema).parse(fetchedData)
      setData(parsedData.filter(Boolean))
    } catch (error) {
      console.error('Error fetching all transactions:', error)
      setData([])
    } finally {
      setIsLoading(false)
    }
  }, [selectedYear, filter, selectedTag, accountMap.size, fetchAccounts])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return (
    <div className="px-8 pb-8">
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <h2 className="text-xl font-semibold">All Transactions</h2>
        <Select value={selectedYear} onValueChange={handleYearChange}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {availableYears.map((year) => (
              <SelectItem key={year} value={String(year)}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedTag} onValueChange={handleTagChange}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Select tag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tags</SelectItem>
            {availableTags.map((tag) => (
              <SelectItem key={tag.tag_id} value={tag.tag_label}>
                {tag.tag_label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filter} onValueChange={(v) => handleFilterChange(v as FilterType)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Show" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Cash + Stock</SelectItem>
            <SelectItem value="cash">Cash Only</SelectItem>
            <SelectItem value="stock">Stock Only</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-4">
          {isLoading && (
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-4 w-16" />
            </div>
          )}
        </div>
      </div>

      {!isLoading && data && data.length === 0 && (
        <div className="text-center p-8 bg-muted rounded-lg">
          <h2 className="text-xl font-semibold mb-4">No Transactions Found</h2>
          <p className="mb-6">
            {filter === 'stock'
              ? 'No stock transactions found'
              : filter === 'cash'
                ? 'No cash transactions found'
                : selectedYear === 'all'
                  ? 'No transactions found across your accounts.'
                  : `No transactions found for ${selectedYear}.`}
          </p>
        </div>
      )}

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {!isLoading && data && data.length > 0 && (
        <TransactionsTable
          data={data}
          enableTagging
        />
      )}
    </div>
  )
}

export default function TransactionsPage({ accountId, initialAvailableYears }: TransactionsPageProps) {
  if (accountId === 'all') {
    return <AllAccountsTransactionsContent initialAvailableYears={initialAvailableYears} />
  }
  return <FinanceAccountTransactionsPage id={accountId} />
}
