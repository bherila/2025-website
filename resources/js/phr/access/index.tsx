import { createRoot } from 'react-dom/client'

import AccessPage from '@/phr/access/AccessPage'

const root = document.getElementById('phr-access-root')

if (root) {
  createRoot(root).render(<AccessPage />)
}
