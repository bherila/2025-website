import type { ReactElement } from 'react'
import { Suspense, useCallback, useState } from 'react'

import PhrNavbar from '@/components/phr/PhrNavbar'
import { MillerRegistryShell } from '@/components/ui/miller'
import type { PhrSection } from '@/lib/phrRouteBuilder'
import { patientUrl } from '@/lib/phrRouteBuilder'

import { PhrDockHomeView } from './PhrDockHomeView'
import { phrModuleRegistry, type PhrShellState } from './phrModuleRegistry'
import { usePhrRoute } from './usePhrRoute'

const LOADING = <div role="status" aria-live="polite" className="p-8 text-sm text-muted-foreground">Loading…</div>

interface PhrMillerShellProps {
  patientId: number | undefined
  onPatientChange?: (patientId: number) => void
  onSectionChange?: (section: PhrSection) => void
}

export function PhrMillerShell({ patientId, onPatientChange, onSectionChange }: PhrMillerShellProps): ReactElement {
  const [activePatientId, setActivePatientId] = useState<number | undefined>(patientId)
  const { route, pushColumn, replaceFrom, truncateTo, navigate } = usePhrRoute()

  const handlePatientChange = useCallback((nextPatientId: number): void => {
    setActivePatientId(nextPatientId)
    onPatientChange?.(nextPatientId)

    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', `${patientUrl(nextPatientId)}${window.location.hash}`)
    }
  }, [onPatientChange])

  const state: PhrShellState = { patientId: activePatientId }

  return (
    <PhrNavbar
      {...(activePatientId !== undefined ? { patientId: activePatientId } : {})}
      className="flex h-full flex-col"
      onPatientChange={handlePatientChange}
      {...(onSectionChange ? { onSectionChange } : {})}
    >
      <div className="min-h-0 flex-1 overflow-hidden">
        <Suspense fallback={LOADING}>
          <MillerRegistryShell
            registry={phrModuleRegistry}
            state={state}
            homeView={<PhrDockHomeView patientId={activePatientId} replaceFrom={replaceFrom} />}
            route={route}
            pushColumn={pushColumn}
            replaceFrom={replaceFrom}
            truncateTo={truncateTo}
            navigate={navigate}
          />
        </Suspense>
      </div>
    </PhrNavbar>
  )
}
