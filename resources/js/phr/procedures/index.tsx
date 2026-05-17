import { createRoot } from 'react-dom/client'

import ProceduresPage from '@/phr/procedures/ProceduresPage'

const root = document.getElementById('phr-procedures-root')

if (root) {
  createRoot(root).render(<ProceduresPage />)
}
