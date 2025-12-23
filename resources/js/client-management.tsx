import { createRoot } from 'react-dom/client'
import ClientManagementIndexPage from '@/components/client-management/ClientManagementIndexPage'
import ClientManagementCreatePage from '@/components/client-management/ClientManagementCreatePage'
import ClientManagementShowPage from '@/components/client-management/ClientManagementShowPage'

document.addEventListener('DOMContentLoaded', () => {
  const indexDiv = document.getElementById('ClientManagementIndexPage')
  if (indexDiv) {
    const root = createRoot(indexDiv)
    root.render(<ClientManagementIndexPage />)
  }

  const createDiv = document.getElementById('ClientManagementCreatePage')
  if (createDiv) {
    const root = createRoot(createDiv)
    root.render(<ClientManagementCreatePage />)
  }

  const showDiv = document.getElementById('ClientManagementShowPage')
  if (showDiv) {
    const root = createRoot(showDiv)
    root.render(<ClientManagementShowPage companyId={parseInt(showDiv.dataset.companyId!)} />)
  }
})
