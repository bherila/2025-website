'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface TransactionListColumn<T> {
  key: string
  label: ReactNode
  align?: 'left' | 'right'
  render: (row: T) => ReactNode
  className?: string
  headerClassName?: string
}

export interface TransactionListProps<T> {
  rows: T[]
  columns: TransactionListColumn<T>[]
  getRowKey: (row: T, index: number) => string | number
  rowAction?: (row: T) => ReactNode
  total?: ReactNode
  totalLabel?: ReactNode
  totalColumnKey?: string
  rowCap?: number
  variant?: 'inline' | 'modal'
  emptyMessage?: string
  className?: string
  columnTemplate?: string
  rowClassName?: (row: T, index: number) => string | undefined
}

export interface TransactionListDialogProps<T> extends Omit<TransactionListProps<T>, 'variant'> {
  title: ReactNode
  open?: boolean
  onOpenChange: (open: boolean) => void
}

function alignmentClass(align: 'left' | 'right' | undefined): string {
  return align === 'right' ? 'justify-self-end text-right' : 'min-w-0 text-left'
}

function defaultColumnTemplate<T>(columns: TransactionListColumn<T>[], hasAction: boolean): string {
  const dataColumns = columns.map((_, index) => (index === 0 ? 'minmax(0,1.35fr)' : 'minmax(4.5rem,1fr)'))
  return [...dataColumns, ...(hasAction ? ['2rem'] : [])].join(' ')
}

export function TransactionList<T>({
  rows,
  columns,
  getRowKey,
  rowAction,
  total,
  totalLabel = 'Total',
  totalColumnKey,
  rowCap,
  variant = 'inline',
  emptyMessage = 'No transactions found.',
  className = '',
  columnTemplate,
  rowClassName,
}: TransactionListProps<T>) {
  const [showAll, setShowAll] = useState(false)
  const visibleRows = useMemo(() => {
    if (!rowCap || showAll) {
      return rows
    }

    return rows.slice(0, rowCap)
  }, [rowCap, rows, showAll])
  const hiddenCount = rows.length - visibleRows.length
  const gridTemplateColumns = columnTemplate ?? defaultColumnTemplate(columns, rowAction !== undefined)
  const compactClass = variant === 'inline' ? 'text-[11px]' : 'text-xs'
  const resolvedTotalColumnKey = totalColumnKey ?? columns[columns.length - 1]?.key

  if (rows.length === 0) {
    return (
      <div className={`rounded-md border border-dashed border-border/70 px-3 py-3 text-center text-xs text-muted-foreground ${className}`}>
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className={`overflow-hidden rounded-md border border-border/70 ${variant === 'inline' ? 'bg-muted/10' : 'bg-background'} ${className}`}>
      <div
        className={`grid items-center gap-2 bg-muted/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ${compactClass}`}
        style={{ gridTemplateColumns }}
      >
        {columns.map((column) => (
          <span key={column.key} className={`${alignmentClass(column.align)} ${column.headerClassName ?? ''}`}>
            {column.label}
          </span>
        ))}
        {rowAction && <span aria-hidden="true" />}
      </div>

      <div className="divide-y divide-dashed divide-border/50">
        {visibleRows.map((row, index) => (
          <div
            key={getRowKey(row, index)}
            className={`grid items-center gap-2 px-3 py-1.5 tabular-nums ${compactClass} ${rowClassName?.(row, index) ?? ''}`}
            style={{ gridTemplateColumns }}
          >
            {columns.map((column) => (
              <span key={column.key} className={`${alignmentClass(column.align)} ${column.className ?? ''}`}>
                {column.render(row)}
              </span>
            ))}
            {rowAction && <span className="justify-self-end">{rowAction(row)}</span>}
          </div>
        ))}
      </div>

      {hiddenCount > 0 && (
        <div className="bg-muted/20 px-3 py-1.5 text-center text-[11px] text-muted-foreground">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={() => setShowAll(true)}
          >
            Show {hiddenCount} more transaction{hiddenCount === 1 ? '' : 's'}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
      )}

      {rowCap && showAll && rows.length > rowCap && (
        <div className="bg-muted/20 px-3 py-1.5 text-center text-[11px] text-muted-foreground">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={() => setShowAll(false)}
          >
            Show fewer transactions
            <ChevronUp className="h-3 w-3" />
          </Button>
        </div>
      )}

      {total !== undefined && (
        <div
          className={`grid items-center gap-2 bg-muted/30 px-3 py-1.5 font-semibold tabular-nums ${compactClass}`}
          style={{ gridTemplateColumns }}
        >
          {columns.map((column, index) => (
            <span key={column.key} className={`${alignmentClass(column.align)} ${column.className ?? ''}`}>
              {index === 0 ? totalLabel : column.key === resolvedTotalColumnKey ? total : null}
            </span>
          ))}
          {rowAction && <span aria-hidden="true" />}
        </div>
      )}
    </div>
  )
}

export function TransactionListDialog<T>({
  title,
  open = true,
  onOpenChange,
  ...props
}: TransactionListDialogProps<T>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <TransactionList {...props} variant="modal" />
      </DialogContent>
    </Dialog>
  )
}
