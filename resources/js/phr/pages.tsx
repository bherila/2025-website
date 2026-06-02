import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import PhrNavbar from '@/components/phr/PhrNavbar'
import type { PhrSection } from '@/lib/phrRouteBuilder'
import { patientUrl, phrSectionUrl } from '@/lib/phrRouteBuilder'
import { PhrMillerShell } from '@/phr/miller'

const PatientsPage = lazy(() => import('@/phr/patients/PatientsPage'))
const ManagePatientsPage = lazy(() => import('@/phr/patients-manage/PatientsManagePage'))

const LOADING = <div role="status" aria-live="polite" className="px-4 py-8 text-sm text-muted-foreground">Loading…</div>
const SECTION_CONTENT_CLASS = 'mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8'
const PHR_SECTIONS: readonly PhrSection[] = ['patients', 'manage-patients', 'imports', 'config']

interface PhrPageRoute {
  section?: PhrSection
  patientId?: number
}

interface PageContentProps {
  section: PhrSection
  onPatientSelect: (patientId: number, hash?: string) => void
  onManagePatients: () => void
}

interface PhrAppProps {
  initialRoute: PhrPageRoute
}

function isPhrSection(value: string | undefined): value is PhrSection {
  return PHR_SECTIONS.includes(value as PhrSection)
}

function parsePatientId(value: string | undefined): number | undefined {
  if (!value) {
    return undefined
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? undefined : parsed
}

function routeFromLocation(fallback: PhrPageRoute): PhrPageRoute {
  if (typeof window === 'undefined') {
    return fallback
  }

  const { pathname } = window.location
  if (pathname === '/phr/patients') {
    return { section: 'patients' }
  }
  if (pathname === '/phr/patients/manage') {
    return { section: 'manage-patients' }
  }
  if (pathname === '/phr/imports') {
    return { section: 'imports' }
  }
  if (pathname === '/phr/config') {
    return { section: 'config' }
  }

  const patientMatch = pathname.match(/^\/phr\/patient\/(\d+)$/)
  if (patientMatch) {
    return { patientId: Number.parseInt(patientMatch[1]!, 10) }
  }

  return fallback
}

function PageContent({
  section,
  onPatientSelect,
  onManagePatients,
}: PageContentProps) {
  if (section === 'patients') {
    return (
      <Suspense fallback={LOADING}>
        <PatientsPage onPatientSelect={onPatientSelect} onManagePatients={onManagePatients} />
      </Suspense>
    )
  }

  if (section === 'manage-patients') {
    return (
      <Suspense fallback={LOADING}>
        <ManagePatientsPage />
      </Suspense>
    )
  }

  if (section === 'imports') {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Imports</h1>
        <p className="mt-2 text-sm text-muted-foreground">Coming soon.</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">PHR Config</h1>
      <p className="mt-2 text-sm text-muted-foreground">Coming soon.</p>
    </div>
  )
}

function PhrApp({ initialRoute }: PhrAppProps) {
  const [route, setRoute] = useState<PhrPageRoute>(() => routeFromLocation(initialRoute))

  useEffect(() => {
    const handlePopState = (): void => {
      setRoute(routeFromLocation(initialRoute))
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [initialRoute])

  const navigateToSection = useCallback((section: PhrSection): void => {
    setRoute({ section })

    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', phrSectionUrl(section))
    }
  }, [])

  const navigateToPatient = useCallback((nextPatientId: number, hash?: string): void => {
    setRoute({ patientId: nextPatientId })

    if (typeof window !== 'undefined') {
      const nextHash = hash ?? window.location.hash
      window.history.pushState(null, '', `${patientUrl(nextPatientId)}${nextHash}`)
    }
  }, [])

  const syncMillerPatient = useCallback((nextPatientId: number): void => {
    setRoute({ patientId: nextPatientId })
  }, [])

  if (route.patientId !== undefined) {
    return (
      <PhrMillerShell
        key={route.patientId}
        patientId={route.patientId}
        onPatientChange={syncMillerPatient}
        onSectionChange={navigateToSection}
      />
    )
  }

  const activeSection = route.section ?? 'patients'

  return (
    <PhrNavbar
      activeSection={activeSection}
      className="min-h-dvh"
      onSectionChange={navigateToSection}
    >
      <div className={SECTION_CONTENT_CLASS}>
        <PageContent
          section={activeSection}
          onPatientSelect={navigateToPatient}
          onManagePatients={() => navigateToSection('manage-patients')}
        />
      </div>
    </PhrNavbar>
  )
}

document.addEventListener('DOMContentLoaded', () => {
  const shellDiv = document.getElementById('PhrShell') ?? document.getElementById('PhrNavbar')
  if (!shellDiv) return

  const patientId = parsePatientId(shellDiv.dataset.patientId)
  const activeSection = isPhrSection(shellDiv.dataset.activeSection) ? shellDiv.dataset.activeSection : undefined

  createRoot(shellDiv).render(<PhrApp initialRoute={{ ...(patientId !== undefined ? { patientId } : {}), ...(activeSection !== undefined ? { section: activeSection } : {}) }} />)
})
