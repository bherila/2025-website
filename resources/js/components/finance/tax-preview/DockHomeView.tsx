import type { ReactNode } from 'react'

import { computeActionItemSeverityCounts } from '@/components/finance/actionItemsCounts'
import LotReconciliationHealthWidget from '@/components/finance/LotReconciliationHealthWidget'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MillerDockSection, type MillerDockTileAmount, type MillerDockTileEntry, MillerDockTileGrid } from '@/components/ui/miller'
import { formatFriendlyAmount } from '@/lib/formatCurrency'

import { useTaxPreview } from '../TaxPreviewContext'
import { useDockActions } from './DockActions'
import { type FormCategory, type FormId, type FormRegistryEntry, getTaxFormMeta, type KeyAmount, type TaxPreviewState } from './formRegistry'
import { formRegistry } from './registry'
import { useTaxPreviewPrefs } from './useTaxPreviewPrefs'
import { useTaxRoute } from './useTaxRoute'

function actionItemBadge(counts: { alert: number; warn: number }): React.ReactElement | null {
  if (counts.alert === 0 && counts.warn === 0) {
    return null
  }
  if (counts.alert > 0) {
    return (
      <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
        {counts.alert}
      </Badge>
    )
  }
  return (
    <Badge className="h-4 bg-amber-500 px-1.5 text-[10px] text-white hover:bg-amber-600">
      {counts.warn}
    </Badge>
  )
}

function formatKeyValue(value: number): string {
  const sign = value < 0 ? '-' : ''
  const formatted = formatFriendlyAmount(Math.abs(value))
  return value < 0 ? `(${formatted})` : `${sign}$${formatted}`
}

