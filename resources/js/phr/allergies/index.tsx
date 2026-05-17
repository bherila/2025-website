import { createRoot } from 'react-dom/client'

import AllergiesPage from '@/phr/allergies/AllergiesPage'

const root = document.getElementById('phr-allergies-root')

if (root) {
  createRoot(root).render(<AllergiesPage />)
}
