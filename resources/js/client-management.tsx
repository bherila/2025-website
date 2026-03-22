import { createRoot } from 'react-dom/client'

import ClientAgreementShowPage from '@/components/client-management/ClientAgreementShowPage'
import ClientManagementCreatePage from '@/components/client-management/ClientManagementCreatePage'
import ClientManagementIndexPage from '@/components/client-management/ClientManagementIndexPage'
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

  const agreementDiv = document.getElementById('ClientAgreementShowPage')
  if (agreementDiv) {
    const root = createRoot(agreementDiv)
    root.render(
      <ClientAgreementShowPage 
        agreementId={parseInt(agreementDiv.dataset.agreementId!)}
        companyId={parseInt(agreementDiv.dataset.companyId!)}
        companyName={agreementDiv.dataset.companyName!}
      />
    )
  }
})
