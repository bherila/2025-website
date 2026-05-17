import { createRoot } from 'react-dom/client'

import SummaryPage from '@/phr/summary/SummaryPage'

const root = document.getElementById('phr-summary-root')

if (root) {
  createRoot(root).render(<SummaryPage />)
}
