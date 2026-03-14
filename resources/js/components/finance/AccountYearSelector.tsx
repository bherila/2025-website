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
import { Skeleton } from '@/components/ui/skeleton'
import { fetchWrapper } from '@/fetchWrapper'
import { 
  getEffectiveYear, 
  getStoredYear,
  updateYearInUrl, 
  YEAR_CHANGED_EVENT,
  type YearSelection 
} from '@/lib/financeRouteBuilder'

// Re-export types and functions for convenience (backwards compatibility)
export type { YearSelection } from '@/lib/financeRouteBuilder'
export { getEffectiveYear,getStoredYear, setStoredYear } from '@/lib/financeRouteBuilder'

interface AccountYearSelectorProps {
  accountId: number
  onYearChange?: ((year: YearSelection) => void) | undefined
  className?: string
}

export function useAccountYear(accountId: number): {
  selectedYear: YearSelection | null
  setSelectedYear: (year: YearSelection) => void
  availableYears: number[]
  isLoading: boolean
} {
  const [selectedYear, setSelectedYearState] = useState<YearSelection | null>(null)
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Load from URL or sessionStorage on mount
  useEffect(() => {
    const effective = getEffectiveYear(accountId)
    setSelectedYearState(effective)
  }, [accountId])

  // Listen for year changes from other components
  useEffect(() => {
    const handleYearChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ accountId: number; year: YearSelection }>
      if (customEvent.detail.accountId === accountId) {
        setSelectedYearState(customEvent.detail.year)
      }
    }
    window.addEventListener(YEAR_CHANGED_EVENT, handleYearChange)
    return () => window.removeEventListener(YEAR_CHANGED_EVENT, handleYearChange)
  }, [accountId])

  // Fetch available years
  useEffect(() => {
    const fetchYears = async () => {
      try {
        const years = await fetchWrapper.get(`/api/finance/${accountId}/transaction-years`)
        const parsedYears = z.array(z.number()).parse(years)
        setAvailableYears(parsedYears)
        
        // If no year determined yet, default to most recent year
        const effective = getEffectiveYear(accountId)
        if (effective === 'all' && parsedYears.length > 0 && parsedYears[0] !== undefined) {
          // Only auto-select if user hasn't explicitly chosen 'all'
          const stored = getStoredYear(accountId)
          if (stored === null) {
            const defaultYear = parsedYears[0]
            setSelectedYearState(defaultYear)
            updateYearInUrl(accountId, defaultYear)
          }
        }
        setIsLoading(false)
      } catch (error) {
        console.error('Error fetching years:', error)
        setAvailableYears([])
        setIsLoading(false)
      }
    }
    fetchYears()
  }, [accountId])

  const setSelectedYear = useCallback((year: YearSelection) => {
    setSelectedYearState(year)
    updateYearInUrl(accountId, year)
  }, [accountId])

  return { selectedYear, setSelectedYear, availableYears, isLoading }
}

export default function AccountYearSelector({
  accountId,
  onYearChange,
  className = '',
}: AccountYearSelectorProps) {
  const { selectedYear, setSelectedYear, availableYears, isLoading } = useAccountYear(accountId)

  const handleYearChange = (year: YearSelection) => {
    setSelectedYear(year)
    onYearChange?.(year)
  }

  if (isLoading) {
    return (
      <div className={`flex items-center ${className}`}>
        <Skeleton className="h-8 w-28" />
      </div>
    )
  }

  return (
    <div className={`flex items-center ${className}`}>
      <Select
        value={String(selectedYear ?? 'all')}
        onValueChange={(v) => handleYearChange(v === 'all' ? 'all' : parseInt(v, 10))}
      >
        <SelectTrigger className="w-28">
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
    </div>
  )
}