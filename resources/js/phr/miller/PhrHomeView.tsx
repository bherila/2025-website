import type { ReactElement } from 'react'

import type { MillerColumnSpec } from '@/components/ui/miller'

import { PHR_LIST_MODULES, type PhrModuleId } from './phrModuleRegistry'

interface PhrHomeViewProps {
  patientId: number | undefined
  replaceFrom: (depth: number, column: MillerColumnSpec<PhrModuleId>) => void
}

export function PhrHomeView({ patientId, replaceFrom }: PhrHomeViewProps): ReactElement {
  if (patientId === undefined) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div className="space-y-2">
          <p className="font-medium text-foreground">No patient selected</p>
          <p className="text-sm text-muted-foreground">Choose a patient from the selector above to get started.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-foreground">Patient Record</h1>
        <p className="text-sm text-muted-foreground">Select a module to view records.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {PHR_LIST_MODULES.map((module) => (
          <button
            key={module.id}
            type="button"
            onClick={() => replaceFrom(0, { id: module.id })}
            className="flex flex-col items-start gap-1 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="text-sm font-medium text-card-foreground">{module.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
