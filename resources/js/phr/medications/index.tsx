import { createRoot } from 'react-dom/client'

import MedicationsPage from '@/phr/medications/MedicationsPage'

const root = document.getElementById('phr-medications-root')

if (root) {
  createRoot(root).render(<MedicationsPage />)
}
