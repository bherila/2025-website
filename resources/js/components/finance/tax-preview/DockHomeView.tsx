import { ArrowRight, FileText, Pin } from 'lucide-react'

import { computeActionItemSeverityCounts } from '@/components/finance/actionItemsCounts'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatFriendlyAmount } from '@/lib/formatCurrency'

import { useTaxPreview } from '../TaxPreviewContext'
import { useDockActions } from './DockActions'
import type { FormCategory, FormId, FormRegistryEntry, KeyAmount, TaxPreviewState } from './formRegistry'
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

  const schedules = columnEntries.filter((e) => e.category === 'Schedule')
  const forms = columnEntries.filter((e) => e.category === 'Form')
  const apps = Object.values(formRegistry).filter((e) => e.category === 'App' && e.id !== 'home')

  const pinnedEntries = resolveEntries(pinned).filter((e) => isPinnable(e))
  const recentEntries = resolveEntries(recent).filter((e) => !pinned.includes(e.id))

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Tax Preview</h1>
        <p className="text-sm text-muted-foreground">
          Drill-down preview shell. Click any form to open it as a column. Browser back/forward navigates the column
          stack; click the form name in the header bar to return here.
        </p>
      </header>

      {pinnedEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Pinned
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {pinnedEntries.map((entry) => (
                <FormButton
                  key={entry.id}
                  id={entry.id}
                  label={entry.label}
                  shortLabel={entry.shortLabel}
                  keyAmounts={entry.keyAmounts?.(taxPreview) ?? null}
                  onOpen={openForm}
                  pinned
                  onTogglePin={() => togglePin(entry.id)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {recentEntries.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Recent
            </CardTitle>
            <button
              type="button"
              onClick={clearRecent}
              className="rounded px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Clear
            </button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {recentEntries.map((entry) => (
                <FormButton
                  key={entry.id}
                  id={entry.id}
                  label={entry.label}
                  shortLabel={entry.shortLabel}
                  keyAmounts={entry.keyAmounts?.(taxPreview) ?? null}
                  onOpen={openForm}
                  pinned={false}
                  {...(isPinnable(entry) ? { onTogglePin: () => togglePin(entry.id) } : {})}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            App
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {apps.map((entry) => (
              <FormButton
                key={entry.id}
                id={entry.id}
                label={entry.label}
                shortLabel={entry.shortLabel}
                onOpen={openForm}
                badge={entry.id === 'action-items' ? actionItemBadge(actionCounts) : null}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
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
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Worksheets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">
              Worksheets compute a single value (or set of values) and write it back to the relevant form. They open
              as a modal dialog and don&apos;t affect the column stack.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {worksheets.map((entry) => (
                <FormButton
                  key={entry.id}
                  id={entry.id}
                  label={entry.label}
                  shortLabel={entry.shortLabel}
                  onOpen={(id) => openWorksheet(id)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function isPinnable(entry: FormRegistryEntry): boolean {
  return entry.category === 'Schedule' || entry.category === 'Form'
}

function formHasData(entry: FormRegistryEntry, state: TaxPreviewState): boolean {
  if (entry.keyAmounts) {
    return entry.keyAmounts(state) !== null
  }
  if (entry.hasData) {
    return entry.hasData(state)
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
      <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((entry) => (
          <FormButton
            key={entry.id}
            id={entry.id}
            label={entry.label}
            shortLabel={entry.shortLabel}
            keyAmounts={entry.keyAmounts?.(taxPreview) ?? null}
            inactive={!formHasData(entry, taxPreview)}
            onOpen={onOpen}
            pinned={isPinned(entry.id)}
            onTogglePin={() => onTogglePin(entry.id)}
          />
        ))}
      </div>
    </div>
  )
}

function FormButton({
  id,
  label,
  shortLabel,
  keyAmounts,
  inactive,
  onOpen,
  badge,
  pinned,
  onTogglePin,
}: {
  id: FormId
  label: string
  shortLabel: string
  keyAmounts?: KeyAmount[] | null
  inactive?: boolean
  onOpen: (id: FormId) => void
  badge?: React.ReactNode
  pinned?: boolean
  onTogglePin?: () => void
}): React.ReactElement {
  return (
    <div className={`group relative flex items-stretch overflow-hidden rounded-md border border-border bg-card transition-colors hover:bg-muted ${inactive ? 'opacity-50' : ''}`}>
      <button
        type="button"
        onClick={() => onOpen(id)}
        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <FileText className="h-4 w-4 shrink-0 self-start pt-0.5 text-muted-foreground" aria-hidden="true" />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-foreground">{shortLabel}</span>
          <span className="truncate text-xs text-muted-foreground">{label}</span>
          {keyAmounts && keyAmounts.length > 0 && (
            <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
              {keyAmounts.map((ka) => (
                <span key={ka.label} className="inline-flex items-baseline gap-1 font-mono text-[10px]">
                  <span className="text-muted-foreground">{ka.label}</span>
                  <span className={ka.value < 0 ? 'text-destructive' : 'text-foreground'}>
                    {formatKeyValue(ka.value)}
                  </span>
                </span>
              ))}
            </span>
          )}
        </span>
      </button>
      <span className="flex shrink-0 items-center gap-2 pr-3">
        {badge}
        {onTogglePin && (
          <button
            type="button"
            onClick={onTogglePin}
            aria-label={pinned ? `Unpin ${shortLabel}` : `Pin ${shortLabel}`}
            aria-pressed={pinned}
            className={`rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              pinned ? 'opacity-100 text-foreground' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
            }`}
          >
            <Pin className={`h-3.5 w-3.5 ${pinned ? 'fill-current' : ''}`} aria-hidden="true" />
          </button>
        )}
        <ArrowRight className="h-4 w-4 shrink-0 self-start mt-1 text-muted-foreground" aria-hidden="true" />
      </span>
    </div>
  )
}

// CategoryNote was used to flag worksheets as deferred; now they're rendered
// in their own card so the helper isn't needed. Type kept for future use.
type _CategoryNote = FormCategory
