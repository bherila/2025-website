import { createRoot } from 'react-dom/client'

import ImagingPage from '@/phr/imaging/ImagingPage'

const root = document.getElementById('phr-imaging-root')

if (root) {
  createRoot(root).render(<ImagingPage />)
}
