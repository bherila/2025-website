import ClientManagementShowPage from '@/client-management/components/ClientManagementShowPage'
import { mountElement, readRequiredIntDataset } from '@/lib/mount'

document.addEventListener('DOMContentLoaded', () => {
  mountElement('ClientManagementShowPage', (element) => (
    <ClientManagementShowPage companyId={readRequiredIntDataset(element, 'companyId')} />
  ))
})
