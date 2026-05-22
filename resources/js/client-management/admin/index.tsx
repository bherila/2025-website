import ClientManagementIndexPage from '@/client-management/components/ClientManagementIndexPage'
import { mountElement } from '@/lib/mount'

document.addEventListener('DOMContentLoaded', () => {
  mountElement('ClientManagementIndexPage', () => <ClientManagementIndexPage />)
})
