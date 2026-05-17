import { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'

import PhrNavbar from '@/components/phr/PhrNavbar'
import type { PhrPatientTab, PhrSection } from '@/lib/phrRouteBuilder'

const PatientsPage = lazy(() => import('@/phr/patients/PatientsPage'))
const LabsPage = lazy(() => import('@/phr/labs/LabsPage'))
const VitalsPage = lazy(() => import('@/phr/vitals/VitalsPage'))
const ImagingPage = lazy(() => import('@/phr/imaging/ImagingPage'))
const AccessPage = lazy(() => import('@/phr/access/AccessPage'))
const AllergiesPage = lazy(() => import('@/phr/allergies/AllergiesPage'))
const ConditionsPage = lazy(() => import('@/phr/conditions/ConditionsPage'))
const DocumentsPage = lazy(() => import('@/phr/documents/DocumentsPage'))
const ImmunizationsPage = lazy(() => import('@/phr/immunizations/ImmunizationsPage'))
const MedicationsPage = lazy(() => import('@/phr/medications/MedicationsPage'))
const OfficeVisitsPage = lazy(() => import('@/phr/office-visits/OfficeVisitsPage'))
const ProceduresPage = lazy(() => import('@/phr/procedures/ProceduresPage'))
const SummaryPage = lazy(() => import('@/phr/summary/SummaryPage'))

const LOADING = <div className="px-4 py-8 text-sm text-muted-foreground">Loading…</div>

function PageContent({
  tab,
  section,
  patientId,
}: {
  tab?: PhrPatientTab
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

  if (patientId === undefined) return null

  switch (tab) {
    case 'labs':
      return (
        <Suspense fallback={LOADING}>
          <LabsPage patientId={patientId} />
        </Suspense>
      )
    case 'vitals':
      return (
        <Suspense fallback={LOADING}>
          <VitalsPage patientId={patientId} />
        </Suspense>
      )
    case 'imaging':
      return (
        <Suspense fallback={LOADING}>
          <ImagingPage patientId={patientId} />
        </Suspense>
      )
    case 'access':
      return (
        <Suspense fallback={LOADING}>
          <AccessPage patientId={patientId} />
        </Suspense>
      )
    case 'allergies':
      return (
        <Suspense fallback={LOADING}>
          <AllergiesPage patientId={patientId} />
        </Suspense>
      )
    case 'conditions':
      return (
        <Suspense fallback={LOADING}>
          <ConditionsPage patientId={patientId} />
        </Suspense>
      )
    case 'documents':
      return (
        <Suspense fallback={LOADING}>
          <DocumentsPage patientId={patientId} />
        </Suspense>
      )
    case 'immunizations':
      return (
        <Suspense fallback={LOADING}>
          <ImmunizationsPage patientId={patientId} />
        </Suspense>
      )
    case 'medications':
      return (
        <Suspense fallback={LOADING}>
          <MedicationsPage patientId={patientId} />
        </Suspense>
      )
    case 'office-visits':
      return (
        <Suspense fallback={LOADING}>
          <OfficeVisitsPage patientId={patientId} />
        </Suspense>
      )
    case 'procedures':
      return (
        <Suspense fallback={LOADING}>
          <ProceduresPage patientId={patientId} />
        </Suspense>
      )
    case 'summary':
      return (
        <Suspense fallback={LOADING}>
          <SummaryPage patientId={patientId} />
        </Suspense>
      )
    default:
      return (
        <div className="px-4 py-8 text-sm text-muted-foreground">Coming soon.</div>
      )
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const navbarDiv = document.getElementById('PhrNavbar')
  if (!navbarDiv) return

  const rawPatientId = navbarDiv.dataset.patientId
  const patientId = rawPatientId ? parseInt(rawPatientId, 10) : undefined
  const activeTab = navbarDiv.dataset.activeTab as PhrPatientTab | undefined
  const activeSection = navbarDiv.dataset.activeSection as PhrSection | undefined

  const contentDiv = document.getElementById('phr-page-content')

  createRoot(navbarDiv).render(
    <PhrNavbar
      {...(patientId !== undefined ? { patientId } : {})}
      {...(activeTab !== undefined ? { activeTab } : {})}
      {...(activeSection !== undefined ? { activeSection } : {})}
    />,
  )

  if (contentDiv) {
    createRoot(contentDiv).render(
      <PageContent
        {...(activeTab !== undefined ? { tab: activeTab } : {})}
        {...(activeSection !== undefined ? { section: activeSection } : {})}
        {...(patientId !== undefined ? { patientId } : {})}
      />,
    )
  }
})
