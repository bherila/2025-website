import { createRoot } from 'react-dom/client'

import PhrNavbar from '@/components/phr/PhrNavbar'
import type { PhrPatientTab, PhrSection } from '@/lib/phrRouteBuilder'

document.addEventListener('DOMContentLoaded', () => {
  const phrNavbarDiv = document.getElementById('PhrNavbar')
  if (!phrNavbarDiv) {
    return
  }

  const root = createRoot(phrNavbarDiv)
  const rawPatientId = phrNavbarDiv.dataset.patientId
  const patientId = rawPatientId ? parseInt(rawPatientId, 10) : undefined
  const activeTab = phrNavbarDiv.dataset.activeTab as PhrPatientTab | undefined
  const activeSection = phrNavbarDiv.dataset.activeSection as PhrSection | undefined

  const navbarProps: {
    patientId?: number
    activeTab?: PhrPatientTab
    activeSection?: PhrSection
  } = {}

  if (patientId !== undefined) {
    navbarProps.patientId = patientId
  }
  if (activeTab) {
    navbarProps.activeTab = activeTab
  }
  if (activeSection) {
    navbarProps.activeSection = activeSection
  }

  root.render(<PhrNavbar {...navbarProps} />)
})
