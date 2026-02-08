import { createRoot } from 'react-dom/client'
import ClientPortalIndexPage from '@/components/client-management/portal/ClientPortalIndexPage'
import ClientPortalTimePage from '@/components/client-management/portal/ClientPortalTimePage'
import ClientPortalProjectPage from '@/components/client-management/portal/ClientPortalProjectPage'
import ClientPortalAgreementPage from '@/components/client-management/portal/ClientPortalAgreementPage'
import ClientPortalInvoicesPage from '@/components/client-management/portal/ClientPortalInvoicesPage'
import ClientPortalInvoicePage from '@/components/client-management/portal/ClientPortalInvoicePage'
import ClientPortalExpensesPage from '@/components/client-management/portal/ClientPortalExpensesPage'
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
    let initialProjects = []
    let initialAgreements = []
    try {
      if (indexDiv.dataset.projects) initialProjects = JSON.parse(indexDiv.dataset.projects)
      if (indexDiv.dataset.agreements) initialAgreements = JSON.parse(indexDiv.dataset.agreements)
    } catch (e) {
      console.error('Failed to parse initial data', e)
    }

    const root = createRoot(indexDiv)
    root.render(<ClientPortalIndexPage 
      slug={indexDiv.dataset.slug!}
      companyName={indexDiv.dataset.companyName!}
      companyId={parseInt(indexDiv.dataset.companyId!)}
      isAdmin={indexDiv.dataset.isAdmin === 'true'}
      initialProjects={initialProjects}
      initialAgreements={initialAgreements}
    />)
  }

  const timeDiv = document.getElementById('ClientPortalTimePage')
  if (timeDiv) {
    const root = createRoot(timeDiv)
    root.render(<ClientPortalTimePage 
      slug={timeDiv.dataset.slug!}
      companyName={timeDiv.dataset.companyName!}
      companyId={parseInt(timeDiv.dataset.companyId!)}
      isAdmin={timeDiv.dataset.isAdmin === 'true'}
    />)
  }

  const projectDiv = document.getElementById('ClientPortalProjectPage')
  if (projectDiv) {
    const root = createRoot(projectDiv)
    root.render(<ClientPortalProjectPage 
      slug={projectDiv.dataset.slug!}
      companyName={projectDiv.dataset.companyName!}
      companyId={parseInt(projectDiv.dataset.companyId!)}
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
      companyId={parseInt(agreementDiv.dataset.companyId!)}
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
      companyId={parseInt(invoicesDiv.dataset.companyId!)}
      isAdmin={invoicesDiv.dataset.isAdmin === 'true'}
    />)
  }

  const invoiceDiv = document.getElementById('ClientPortalInvoicePage')
  if (invoiceDiv) {
    const root = createRoot(invoiceDiv)
    root.render(<ClientPortalInvoicePage 
      slug={invoiceDiv.dataset.slug!}
      companyName={invoiceDiv.dataset.companyName!}
      companyId={parseInt(invoiceDiv.dataset.companyId!)}
      invoiceId={parseInt(invoiceDiv.dataset.invoiceId!)}
      isAdmin={invoiceDiv.dataset.isAdmin === 'true'}
    />)
  }

  const expensesDiv = document.getElementById('ClientPortalExpensesPage')
  if (expensesDiv) {
    const root = createRoot(expensesDiv)
    root.render(<ClientPortalExpensesPage 
      slug={expensesDiv.dataset.slug!}
      companyName={expensesDiv.dataset.companyName!}
      companyId={parseInt(expensesDiv.dataset.companyId!)}
      isAdmin={expensesDiv.dataset.isAdmin === 'true'}
    />)
  }
})
