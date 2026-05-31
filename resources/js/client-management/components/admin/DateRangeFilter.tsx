import { format } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { useState } from 'react'
import type { DateRange } from 'react-day-picker'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface DateRangeFilterProps {
  from: string
  to: string
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
  className?: string
}

function toDate(value: string): Date | undefined {
  if (!value) {
    return undefined
  }
  const d = new Date(value + 'T00:00:00')
  return isNaN(d.getTime()) ? undefined : d
}

function toInputValue(date: Date | undefined): string {
  return date ? format(date, 'yyyy-MM-dd') : ''
}

export default function DateRangeFilter({ from, to, onFromChange, onToChange, className }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false)
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>(undefined)
  // Tracks whether the user has clicked a start date and is now picking an end date.
  // react-day-picker v10 returns { from: d, to: d } on the first click, so we cannot
  // rely on from !== to to distinguish "first click" from "second click".
  const [hasStartDate, setHasStartDate] = useState(false)

  const committed: DateRange = {
    from: toDate(from),
    to: toDate(to),
  }

  function handleOpenChange(isOpen: boolean) {
    if (isOpen) {
      setPendingRange(undefined)
      setHasStartDate(false)
    }
    setOpen(isOpen)
  }

  function handleClear() {
    setPendingRange(undefined)
    setHasStartDate(false)
    onFromChange('')
    onToChange('')
    setOpen(false)
  }

  function handleApplyFrom() {
    if (!pendingRange?.from) return
    onFromChange(toInputValue(pendingRange.from))
    onToChange('')
    setOpen(false)
    setPendingRange(undefined)
    setHasStartDate(false)
  }

  function handleSelect(range: DateRange | undefined) {
    if (!range) {
      if (hasStartDate && pendingRange?.from) {
        // User clicked the already-selected start date a second time — commit as a single-day range.
        const singleDay = toInputValue(pendingRange.from)
        onFromChange(singleDay)
        onToChange(singleDay)
        setOpen(false)
        setPendingRange(undefined)
        setHasStartDate(false)
      } else {
        // No start date yet — just reset (e.g. spurious deselect on popover open).
        setPendingRange(undefined)
        setHasStartDate(false)
      }
      return
    }
    setPendingRange(range)
    if (!hasStartDate) {
      // First click: start date chosen, keep popover open for end date.
      setHasStartDate(true)
    } else if (range.from && range.to) {
      // Second click: commit whatever range DayPicker produced, including single-day.
      onFromChange(toInputValue(range.from))
      onToChange(toInputValue(range.to))
      setOpen(false)
      setHasStartDate(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn('w-[240px] justify-start text-left font-normal', !from && !to && 'text-muted-foreground', className)}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {committed.from ? (
            committed.to ? (
              <>
                {format(committed.from, 'MMM d, y')} – {format(committed.to, 'MMM d, y')}
              </>
            ) : (
              <>From {format(committed.from, 'MMM d, y')}</>
            )
          ) : (
            <span>Date range</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          {...(pendingRange?.from ? { defaultMonth: pendingRange.from } : committed.from ? { defaultMonth: committed.from } : {})}
          selected={pendingRange}
          onSelect={handleSelect}
          numberOfMonths={2}
        />
        {(hasStartDate || from || to) && (
          <div className="flex items-center justify-between border-t p-2">
            {hasStartDate && pendingRange?.from && (
              <Button variant="outline" size="sm" onClick={handleApplyFrom}>
                From {format(pendingRange.from, 'MMM d')} only
              </Button>
            )}
            {(from || to) && (
              <Button variant="ghost" size="sm" onClick={handleClear} className="ml-auto">
                Clear
              </Button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
