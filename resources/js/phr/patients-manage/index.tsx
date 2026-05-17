import { createRoot } from 'react-dom/client'

import PatientsManagePage from '@/phr/patients-manage/PatientsManagePage'

const root = document.getElementById('phr-patients-manage-root')

if (root) {
  createRoot(root).render(<PatientsManagePage />)
}
