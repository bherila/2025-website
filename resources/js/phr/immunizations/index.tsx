import { createRoot } from 'react-dom/client'

import ImmunizationsPage from '@/phr/immunizations/ImmunizationsPage'

const root = document.getElementById('phr-immunizations-root')

if (root) {
  createRoot(root).render(<ImmunizationsPage />)
}
