'use client'

import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'

import { TagTotalsView } from '@/components/finance/TagTotalsView'
import { useFinanceTags } from '@/components/finance/useFinanceTags'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { fetchWrapper } from '@/fetchWrapper'

import FinanceAccountTransactionsPage from './FinanceAccountTransactionsPage'
import TransactionsTable from './TransactionsTable'

type FilterType = 'all' | 'cash' | 'stock'
type ViewType = 'transactions' | 'tag-totals'

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
  const [view, setView] = useState<ViewType>(() => {
    const fromUrl = getUrlParam('view') as ViewType | null
    return fromUrl === 'tag-totals' ? fromUrl : 'transactions'
  })
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

  const handleViewChange = (v: ViewType) => {
    setView(v)
    setUrlParams({ view: v === 'transactions' ? '' : v })
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

  // Auto-fetch on mount and when filters change
  useEffect(() => {
    fetchData()
  }, [fetchData])

  const { tags: tagTotals, isLoading: isLoadingTagTotals, error: tagTotalsError } = useFinanceTags({
    enabled: view === 'tag-totals',
    includeTotals: true,
  })

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

        <div className="flex items-center gap-2 border rounded-md p-1 bg-muted/30">
          <Button
            variant={filter === 'all' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8"
            onClick={() => handleFilterChange('all')}
          >
            Show All
          </Button>
          <Button
            variant={filter === 'cash' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8"
            onClick={() => handleFilterChange('cash')}
          >
            Cash Only
          </Button>
          <Button
            variant={filter === 'stock' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8"
            onClick={() => handleFilterChange('stock')}
          >
            Stock Only
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-4">
          <ButtonGroup>
            <Button
              variant={view === 'transactions' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleViewChange('transactions')}
            >
              Transactions
            </Button>
            <Button
              variant={view === 'tag-totals' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleViewChange('tag-totals')}
            >
              Totals by Tag
            </Button>
          </ButtonGroup>
          {isLoading && <Spinner className="h-4 w-4" />}
        </div>
      </div>

      {view === 'tag-totals' && (
        <div className="mb-6">
          <TagTotalsView
            tags={tagTotals}
            isLoading={isLoadingTagTotals}
            error={tagTotalsError}
          />
        </div>
      )}

      {!isLoading && data && data.length === 0 && view === 'transactions' && (
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

      {view === 'transactions' && data && data.length > 0 && (
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
