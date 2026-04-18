import type { AccountLineItem } from '@/data/finance/AccountLineItem'
import { cn } from '@/lib/utils'

export const thClass =
  'text-left py-3 px-2 text-[10px] tracking-widest uppercase text-muted-foreground font-medium align-top whitespace-nowrap cursor-pointer hover:text-foreground transition-colors'

export const inputClass =
  'bg-background/50 border border-border text-foreground text-xs rounded px-2 py-1 w-full mt-1 focus:ring-1 focus:ring-ring outline-none font-mono'

interface ColumnHeaderProps {
  label: string
  field?: keyof AccountLineItem
  sortField: keyof AccountLineItem | null
  sortDirection: 'asc' | 'desc'
  onSort?: () => void
  filter?: string
  setFilter?: (value: string) => void
  className?: string
}

export function ColumnHeader({
  label,
  field,
  sortField,
  sortDirection,
  onSort,
  filter,
  setFilter,
  className,
}: ColumnHeaderProps) {
  const isSorted = field != null && sortField === field
  return (
    <th
      className={cn(thClass, !onSort && 'cursor-default', className)}
      onClick={onSort}
    >
      <div>
        {label}{isSorted && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
      </div>
      {setFilter != null && (
        <div className="relative mt-1">
          <input
            className={inputClass}
            placeholder="Filter..."
            value={filter ?? ''}
            onChange={(e) => setFilter(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </th>
  )
}
