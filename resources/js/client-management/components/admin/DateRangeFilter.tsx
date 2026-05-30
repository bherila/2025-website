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

  const selected: DateRange = {
    from: toDate(from),
    to: toDate(to),
  }

  function handleSelect(range: DateRange | undefined) {
    onFromChange(toInputValue(range?.from))
    onToChange(toInputValue(range?.to))
    if (range?.from && range?.to) {
      setOpen(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn('w-[240px] justify-start text-left font-normal', !from && !to && 'text-muted-foreground', className)}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {selected.from ? (
            selected.to ? (
              <>
                {format(selected.from, 'MMM d, y')} – {format(selected.to, 'MMM d, y')}
              </>
            ) : (
              format(selected.from, 'MMM d, y')
            )
          ) : (
            <span>Date range</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          {...(selected.from ? { defaultMonth: selected.from } : {})}
          selected={selected}
          onSelect={handleSelect}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  )
}
