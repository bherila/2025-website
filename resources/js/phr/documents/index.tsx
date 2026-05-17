import { createRoot } from 'react-dom/client'

import DocumentsPage from '@/phr/documents/DocumentsPage'

const root = document.getElementById('phr-documents-root')

if (root) {
  createRoot(root).render(<DocumentsPage />)
}
