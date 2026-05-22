import type { ReactElement } from 'react'
import { Suspense } from 'react'

import { MillerRegistryShell } from '@/components/ui/miller'

import { PhrHomeView } from './PhrHomeView'
import { phrModuleRegistry, type PhrShellState } from './phrModuleRegistry'
import { usePhrRoute } from './usePhrRoute'

const LOADING = <div role="status" aria-live="polite" className="p-8 text-sm text-muted-foreground">Loading…</div>

interface PhrMillerShellProps {
  patientId: number | undefined
}

export function PhrMillerShell({ patientId }: PhrMillerShellProps): ReactElement {
  const { route, pushColumn, replaceFrom, truncateTo, navigate } = usePhrRoute()

  const state: PhrShellState = { patientId }

  return (
    <Suspense fallback={LOADING}>
      <MillerRegistryShell
        registry={phrModuleRegistry}
        state={state}
        homeView={<PhrHomeView patientId={patientId} replaceFrom={replaceFrom} />}
        route={route}
        pushColumn={pushColumn}
        replaceFrom={replaceFrom}
        truncateTo={truncateTo}
        navigate={navigate}
      />
    </Suspense>
  )
}
