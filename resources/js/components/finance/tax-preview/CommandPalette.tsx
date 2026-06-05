import { type Dispatch, type SetStateAction, useMemo } from 'react'

import { MillerCommandPalette, type MillerCommandPaletteRow, useMillerCommandPaletteShortcut } from '@/components/ui/miller'

import { useTaxPreview } from '../TaxPreviewContext'
import { useDockActions } from './DockActions'
import { type FormCategory, type FormId, type FormRegistry, type FormRegistryEntry, getTaxFormMeta } from './formRegistry'
import { useTaxRoute } from './useTaxRoute'

const GROUP_ORDER: FormCategory[] = ['Schedule', 'Form', 'Worksheet', 'App']
const GROUP_HEADINGS: Record<FormCategory, string> = {
  Schedule: 'Schedules',
  Form: 'Forms',
  Worksheet: 'Worksheets',
  App: 'App',
}

interface PaletteRow extends MillerCommandPaletteRow<FormCategory> {
  /** Unique key per row — `formId` for singletons, `formId:instanceKey` for instances, `formId:create` for create rows. */
  rowKey: string
  formId: FormId
  instanceKey?: string
  /** True for the "+ Create new instance" row of a multi-instance form. */
  isCreate?: boolean
  label: string
  keywords: string[]
  category: FormCategory
  presentation: FormRegistryEntry['presentation']
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  registry: FormRegistry
}

/**
 * ⌘K command palette for jumping to any form, instance, or worksheet from
 * anywhere in the dock. Wraps the shadcn `<Command>` (cmdk) primitive.
 */
export function CommandPalette({ open, onOpenChange, registry }: CommandPaletteProps): React.ReactElement {
  const state = useTaxPreview()
  const { pushColumn, replaceFrom, navigate } = useTaxRoute()
  const { openWorksheet } = useDockActions()

  const rows = useMemo(() => buildRows(registry, state), [registry, state])

  const handleSelect = (row: PaletteRow): void => {
    if (row.presentation === 'modal') {
      openWorksheet(row.formId)
      return
    }
    if (row.presentation === 'app') {
      // App entries (Home, Action Items, Estimate, Documents) don't drill;
      // 'home' clears the route, others push as a column.
      if (row.formId === 'home') {
        navigate({ columns: [] })
        return
      }
      pushColumn({ form: row.formId })
      return
    }
    // Column presentation — schedule or form.
    if (row.isCreate) {
      const entry = registry[row.formId]
      if (entry?.instances?.allowCreate) {
        const created = entry.instances.create(state)
        pushColumn({ form: row.formId, instance: created.key })
      }
      return
    }
    pushColumn(
      row.instanceKey ? { form: row.formId, instance: row.instanceKey } : { form: row.formId },
    )
    // Suppress unused warning during incremental wiring; replaceFrom is reserved
    // for future "open in current depth" actions.
    void replaceFrom
  }

  return (
    <MillerCommandPalette
      open={open}
      onOpenChange={onOpenChange}
      title="Jump to form"
      description="Search forms, schedules, and worksheets"
      placeholder="Jump to a form, schedule, or worksheet…"
      emptyMessage="No matching forms."
      groupOrder={GROUP_ORDER}
      groupHeadings={GROUP_HEADINGS}
      rows={rows}
      onSelect={handleSelect}
    />
  )
}

/**
 * Hook that registers the global ⌘K / Ctrl+K shortcut. Skips when an editable
 * field has focus or a Dialog is already open (so the palette doesn't fight
 * with worksheet/K-1 modals).
 */
export function useCommandPaletteShortcut(
  open: boolean,
  setOpen: Dispatch<SetStateAction<boolean>>,
): void {
  useMillerCommandPaletteShortcut(open, setOpen)
}

function buildRows(registry: FormRegistry, state: ReturnType<typeof useTaxPreview>): PaletteRow[] {
  const rows: PaletteRow[] = []
  for (const entry of Object.values(registry)) {
    const meta = getTaxFormMeta(entry)

    const baseLabel = entry.label
    const formNumber = meta.formNumber ? [meta.formNumber] : []
    const baseKeywords = [...meta.keywords, ...formNumber, entry.shortLabel, entry.id]

    if (entry.instances) {
      const instances = entry.instances.list(state)
      for (const inst of instances) {
        rows.push({
          rowKey: `${entry.id}:${inst.key}`,
          formId: entry.id,
          instanceKey: inst.key,
          label: `${entry.shortLabel} — ${inst.label}`,
          keywords: [...baseKeywords, inst.label, inst.key],
          category: meta.category,
          presentation: entry.presentation,
        })
      }
      if (entry.instances.allowCreate) {
        rows.push({
          rowKey: `${entry.id}:create`,
          formId: entry.id,
          isCreate: true,
          label: `${entry.shortLabel} — + Create new instance`,
          keywords: [...baseKeywords, 'new', 'create', 'add'],
          category: meta.category,
          presentation: entry.presentation,
        })
      }
      continue
    }

    rows.push({
      rowKey: entry.id,
      formId: entry.id,
      label: baseLabel,
      keywords: baseKeywords,
      category: meta.category,
      presentation: entry.presentation,
    })
  }
  return rows
}
