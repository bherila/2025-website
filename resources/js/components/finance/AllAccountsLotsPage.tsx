'use client'

import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'

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

import LotAnalyzer from './LotAnalyzer'

interface AllAccountsLotsPageProps {
  initialAvailableYears?: number[]
}

function getUrlParam(key: string): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get(key)
}

function setUrlParam(key: string, value: string) {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  if (value) {
    params.set(key, value)
  } else {
    params.delete(key)
  }
  window.history.replaceState(null, '', `?${params.toString()}`)
}

export default function AllAccountsLotsPage({ initialAvailableYears = [] }: AllAccountsLotsPageProps) {
  const [data, setData] = useState<AccountLineItem[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [accountMap, setAccountMap] = useState<Map<number, string>>(new Map())

  const [selectedYear, setSelectedYear] = useState<string>(() => {
    const fromUrl = getUrlParam('year')
    if (fromUrl) return fromUrl
    return 'all'
  })
  const [availableYears] = useState<number[]>(initialAvailableYears)

  const handleYearChange = (year: string) => {
    setSelectedYear(year)
    setUrlParam('year', year === 'all' ? '' : year)
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
      const queryString = params.toString() ? `?${params.toString()}` : ''
      const fetchedData = await fetchWrapper.get(`/api/finance/all-line-items${queryString}`)
      const parsedData = z.array(AccountLineItemSchema).parse(fetchedData)
      setData(parsedData.filter(Boolean))
    } catch (error) {
      console.error('Error fetching lots data:', error)
      setData([])
    } finally {
      setIsLoading(false)
    }
  }, [selectedYear, accountMap.size, fetchAccounts])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return (
    <div className="px-8 pb-8">
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <h2 className="text-xl font-semibold">Lot Analysis — All Accounts</h2>
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
        {isLoading && <Spinner className="h-4 w-4" />}
      </div>

      {!isLoading && data && data.length === 0 && (
        <div className="text-center p-8 bg-muted rounded-lg">
          <h2 className="text-xl font-semibold mb-4">No Transactions Found</h2>
          <p>No transactions available for lot analysis.</p>
        </div>
      )}

      {data && data.length > 0 && (
        <LotAnalyzer
          transactions={data}
          accountMap={accountMap}
          allYearsLoaded={selectedYear === 'all'}
          onLoadAllYears={() => handleYearChange('all')}
        />
      )}
    </div>
  )
}
