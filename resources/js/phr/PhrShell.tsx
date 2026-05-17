import type { ReactNode } from 'react'

import type { PhrTabKey } from '@/phr/navigation'
import PhrNavbar from '@/phr/PhrNavbar'

interface PhrShellProps {
  activeTab: PhrTabKey
  patientId?: number | null
  busy?: boolean
  error?: string | null
  children: ReactNode
}

export default function PhrShell({ activeTab, patientId, busy = false, error = null, children }: PhrShellProps) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-foreground">PHR</h1>
        <p className="text-sm text-muted-foreground">Personal health records</p>
      </div>

      <PhrNavbar activeTab={activeTab} patientId={patientId ?? null} />

      <div aria-live="polite" className="min-h-6 text-sm text-muted-foreground">
        {busy ? 'Loading…' : null}
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div>{children}</div>
    </div>
  )
}
