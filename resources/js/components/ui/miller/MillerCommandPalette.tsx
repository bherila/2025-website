import { type Dispatch, type ReactElement, type SetStateAction, useEffect, useMemo } from 'react'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

export interface MillerCommandPaletteRow<Category extends string> {
  rowKey: string
  label: string
  keywords: string[]
  category: Category
}

export interface MillerCommandPaletteProps<Category extends string, Row extends MillerCommandPaletteRow<Category>> {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  placeholder: string
  emptyMessage: string
  groupOrder: readonly Category[]
  groupHeadings: Record<Category, string>
  rows: Row[]
  onSelect: (row: Row) => void
}

export function MillerCommandPalette<Category extends string, Row extends MillerCommandPaletteRow<Category>>({
  open,
  onOpenChange,
  title,
  description,
  placeholder,
  emptyMessage,
  groupOrder,
  groupHeadings,
  rows,
  onSelect,
}: MillerCommandPaletteProps<Category, Row>): ReactElement {
  const grouped = useMemo(() => groupByCategory(rows), [rows])

  const handleSelect = (row: Row): void => {
    onOpenChange(false)
    onSelect(row)
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <CommandInput placeholder={placeholder} />
      <CommandList>
        <CommandEmpty>{emptyMessage}</CommandEmpty>
        {groupOrder.map((category) => {
          const items = grouped[category]
          if (!items || items.length === 0) {
            return null
          }

          return (
            <CommandGroup key={category} heading={groupHeadings[category]}>
              {items.map((row) => (
                <CommandItem key={row.rowKey} value={row.rowKey} keywords={row.keywords} onSelect={() => handleSelect(row)}>
                  {row.label}
                </CommandItem>
              ))}
            </CommandGroup>
          )
        })}
      </CommandList>
    </CommandDialog>
  )
}

export function useMillerCommandPaletteShortcut(
  open: boolean,
  setOpen: Dispatch<SetStateAction<boolean>>,
): void {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handler = (event: KeyboardEvent): void => {
      if (!isPaletteShortcut(event) || event.defaultPrevented) {
        return
      }
      if (!open && shouldSuppressPaletteShortcut(event)) {
        return
      }

      event.preventDefault()
      setOpen((prev) => !prev)
    }

    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
    }
  }, [open, setOpen])
}

function groupByCategory<Category extends string, Row extends MillerCommandPaletteRow<Category>>(
  rows: Row[],
): Partial<Record<Category, Row[]>> {
  const out: Partial<Record<Category, Row[]>> = {}
  for (const row of rows) {
    if (!out[row.category]) {
      out[row.category] = []
    }
    out[row.category]!.push(row)
  }
  return out
}

function isPaletteShortcut(event: KeyboardEvent): boolean {
  return (event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey)
}

function shouldSuppressPaletteShortcut(event: KeyboardEvent): boolean {
  return isEditableTarget(event) || document.querySelector('[role="dialog"][data-open]') !== null
}

function isEditableTarget(event: KeyboardEvent): boolean {
  const target = event.target instanceof HTMLElement ? event.target : document.activeElement
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.isContentEditable || target.closest('[contenteditable="true"]')) {
    return true
  }

  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}
