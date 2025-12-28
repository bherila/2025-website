import { createRoot } from 'react-dom/client'
import ClientPortalIndexPage from '@/components/client-management/portal/ClientPortalIndexPage'
import ClientPortalTimePage from '@/components/client-management/portal/ClientPortalTimePage'
import ClientPortalProjectPage from '@/components/client-management/portal/ClientPortalProjectPage'
import ClientPortalAgreementPage from '@/components/client-management/portal/ClientPortalAgreementPage'
import ClientPortalInvoicesPage from '@/components/client-management/portal/ClientPortalInvoicesPage'
import ClientPortalInvoicePage from '@/components/client-management/portal/ClientPortalInvoicePage'
import ClientAdminActions from '@/components/client-management/ClientAdminActions'

document.addEventListener('DOMContentLoaded', () => {
  // Mount admin actions if available (legacy mounting - no longer used, kept for compatibility)
  const adminActionsDiv = document.getElementById('ClientAdminActions')
  if (adminActionsDiv) {
    // This is no longer used - ClientAdminActions is now a modal dialog
    // It should be rendered by the parent page component
    console.warn('ClientAdminActions div found but component has been refactored to a modal')
  }

  const indexDiv = document.getElementById('ClientPortalIndexPage')
  if (indexDiv) {
    const root = createRoot(indexDiv)
    root.render(<ClientPortalIndexPage 
      slug={indexDiv.dataset.slug!}
      companyName={indexDiv.dataset.companyName!}
      isAdmin={indexDiv.dataset.isAdmin === 'true'}
    />)
  }

  const timeDiv = document.getElementById('ClientPortalTimePage')
  if (timeDiv) {
    const root = createRoot(timeDiv)
    root.render(<ClientPortalTimePage 
      slug={timeDiv.dataset.slug!}
      companyName={timeDiv.dataset.companyName!}
    />)
  }

  const projectDiv = document.getElementById('ClientPortalProjectPage')
  if (projectDiv) {
    const root = createRoot(projectDiv)
    root.render(<ClientPortalProjectPage 
      slug={projectDiv.dataset.slug!}
      companyName={projectDiv.dataset.companyName!}
      projectSlug={projectDiv.dataset.projectSlug!}
      projectName={projectDiv.dataset.projectName!}
      isAdmin={projectDiv.dataset.isAdmin === 'true'}
    />)
  }

  const agreementDiv = document.getElementById('ClientPortalAgreementPage')
  if (agreementDiv) {
    const root = createRoot(agreementDiv)
    root.render(<ClientPortalAgreementPage 
      slug={agreementDiv.dataset.slug!}
      companyName={agreementDiv.dataset.companyName!}
      agreementId={parseInt(agreementDiv.dataset.agreementId!)}
      isAdmin={agreementDiv.dataset.isAdmin === 'true'}
    />)
  }

  const invoicesDiv = document.getElementById('ClientPortalInvoicesPage')
  if (invoicesDiv) {
    const root = createRoot(invoicesDiv)
    root.render(<ClientPortalInvoicesPage 
      slug={invoicesDiv.dataset.slug!}
      companyName={invoicesDiv.dataset.companyName!}
    />)
  }

  const invoiceDiv = document.getElementById('ClientPortalInvoicePage')
  if (invoiceDiv) {
    const root = createRoot(invoiceDiv)
    root.render(<ClientPortalInvoicePage 
      slug={invoiceDiv.dataset.slug!}
      companyName={invoiceDiv.dataset.companyName!}
      invoiceId={parseInt(invoiceDiv.dataset.invoiceId!)}
      isAdmin={invoiceDiv.dataset.isAdmin === 'true'}
    />)
  }
})
