import ClientAgreementShowPage from '@/client-management/components/ClientAgreementShowPage'
import { mountElement, readRequiredDataset, readRequiredIntDataset } from '@/lib/mount'

document.addEventListener('DOMContentLoaded', () => {
  mountElement('ClientAgreementShowPage', (element) => (
    <ClientAgreementShowPage
      agreementId={readRequiredIntDataset(element, 'agreementId')}
      companyId={readRequiredIntDataset(element, 'companyId')}
      companyName={readRequiredDataset(element, 'companyName')}
    />
  ))
})
