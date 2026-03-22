'use client'

import { Minus, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import type { YearSelection } from '@/lib/financeRouteBuilder'

export interface YearSelectorWithNavProps {
  selectedYear: YearSelection
  availableYears: number[]
  isLoading?: boolean | undefined
  onYearChange: (year: YearSelection) => void
  className?: string | undefined
  /** When true, includes an "All Years" option (default: true) */
  includeAll?: boolean | undefined
}

/**
 * A year selector dropdown with −/+ navigation buttons to step through available years.
 * The − button goes to the previous (older) year; the + button goes to the next (newer) year.
 * Reused across the finance module wherever year selection is needed.
 */
export function YearSelectorWithNav({
  selectedYear,
  availableYears,
  isLoading = false,
  onYearChange,
  className = '',
  includeAll = true,
}: YearSelectorWithNavProps) {
  // availableYears is sorted descending (newest first)
  const currentIndex =
    typeof selectedYear === 'number' ? availableYears.indexOf(selectedYear) : -1

  // "−" = go to older year = higher index in the descending array
  const canGoPrev = currentIndex < availableYears.length - 1
  // "+" = go to newer year = lower index in the descending array
  const canGoNext = currentIndex > 0

  const handlePrev = () => {
    if (canGoPrev && currentIndex >= 0) {
      const year = availableYears[currentIndex + 1]
      if (year !== undefined) onYearChange(year)
    } else if (currentIndex === -1 && availableYears.length > 0) {
      // "all" → jump to oldest year
      const year = availableYears[availableYears.length - 1]
      if (year !== undefined) onYearChange(year)
    }
  }

  const handleNext = () => {
    if (canGoNext && currentIndex >= 0) {
      const year = availableYears[currentIndex - 1]
      if (year !== undefined) onYearChange(year)
    } else if (currentIndex === -1 && availableYears.length > 0) {
      // "all" → jump to newest year
      const year = availableYears[0]
      if (year !== undefined) onYearChange(year)
    }
  }

  if (isLoading) {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-8" />
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={handlePrev}
        disabled={currentIndex === availableYears.length - 1}
        title="Previous year"
        type="button"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Select
        value={String(selectedYear)}
        onValueChange={(v) => onYearChange(v === 'all' ? 'all' : parseInt(v, 10))}
      >
        <SelectTrigger className="w-28">
          <SelectValue placeholder="Year" />
        </SelectTrigger>
        <SelectContent>
          {includeAll && <SelectItem value="all">All Years</SelectItem>}
          {availableYears.map((year) => (
            <SelectItem key={year} value={String(year)}>
              {year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={handleNext}
        disabled={currentIndex === 0}
        title="Next year"
        type="button"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  )
}
