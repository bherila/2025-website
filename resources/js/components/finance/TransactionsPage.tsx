'use client'

import { Download, Plus, Settings, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { z } from 'zod'

import { useFinanceTags } from '@/components/finance/useFinanceTags'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { fetchWrapper } from '@/fetchWrapper'
import { importUrl, maintenanceUrl } from '@/lib/financeRouteBuilder'

import NewTransactionModal from './NewTransactionModal'
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

export default function TransactionsPage({ accountId, initialAvailableYears = [] }: TransactionsPageProps) {
  const isAllAccounts = accountId === 'all'

  const [data, setData] = useState<AccountLineItem[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [fetchKey, setFetchKey] = useState(0)
  const [showNewTransactionModal, setShowNewTransactionModal] = useState(false)

  // Available years: start with server-provided, then refresh from API
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

  // Fetch available years from the API
  useEffect(() => {
    const fetchYears = async () => {
      try {
        const endpoint = isAllAccounts
          ? '/api/finance/all/transaction-years'
          : `/api/finance/${accountId}/transaction-years`
        const years = await fetchWrapper.get(endpoint)
        const parsedYears = z.array(z.number()).parse(years)
        setAvailableYears(parsedYears)
        // Default to current year if available
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

  // Fetch transactions
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true)
        const params = new URLSearchParams()
        if (selectedYear !== 'all') params.append('year', selectedYear)
        if (filter !== 'all') params.append('filter', filter)
        if (selectedTag !== 'all') params.append('tag', selectedTag)
        const queryString = params.toString() ? `?${params.toString()}` : ''
        const endpoint = isAllAccounts
          ? `/api/finance/all/line_items${queryString}`
          : `/api/finance/${accountId}/line_items${queryString}`
        const fetchedData = await fetchWrapper.get(endpoint)
        const parsedData = z.array(AccountLineItemSchema).parse(fetchedData)
        setData(parsedData.filter(Boolean))
      } catch (error) {
        console.error('Error fetching transactions:', error)
        setData([])
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [accountId, isAllAccounts, selectedYear, filter, selectedTag, fetchKey])

  // Handle URL hash to scroll to specific transaction
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

  // Export functions
  const exportToCSV = useCallback(() => {
    if (!data || data.length === 0) return
    const headers = ['Date', 'Type', 'Description', 'Symbol', 'Amount', 'Qty', 'Price', 'Commission', 'Fee', 'Memo']
    const csvContent = [
      headers.join(','),
      ...data.map((t) =>
        [
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
        ].join(','),
      ),
    ].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `transactions_${accountId}_${selectedYear}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }, [data, accountId, selectedYear])

  const exportToJSON = useCallback(() => {
    if (!data || data.length === 0) return
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `transactions_${accountId}_${selectedYear}.json`
    link.click()
    URL.revokeObjectURL(link.href)
  }, [data, accountId, selectedYear])

  const disabledTooltip = 'Select an account to import or modify that account.'

  // Toolbar with filters (left) and action buttons (right)
  const toolbar = (
    <div className="flex items-center gap-4 mb-4 flex-wrap px-8">
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

      <div className="ml-auto flex items-center gap-2">
        {isLoading && (
          <div className="flex items-center gap-2 mr-2">
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-4 w-16" />
          </div>
        )}

        {/* Import button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="outline"
                size="sm"
                disabled={isAllAccounts}
                asChild={!isAllAccounts}
              >
                {isAllAccounts ? (
                  <span className="flex items-center gap-1">
                    <Upload className="h-4 w-4" />
                    Import
                  </span>
                ) : (
                  <a href={importUrl(accountId as number)} className="flex items-center gap-1">
                    <Upload className="h-4 w-4" />
                    Import
                  </a>
                )}
              </Button>
            </span>
          </TooltipTrigger>
          {isAllAccounts && <TooltipContent>{disabledTooltip}</TooltipContent>}
        </Tooltip>

        {/* Maintenance button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="outline"
                size="sm"
                disabled={isAllAccounts}
                asChild={!isAllAccounts}
              >
                {isAllAccounts ? (
                  <span className="flex items-center gap-1">
                    <Settings className="h-4 w-4" />
                    Maintenance
                  </span>
                ) : (
                  <a href={maintenanceUrl(accountId as number)} className="flex items-center gap-1">
                    <Settings className="h-4 w-4" />
                    Maintenance
                  </a>
                )}
              </Button>
            </span>
          </TooltipTrigger>
          {isAllAccounts && <TooltipContent>{disabledTooltip}</TooltipContent>}
        </Tooltip>

        {/* New Transaction button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="outline"
                size="sm"
                disabled={isAllAccounts}
                onClick={isAllAccounts ? undefined : () => setShowNewTransactionModal(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                New Transaction
              </Button>
            </span>
          </TooltipTrigger>
          {isAllAccounts && <TooltipContent>{disabledTooltip}</TooltipContent>}
        </Tooltip>

        {/* Export button */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={!data || data.length === 0}>
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={exportToCSV}>Export as CSV</DropdownMenuItem>
            <DropdownMenuItem onClick={exportToJSON}>Export as JSON</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
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
    <div className="pb-8">
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
