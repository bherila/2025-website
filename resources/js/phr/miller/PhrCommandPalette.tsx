import { useEffect, useMemo } from 'react'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { type MillerDrillTarget } from '@/components/ui/miller'

import {
  PHR_LIST_MODULES,
  type PhrModuleCategory,
  type PhrModuleId,
  type phrModuleRegistry,
  type PhrRegistryEntry,
} from './phrModuleRegistry'

const GROUP_ORDER: PhrModuleCategory[] = ['Clinical', 'Documents & Imaging', 'Admin']
const GROUP_HEADINGS: Record<PhrModuleCategory, string> = {
  Clinical: 'Clinical',
  'Documents & Imaging': 'Documents & Imaging',
  Admin: 'Admin',
}

const DIRECT_JUMP_MODULE_IDS: ReadonlySet<PhrModuleId> = new Set(PHR_LIST_MODULES.map((module) => module.id))

interface PaletteRow {
  rowKey: string
  moduleId: PhrModuleId
  label: string
  keywords: string[]
  category: PhrModuleCategory
}

interface PhrCommandPaletteProps {
  open: boolean
  onClose: () => void
  onDrill: (target: MillerDrillTarget<PhrModuleId>) => void
  registry: typeof phrModuleRegistry
}

/**
 * Cmd/Ctrl-K command palette for jumping to root PHR modules.
 */
export function PhrCommandPalette({ open, onClose, onDrill, registry }: PhrCommandPaletteProps): React.ReactElement {
  const rows = useMemo(() => buildRows(registry), [registry])
  const grouped = useMemo(() => groupByCategory(rows), [rows])

  const handleSelect = (row: PaletteRow): void => {
    onClose()
    onDrill({ id: row.moduleId })
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose()
        }
      }}
      title="Jump to PHR module"
      description="Search clinical, document, and access modules"
    >
      <CommandInput placeholder="Jump to a PHR module…" />
      <CommandList>
        <CommandEmpty>No matching modules.</CommandEmpty>
        {GROUP_ORDER.map((category) => {
          const items = grouped[category]
          if (!items || items.length === 0) {
            return null
          }

          return (
            <CommandGroup key={category} heading={GROUP_HEADINGS[category]}>
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

export function usePhrCommandPaletteShortcut(
  open: boolean,
  setOpen: (next: boolean | ((prev: boolean) => boolean)) => void,
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

function buildRows(registry: typeof phrModuleRegistry): PaletteRow[] {
  const rows: PaletteRow[] = []

  for (const entry of Object.values(registry)) {
    if (!isDirectJumpEntry(entry)) {
      continue
    }

    const category = entry.meta?.category ?? entry.category
    const keywords = entry.meta?.keywords ?? entry.keywords

    rows.push({
      rowKey: entry.id,
      moduleId: entry.id,
      label: entry.label,
      keywords: uniqueKeywords([...keywords, entry.label, entry.shortLabel, entry.id]),
      category,
    })
  }

  return rows
}

function isDirectJumpEntry(entry: PhrRegistryEntry): boolean {
  return DIRECT_JUMP_MODULE_IDS.has(entry.id) && entry.presentation === 'column' && entry.instances === undefined
}

function uniqueKeywords(keywords: string[]): string[] {
  return Array.from(new Set(keywords.filter((keyword) => keyword.trim() !== '')))
}

function groupByCategory(rows: PaletteRow[]): Partial<Record<PhrModuleCategory, PaletteRow[]>> {
  const out: Partial<Record<PhrModuleCategory, PaletteRow[]>> = {}
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