export function DockHomeView(): React.ReactElement {
  const { replaceFrom } = useTaxRoute()
  const openForm = (form: FormId): void => replaceFrom(0, { form })

  const { openWorksheet } = useDockActions()
  const taxPreview = useTaxPreview()
  const { recent, pinned, togglePin, isPinned, clearRecent } = useTaxPreviewPrefs(taxPreview.year)
  const actionCounts = computeActionItemSeverityCounts({
    reviewedK1Docs: taxPreview.reviewedK1Docs,
    reviewed1099Docs: taxPreview.reviewed1099Docs,
    income1099: taxPreview.income1099,
  })
  const columnEntries = Object.values(formRegistry).filter((e) => e.presentation === 'column')
  const worksheets = Object.values(formRegistry).filter((e) => e.presentation === 'modal')

  const schedules = columnEntries.filter((e) => getTaxFormMeta(e).category === 'Schedule')
  const forms = columnEntries.filter((e) => getTaxFormMeta(e).category === 'Form')
  const apps = Object.values(formRegistry).filter((e) => getTaxFormMeta(e).category === 'App' && e.id !== 'home')

  const pinnedEntries = resolveEntries(pinned).filter((e) => isPinnable(e))
  const recentEntries = resolveEntries(recent).filter((e) => !pinned.includes(e.id))

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <header className="space-y-1 border-b border-primary/25 pb-4">
        <h1 className="finance-heading-1">Tax Preview</h1>
        <p className="text-sm text-muted-foreground">
          Drill-down preview shell. Click any form to open it as a column. Browser back/forward navigates the column
          stack; click the form name in the header bar to return here.
        </p>
      </header>

      <LotReconciliationHealthWidget selectedYear={taxPreview.year} />

      {pinnedEntries.length > 0 && (
        <MillerDockSection
          title="Pinned"
          entries={pinnedEntries.map((entry) => toFormTile(entry, taxPreview))}
          onOpen={openForm}
          className="border-primary/25 bg-accent/20"
          titleClassName="finance-card-heading"
          isPinned={isPinned}
          onTogglePin={togglePin}
        />
      )}

      {recentEntries.length > 0 && (
        <MillerDockSection
          title="Recent"
          entries={recentEntries.map((entry) => toFormTile(entry, taxPreview, { canPin: isPinnable(entry) }))}
          onOpen={openForm}
          className="border-info/25 bg-info/5"
          titleClassName="finance-card-heading text-info"
          action={<ClearRecentButton onClear={clearRecent} />}
          isPinned={isPinned}
          onTogglePin={(id) => {
            if (isPinnable(formRegistry[id])) {
              togglePin(id)
            }
          }}
        />
      )}

      <MillerDockSection
        title="App"
        entries={apps.map((entry) => toFormTile(entry, taxPreview, {
          badge: entry.id === 'action-items' ? actionItemBadge(actionCounts) : null,
        }))}
        onOpen={openForm}
        className="border-success/25 bg-success/5"
        titleClassName="finance-card-heading text-success"
      />

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="finance-card-heading">
            Forms
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormGrid
            label="Schedules"
            entries={schedules}
            taxPreview={taxPreview}
            onOpen={openForm}
            isPinned={isPinned}
            onTogglePin={togglePin}
          />
          <FormGrid
            label="Forms"
            entries={forms}
            taxPreview={taxPreview}
            onOpen={openForm}
            isPinned={isPinned}
            onTogglePin={togglePin}
          />
        </CardContent>
      </Card>

      {worksheets.length > 0 && (
        <Card className="border-warning/25 bg-warning/5">
          <CardHeader>
            <CardTitle className="finance-card-heading" data-tone="warning">
              Worksheets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">
              Worksheets compute a single value (or set of values) and write it back to the relevant form. They open
              as a modal dialog and don&apos;t affect the column stack.
            </p>
            <MillerDockTileGrid
              entries={worksheets.map((entry) => toFormTile(entry, taxPreview))}
              onOpen={openWorksheet}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function isPinnable(entry: FormRegistryEntry): boolean {
  const category = getTaxFormMeta(entry).category
  return category === 'Schedule' || category === 'Form'
}

function formHasData(entry: FormRegistryEntry, state: TaxPreviewState): boolean {
  const meta = getTaxFormMeta(entry)
  if (meta.keyAmounts) {
    return meta.keyAmounts(state) !== null
  }
  if (meta.hasData) {
    return meta.hasData(state)
  }
  return true
}

function resolveEntries(ids: FormId[]): FormRegistryEntry[] {
  return ids
    .map((id) => formRegistry[id])
    .filter((entry): entry is FormRegistryEntry => entry !== undefined && entry.presentation === 'column')
}

interface FormGridProps {
  label: string
  entries: FormRegistryEntry[]
  taxPreview: TaxPreviewState
  onOpen: (id: FormId) => void
  isPinned: (id: FormId) => boolean
  onTogglePin: (id: FormId) => void
}

function FormGrid({ label, entries, taxPreview, onOpen, isPinned, onTogglePin }: FormGridProps): React.ReactElement {
  const sorted = [...entries].sort((a, b) => {
    const aActive = formHasData(a, taxPreview)
    const bActive = formHasData(b, taxPreview)
    if (aActive === bActive) {
      return 0
    }
    return aActive ? -1 : 1
  })
  return (
    <div className="space-y-2">
      <h3 className="finance-kicker">{label}</h3>
      <MillerDockTileGrid
        entries={sorted.map((entry) => toFormTile(entry, taxPreview, { inactive: !formHasData(entry, taxPreview) }))}
        onOpen={onOpen}
        isPinned={isPinned}
        onTogglePin={onTogglePin}
      />
    </div>
  )
}

interface ToFormTileOptions {
  inactive?: boolean
  badge?: ReactNode
  canPin?: boolean
}

function toFormTile(
  entry: FormRegistryEntry,
  taxPreview: TaxPreviewState,
  options: ToFormTileOptions = {},
): MillerDockTileEntry<FormId> {
  const keyAmounts = getTaxFormMeta(entry).keyAmounts?.(taxPreview) ?? null

  return {
    id: entry.id,
    label: entry.label,
    shortLabel: entry.shortLabel,
    amounts: keyAmounts?.map(formatTileAmount) ?? null,
    ...options,
  }
}

function formatTileAmount(keyAmount: KeyAmount): MillerDockTileAmount {
  const amount: MillerDockTileAmount = {
    label: keyAmount.label,
    value: formatKeyValue(keyAmount.value),
  }

  if (keyAmount.value < 0) {
    amount.valueClassName = 'text-destructive'
  }

  return amount
}

function ClearRecentButton({ onClear }: { onClear: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClear}
      className="rounded px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      Clear
    </button>
  )
}

// CategoryNote was used to flag worksheets as deferred; now they're rendered
// in their own card so the helper isn't needed. Type kept for future use.
type _CategoryNote = FormCategory
