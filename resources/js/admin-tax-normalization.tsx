import React from 'react'
import { createRoot } from 'react-dom/client'

import AdminTaxNormalizationPage from '@/components/admin/AdminTaxNormalizationPage'

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('AdminTaxNormalizationPage')
  if (container) {
    const root = createRoot(container)
    root.render(<AdminTaxNormalizationPage />)
  }
})
