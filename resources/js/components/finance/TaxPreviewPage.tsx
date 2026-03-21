'use client'

import { useCallback, useEffect, useState } from 'react'

import ScheduleCPreview from '@/components/finance/ScheduleCPreview'

import { YearSelectorWithNav } from './YearSelectorWithNav'

/**
 * Tax Preview page — comprehensive tax analysis and planning view.
 * Currently renders Schedule C for each schedule_c employment entity.
 * Will be extended with additional tax forms in the future.
 */
export default function TaxPreviewPage() {
  const [hadExplicitYearParamOnLoad, setHadExplicitYearParamOnLoad] = useState(false)
  const [hadInvalidYearParamOnLoad, setHadInvalidYearParamOnLoad] = useState(false)
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

  const setYearInUrl = useCallback((year: number | 'all', mode: 'push' | 'replace' = 'push') => {
    const url = new URL(window.location.href)
    const defaultYear = new Date().getFullYear()
    if (typeof year === 'number' && year === defaultYear) {
      url.searchParams.delete('year')
    } else {
      url.searchParams.set('year', String(year))
    }
    if (mode === 'replace') {
      window.history.replaceState(null, '', url.toString())
      return
    }
    window.history.pushState(null, '', url.toString())
  }, [])

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const y = params.get('year')
      setHadExplicitYearParamOnLoad(y !== null)
      setHadInvalidYearParamOnLoad(y !== null && y !== 'all' && Number.isNaN(parseInt(y, 10)))
    } catch {
      setHadExplicitYearParamOnLoad(false)
      setHadInvalidYearParamOnLoad(false)
    }
  }, [])

  // Push browser history when the user changes year (so Back button works)
  const handleYearChange = useCallback((year: number | 'all') => {
    setSelectedYear(year)
    setYearInUrl(year, 'push')
  }, [setYearInUrl])

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

  // Normalize invalid year query values so URL always matches the selected state.
  useEffect(() => {
    if (!hadInvalidYearParamOnLoad) return
    setYearInUrl(selectedYear, 'replace')
  }, [hadInvalidYearParamOnLoad, selectedYear, setYearInUrl])

  // If year wasn't explicitly set in URL, default to newest available year when current year has no data.
  useEffect(() => {
    if ((hadExplicitYearParamOnLoad && !hadInvalidYearParamOnLoad) || isYearsLoading || availableYears.length === 0) return
    if (typeof selectedYear !== 'number') return
    if (availableYears.includes(selectedYear)) return
    const newestYear = availableYears[0]
    if (newestYear === undefined) return
    setSelectedYear(newestYear)
    setYearInUrl(newestYear, 'replace')
  }, [availableYears, hadExplicitYearParamOnLoad, hadInvalidYearParamOnLoad, isYearsLoading, selectedYear, setYearInUrl])

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
      <ScheduleCPreview
        selectedYear={selectedYear}
        onAvailableYearsChange={handleAvailableYearsChange}
      />
    </div>
  )
}
