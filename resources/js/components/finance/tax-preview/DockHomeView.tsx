import { ArrowRight, FileText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import type { FormCategory, FormId } from './formRegistry'
import { formRegistry } from './registry'
import { useTaxRoute } from './useTaxRoute'

/**
 * Placeholder home view rendered when the column stack is empty (no hash).
 * Real version will host Account Documents, KPI cards, and Action Items.
 */
export function DockHomeView(): React.ReactElement {
  const { pushColumn } = useTaxRoute()

  const columnEntries = Object.values(formRegistry).filter((e) => e.presentation === 'column')

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
          <CategoryNote category="Worksheet" />
        </CardContent>
      </Card>
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
}: {
  id: FormId
  label: string
  shortLabel: string
  onOpen: (id: FormId) => void
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
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Button>
  )
}

function CategoryNote({ category }: { category: FormCategory }): React.ReactElement | null {
  if (category !== 'Worksheet') {
    return null
  }
  return (
    <p className="border-t border-border pt-3 text-xs text-muted-foreground">
      Worksheets (SE 401(k), AMT exemption, taxable Social Security) are reachable from related forms and open as
      modal dialogs rather than columns.
    </p>
  )
}
