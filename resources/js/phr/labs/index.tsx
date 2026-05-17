import { createRoot } from 'react-dom/client'

import LabsPage from '@/phr/labs/LabsPage'

const root = document.getElementById('phr-labs-root')

if (root) {
  createRoot(root).render(<LabsPage />)
}
