import { ArrowRight, FileText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { formRegistry } from './registry'
import { useTaxRoute } from './useTaxRoute'

/**
 * Placeholder home view rendered when the column stack is empty (no hash).
 * Real version will host Account Documents, KPI cards, and Action Items.
 */
export function DockHomeView(): React.ReactElement {
  const { pushColumn } = useTaxRoute()

  const columnEntries = Object.values(formRegistry).filter(
    (e): e is NonNullable<typeof e> => Boolean(e) && e.presentation === 'column',
  )

  const schedules = columnEntries.filter((e) => e.category === 'Schedule')
  const forms = columnEntries.filter((e) => e.category === 'Form')

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Tax Preview</h1>
        <p className="text-sm text-muted-foreground">
          Drill-down preview shell. Click any form to open it as a column; back/forward in the browser navigates the
          stack.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Forms</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormGrid label="Schedules" entries={schedules} onOpen={(form) => pushColumn({ form })} />
          <FormGrid label="Forms" entries={forms} onOpen={(form) => pushColumn({ form })} />
        </CardContent>
      </Card>
    </div>
  )
}

interface FormGridProps {
  label: string
  entries: { id: string; label: string; shortLabel: string }[]
  onOpen: (id: never) => void
}

function FormGrid({ label, entries, onOpen }: FormGridProps): React.ReactElement {
  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry) => (
          <Button
            key={entry.id}
            variant="outline"
            className="h-auto justify-between gap-3 px-3 py-2.5 text-left"
            onClick={() => onOpen(entry.id as never)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-foreground">{entry.shortLabel}</span>
                <span className="truncate text-xs text-muted-foreground">{entry.label}</span>
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Button>
        ))}
      </div>
    </div>
  )
}
