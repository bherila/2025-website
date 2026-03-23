import React from 'react'
import { createRoot } from 'react-dom/client'

import AdminGenAiJobsPage from '@/components/admin/AdminGenAiJobsPage'

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('AdminGenAiJobsPage')
  if (container) {
    const root = createRoot(container)
    root.render(<AdminGenAiJobsPage />)
  }
})
