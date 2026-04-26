import { ArrowRight, FileText } from 'lucide-react'

import { computeActionItemSeverityCounts } from '@/components/finance/actionItemsCounts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { useTaxPreview } from '../TaxPreviewContext'
import { useDockActions } from './DockActions'
import type { FormCategory, FormId } from './formRegistry'
import { formRegistry } from './registry'
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

/**
 * Placeholder home view rendered when the column stack is empty (no hash).
 * Real version will host Account Documents, KPI cards, and Action Items.
 */
export function DockHomeView(): React.ReactElement {
  const { pushColumn } = useTaxRoute()

  const { openWorksheet } = useDockActions()
  const taxPreview = useTaxPreview()
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

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Tax Preview</h1>
        <p className="text-sm text-muted-foreground">
          Drill-down preview shell. Click any form to open it as a column. Browser back/forward navigates the column
          stack; click the form name in the header bar to return here.
        </p>
      </header>

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
                onOpen={(form) => pushColumn({ form })}
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
          <FormGrid label="Schedules" entries={schedules} onOpen={(form) => pushColumn({ form })} />
          <FormGrid label="Forms" entries={forms} onOpen={(form) => pushColumn({ form })} />
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

interface FormGridProps {
  label: string
  entries: { id: FormId; label: string; shortLabel: string }[]
  onOpen: (id: FormId) => void
}

function FormGrid({ label, entries, onOpen }: FormGridProps): React.ReactElement {
  return (
    <div className="space-y-2">
      <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry) => (
          <FormButton
            key={entry.id}
            id={entry.id}
            label={entry.label}
            shortLabel={entry.shortLabel}
            onOpen={onOpen}
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
  onOpen,
  badge,
}: {
  id: FormId
  label: string
  shortLabel: string
  onOpen: (id: FormId) => void
  badge?: React.ReactNode
}): React.ReactElement {
  return (
    <Button
      variant="outline"
      className="h-auto justify-between gap-3 border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted"
      onClick={() => onOpen(id)}
    >
      <span className="flex min-w-0 items-center gap-2">
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-foreground">{shortLabel}</span>
          <span className="truncate text-xs text-muted-foreground">{label}</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {badge}
        <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </span>
    </Button>
  )
}

// CategoryNote was used to flag worksheets as deferred; now they're rendered
// in their own card so the helper isn't needed. Type kept for future use.
type _CategoryNote = FormCategory
