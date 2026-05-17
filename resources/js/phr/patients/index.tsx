import { createRoot } from 'react-dom/client'

import PatientsPage from '@/phr/patients/PatientsPage'

const root = document.getElementById('phr-patients-root')

if (root) {
  createRoot(root).render(<PatientsPage />)
}
