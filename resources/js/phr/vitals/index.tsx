import { createRoot } from 'react-dom/client'

import VitalsPage from '@/phr/vitals/VitalsPage'

const root = document.getElementById('phr-vitals-root')

if (root) {
  createRoot(root).render(<VitalsPage />)
}
