import { createRoot } from 'react-dom/client'

import OfficeVisitsPage from '@/phr/office-visits/OfficeVisitsPage'

const root = document.getElementById('phr-office-visits-root')

if (root) {
  createRoot(root).render(<OfficeVisitsPage />)
}
