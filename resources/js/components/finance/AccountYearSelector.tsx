'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { fetchWrapper } from '@/fetchWrapper'
import { z } from 'zod'
import { 
  getEffectiveYear, 
  getStoredYear,
  updateYearInUrl, 
  YEAR_CHANGED_EVENT,
  type YearSelection 
} from '@/lib/financeRouteBuilder'

// Re-export types and functions for convenience (backwards compatibility)
export type { YearSelection } from '@/lib/financeRouteBuilder'
export { getStoredYear, setStoredYear, getEffectiveYear } from '@/lib/financeRouteBuilder'

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
      <div className={`flex gap-1 items-center ${className}`}>
        <span className="text-sm text-muted-foreground mr-2">Year:</span>
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    )
  }

  return (
    <div className={`flex gap-1 items-center flex-wrap ${className}`}>
      <span className="text-sm text-muted-foreground mr-2">Year:</span>
      <Button
        variant={selectedYear === 'all' ? 'default' : 'outline'}
        size="sm"
        onClick={() => handleYearChange('all')}
      >
        All
      </Button>
      {availableYears.map((year) => (
        <Button
          key={year}
          variant={selectedYear === year ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleYearChange(year)}
        >
          {year}
        </Button>
      ))}
    </div>
  )
}