import React from 'react'
import { createRoot } from 'react-dom/client'

import UserManagementPage from '@/components/user-management/UserManagementPage'

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('UserManagementPage')
  if (container) {
    const root = createRoot(container)
    root.render(<UserManagementPage />)
  }
})
