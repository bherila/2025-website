import { createRoot } from 'react-dom/client'

import ConditionsPage from '@/phr/conditions/ConditionsPage'

const root = document.getElementById('phr-conditions-root')

if (root) {
  createRoot(root).render(<ConditionsPage />)
}
