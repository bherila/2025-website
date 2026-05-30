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

  const committed: DateRange = {
    from: toDate(from),
    to: toDate(to),
  }

  function handleOpenChange(isOpen: boolean) {
    if (isOpen) {
      setPendingRange(undefined)
    }
    setOpen(isOpen)
  }

  function handleSelect(range: DateRange | undefined) {
    setPendingRange(range)
    if (range?.from && range?.to) {
      onFromChange(toInputValue(range.from))
      onToChange(toInputValue(range.to))
      setOpen(false)
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
              format(committed.from, 'MMM d, y')
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
      </PopoverContent>
    </Popover>
  )
}
