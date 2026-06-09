import { useMemo } from 'react'

import { MillerCommandPalette, type MillerCommandPaletteRow } from '@/components/ui/miller'
import { commandFilter } from '@/lib/commandSearch'

import { type FinanceCommandRow, useRegisterFinanceCommands } from '../FinanceCommandRegistry'
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

interface LegacyPaletteRow extends MillerCommandPaletteRow<FormCategory> {
  rowKey: string
  action?: () => void
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  registry: FormRegistry
}

export function CommandPalette({ open, onOpenChange, registry }: CommandPaletteProps): React.ReactElement {
  const state = useTaxPreview()
  const { pushColumn, navigate } = useTaxRoute()
  const { openWorksheet } = useDockActions()
  const rows = useMemo(
    () => buildTaxPreviewCommandRows(registry, state, { pushColumn, navigate, openWorksheet }).map(toLegacyPaletteRow),
    [registry, state, pushColumn, navigate, openWorksheet],
  )

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
      onSelect={(row) => row.action?.()}
      filter={commandFilter}
    />
  )
}

interface TaxPreviewCommandRow extends FinanceCommandRow {
  formId: FormId
  instanceKey?: string
  isCreate?: boolean
  presentation: FormRegistryEntry['presentation']
}

interface TaxPreviewCommandHandlers {
  pushColumn: ReturnType<typeof useTaxRoute>['pushColumn']
  navigate: ReturnType<typeof useTaxRoute>['navigate']
  openWorksheet: ReturnType<typeof useDockActions>['openWorksheet']
}

export function useRegisterTaxPreviewCommands(registry: FormRegistry): void {
  const state = useTaxPreview()
  const { pushColumn, navigate } = useTaxRoute()
  const { openWorksheet } = useDockActions()

  const rows = useMemo(
    () => buildTaxPreviewCommandRows(registry, state, { pushColumn, navigate, openWorksheet }),
    [registry, state, pushColumn, navigate, openWorksheet],
  )

  useRegisterFinanceCommands('tax-preview', rows)
}

export function buildTaxPreviewCommandRows(
  registry: FormRegistry,
  state: ReturnType<typeof useTaxPreview>,
  handlers: TaxPreviewCommandHandlers,
): FinanceCommandRow[] {
  const rows: TaxPreviewCommandRow[] = []
  for (const entry of Object.values(registry)) {
    const meta = getTaxFormMeta(entry)

    if (meta.drillOnly) {
      continue
    }

    const baseLabel = entry.label
    const formNumber = meta.formNumber ? [meta.formNumber] : []
    const baseKeywords = [...meta.keywords, ...formNumber, entry.shortLabel, entry.id, meta.category]

    if (entry.instances) {
      const instances = entry.instances.list(state)
      for (const inst of instances) {
        rows.push(createTaxPreviewCommandRow({
          registry,
          state,
          handlers,
          entry,
          id: `tax-preview:${entry.id}:${inst.key}`,
          instanceKey: inst.key,
          label: `${entry.shortLabel} — ${inst.label}`,
          keywords: [...baseKeywords, inst.label, inst.key],
        }))
      }
      if (entry.instances.allowCreate) {
        rows.push(createTaxPreviewCommandRow({
          registry,
          state,
          handlers,
          entry,
          id: `tax-preview:${entry.id}:create`,
          isCreate: true,
          label: `${entry.shortLabel} — + Create new instance`,
          keywords: [...baseKeywords, 'new', 'create', 'add'],
        }))
      }
      continue
    }

    rows.push(createTaxPreviewCommandRow({
      registry,
      state,
      handlers,
      entry,
      id: `tax-preview:${entry.id}`,
      label: baseLabel,
      keywords: baseKeywords,
    }))
  }

  return rows
}

function createTaxPreviewCommandRow({
  registry,
  state,
  handlers,
  entry,
  id,
  label,
  keywords,
  instanceKey,
  isCreate,
}: {
  registry: FormRegistry
  state: ReturnType<typeof useTaxPreview>
  handlers: TaxPreviewCommandHandlers
  entry: FormRegistryEntry
  id: string
  label: string
  keywords: string[]
  instanceKey?: string
  isCreate?: boolean
}): TaxPreviewCommandRow {
  const meta = getTaxFormMeta(entry)

  return {
    id,
    formId: entry.id,
    ...(instanceKey ? { instanceKey } : {}),
    ...(isCreate ? { isCreate } : {}),
    label,
    description: meta.category,
    category: 'Tax Preview',
    keywords,
    presentation: entry.presentation,
    action: () => selectTaxPreviewCommandRow({
      registry,
      state,
      handlers,
      entry,
      ...(instanceKey ? { instanceKey } : {}),
      ...(isCreate ? { isCreate } : {}),
    }),
  }
}


function toLegacyPaletteRow(row: FinanceCommandRow): LegacyPaletteRow {
  const category = legacyCategory(row.description)

  return {
    rowKey: row.id,
    label: row.label,
    keywords: row.keywords,
    ...(row.description ? { description: row.description } : {}),
    category,
    ...(row.action ? { action: row.action } : {}),
  }
}

function legacyCategory(description?: string): FormCategory {
  if (description === 'Schedule' || description === 'Form' || description === 'Worksheet' || description === 'App') {
    return description
  }

  return 'Form'
}

function selectTaxPreviewCommandRow({
  registry,
  state,
  handlers,
  entry,
  instanceKey,
  isCreate,
}: {
  registry: FormRegistry
  state: ReturnType<typeof useTaxPreview>
  handlers: TaxPreviewCommandHandlers
  entry: FormRegistryEntry
  instanceKey?: string
  isCreate?: boolean
}): void {
  if (entry.presentation === 'modal') {
    handlers.openWorksheet(entry.id)
    return
  }
  if (entry.presentation === 'app') {
    if (entry.id === 'home') {
      handlers.navigate({ columns: [] })
      return
    }
    handlers.pushColumn({ form: entry.id })
    return
  }
  if (isCreate) {
    if (entry.instances?.allowCreate) {
      const created = entry.instances.create(state)
      handlers.pushColumn({ form: entry.id, instance: created.key })
    }
    return
  }

  handlers.pushColumn(instanceKey ? { form: entry.id, instance: instanceKey } : { form: entry.id })
  void registry
}
