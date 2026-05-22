import { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'

import PhrNavbar from '@/components/phr/PhrNavbar'
import type { PhrSection } from '@/lib/phrRouteBuilder'
import { PhrMillerShell } from '@/phr/miller'

const PatientsPage = lazy(() => import('@/phr/patients/PatientsPage'))
const ManagePatientsPage = lazy(() => import('@/phr/patients-manage/PatientsManagePage'))

const LOADING = <div className="px-4 py-8 text-sm text-muted-foreground">Loading…</div>

function PageContent({
  section,
  patientId,
}: {
  section?: PhrSection
  patientId?: number
}) {
  if (section === 'patients') {
    return (
      <Suspense fallback={LOADING}>
        <PatientsPage />
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

  return <PhrMillerShell patientId={patientId} />
}

document.addEventListener('DOMContentLoaded', () => {
  const navbarDiv = document.getElementById('PhrNavbar')
  if (!navbarDiv) return

  const rawPatientId = navbarDiv.dataset.patientId
  const patientId = rawPatientId ? parseInt(rawPatientId, 10) : undefined
  const activeSection = navbarDiv.dataset.activeSection as PhrSection | undefined

  const contentDiv = document.getElementById('phr-page-content')

  createRoot(navbarDiv).render(
    <PhrNavbar
      {...(patientId !== undefined ? { patientId } : {})}
      {...(activeSection !== undefined ? { activeSection } : {})}
    />,
  )

  if (contentDiv) {
    createRoot(contentDiv).render(
      <PageContent
        {...(activeSection !== undefined ? { section: activeSection } : {})}
        {...(patientId !== undefined ? { patientId } : {})}
      />,
    )
  }
})
