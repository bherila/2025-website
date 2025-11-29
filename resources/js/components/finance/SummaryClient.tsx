'use client'

import { useState, useEffect, useCallback } from 'react'
import currency from 'currency.js'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import Masonry from '@/components/ui/masonry'
import { Spinner } from '@/components/ui/spinner'
import { fetchWrapper } from '@/fetchWrapper'
import { 
  getEffectiveYear, 
  YEAR_CHANGED_EVENT,
  type YearSelection 
} from '@/lib/financeRouteBuilder'

interface Totals {
  total_volume: number
  total_commission: number
  total_fee: number
}

interface SymbolSummaryItem {
  t_symbol: string
  total_amount: number
}

interface MonthSummaryItem {
  month: string
  total_amount: number
}

interface SummaryData {
  totals: Totals
  symbolSummary: SymbolSummaryItem[]
  monthSummary: MonthSummaryItem[]
}

export default function SummaryClient({ id }: { id: number }) {
  const [data, setData] = useState<SummaryData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedYear, setSelectedYear] = useState<YearSelection | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  const fetchSummary = useCallback(async () => {
    if (selectedYear === null) return

    setIsLoading(true)
    setError(null)
    try {
      const yearParam = selectedYear !== 'all' ? `?year=${selectedYear}` : ''
      const result = await fetchWrapper.get(`/api/finance/${id}/summary${yearParam}`)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load summary')
    } finally {
      setIsLoading(false)
    }
  }, [id, selectedYear])

  useEffect(() => {
    if (selectedYear !== null) {
      fetchSummary()
    }
  }, [fetchSummary, selectedYear])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner size="large" />
        <span className="ml-2">Loading summary...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-red-600">
        Error: {error}
      </div>
    )
  }

  if (!data) {
    return <div className="p-4">No data available</div>
  }

  const { totals, symbolSummary, monthSummary } = data

  return (
    <Masonry columnsCount={3} gutter="16px">
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Account Totals {selectedYear !== 'all' && `(${selectedYear})`}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell>Total Volume</TableCell>
                <TableCell className="text-end">{currency(totals.total_volume.valueOf()).format()}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Total Commissions</TableCell>
                <TableCell className="text-end">{currency(totals.total_commission).format()}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Total Fees</TableCell>
                <TableCell className="text-end">{currency(totals.total_fee).format()}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>By Symbol</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead className="text-end">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {symbolSummary.map(({ t_symbol, total_amount }) => (
                <TableRow key={t_symbol}>
                  <TableCell>{t_symbol}</TableCell>
                  <TableCell className="text-end">{currency(total_amount).format()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>By Month</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-end">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthSummary.map(({ month, total_amount }) => (
                <TableRow key={month}>
                  <TableCell>{month}</TableCell>
                  <TableCell className="text-end">{currency(total_amount).format()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Masonry>
  )
}