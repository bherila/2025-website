import { createRoot } from 'react-dom/client'

import ClientAgreementShowPage from '@/client-management/components/ClientAgreementShowPage'
import ClientManagementCreatePage from '@/client-management/components/ClientManagementCreatePage'
import ClientManagementIndexPage from '@/client-management/components/ClientManagementIndexPage'
import ClientManagementShowPage from '@/client-management/components/ClientManagementShowPage'

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
