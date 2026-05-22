import ClientPortalExpensesPage from '@/client-management/components/portal/ClientPortalExpensesPage'
import { mountElement, readRequiredDataset, readRequiredIntDataset } from '@/lib/mount'

document.addEventListener('DOMContentLoaded', () => {
  mountElement('ClientPortalExpensesPage', (element) => (
    <ClientPortalExpensesPage
      slug={readRequiredDataset(element, 'slug')}
      companyName={readRequiredDataset(element, 'companyName')}
      companyId={readRequiredIntDataset(element, 'companyId')}
    />
  ))
})
