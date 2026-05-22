import ClientManagementCreatePage from '@/client-management/components/ClientManagementCreatePage'
import { mountElement } from '@/lib/mount'

document.addEventListener('DOMContentLoaded', () => {
  mountElement('ClientManagementCreatePage', () => <ClientManagementCreatePage />)
})
