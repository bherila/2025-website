'use client'

import { useCallback, useEffect, useState } from 'react'

import ScheduleCPage from '@/components/finance/ScheduleCPage'

import { YearSelectorWithNav } from './YearSelectorWithNav'

/**
 * Tax Preview page — comprehensive tax analysis and planning view.
 * Currently renders Schedule C for each schedule_c employment entity.
 * Will be extended with additional tax forms in the future.
 */
export default function TaxPreviewPage() {
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [isYearsLoading, setIsYearsLoading] = useState(true)

  // Read initial year from URL query string, default to current year
  const [selectedYear, setSelectedYear] = useState<number | 'all'>(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const y = params.get('year')
      if (y === 'all') return 'all'
      const parsed = y ? parseInt(y, 10) : NaN
      return isNaN(parsed) ? new Date().getFullYear() : parsed
    } catch {
      return new Date().getFullYear()
    }
  })

  // Push browser history when the user changes year (so Back button works)
  const handleYearChange = useCallback((year: number | 'all') => {
    setSelectedYear(year)
    const url = new URL(window.location.href)
    const defaultYear = new Date().getFullYear()
    if (typeof year === 'number' && year === defaultYear) {
      url.searchParams.delete('year')
    } else {
      url.searchParams.set('year', String(year))
    }
    window.history.pushState(null, '', url.toString())
  }, [])

  // Restore selected year when the user navigates with Back / Forward
  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search)
      const y = params.get('year')
      if (y === 'all') {
        setSelectedYear('all')
      } else {
        const parsed = y ? parseInt(y, 10) : NaN
        setSelectedYear(isNaN(parsed) ? new Date().getFullYear() : parsed)
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const handleAvailableYearsChange = useCallback((years: number[], isLoading: boolean) => {
    setAvailableYears(years)
    setIsYearsLoading(isLoading)
  }, [])

  return (
    <div>
      <div className="flex items-center gap-4 px-4 pt-4 pb-2 flex-wrap">
        <h1 className="text-2xl font-bold">Tax Preview</h1>
        <div className="ml-auto">
          <YearSelectorWithNav
            selectedYear={selectedYear}
            availableYears={availableYears}
            isLoading={isYearsLoading && availableYears.length === 0}
            onYearChange={handleYearChange}
          />
        </div>
      </div>
      <ScheduleCPage
        selectedYear={selectedYear}
        onAvailableYearsChange={handleAvailableYearsChange}
      />
    </div>
  )
}
