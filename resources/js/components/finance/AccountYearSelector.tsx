'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { fetchWrapper } from '@/fetchWrapper'
import { z } from 'zod'

export type YearSelection = number | 'all'

interface AccountYearSelectorProps {
  accountId: number
  onYearChange?: ((year: YearSelection) => void) | undefined
  className?: string
}

const STORAGE_KEY_PREFIX = 'finance_year_'

function getStorageKey(accountId: number): string {
  return `${STORAGE_KEY_PREFIX}${accountId}`
}

export function getStoredYear(accountId: number): YearSelection | null {
  try {
    const stored = sessionStorage.getItem(getStorageKey(accountId))
    if (stored === 'all') return 'all'
    if (stored) {
      const parsed = parseInt(stored, 10)
      if (!isNaN(parsed)) return parsed
    }
  } catch {
    // sessionStorage not available
  }
  return null
}

export function setStoredYear(accountId: number, year: YearSelection): void {
  try {
    sessionStorage.setItem(getStorageKey(accountId), String(year))
    // Dispatch custom event for same-page updates
    window.dispatchEvent(new CustomEvent('accountYearChange', { detail: { accountId, year } }))
  } catch {
    // sessionStorage not available
  }
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

  // Load from sessionStorage on mount
  useEffect(() => {
    const stored = getStoredYear(accountId)
    if (stored !== null) {
      setSelectedYearState(stored)
    }
  }, [accountId])

  // Fetch available years
  useEffect(() => {
    const fetchYears = async () => {
      try {
        const years = await fetchWrapper.get(`/api/finance/${accountId}/transaction-years`)
        const parsedYears = z.array(z.number()).parse(years)
        setAvailableYears(parsedYears)
        
        // If no year stored yet, default to most recent year
        const stored = getStoredYear(accountId)
        if (stored === null) {
          const defaultYear = parsedYears.length > 0 && parsedYears[0] !== undefined 
            ? parsedYears[0] 
            : 'all'
          setSelectedYearState(defaultYear)
          setStoredYear(accountId, defaultYear)
        }
        setIsLoading(false)
      } catch (error) {
        console.error('Error fetching years:', error)
        setAvailableYears([])
        if (getStoredYear(accountId) === null) {
          setSelectedYearState('all')
          setStoredYear(accountId, 'all')
        }
        setIsLoading(false)
      }
    }
    fetchYears()
  }, [accountId])

  const setSelectedYear = useCallback((year: YearSelection) => {
    setSelectedYearState(year)
    setStoredYear(accountId, year)
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
