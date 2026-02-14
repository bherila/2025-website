import { createRoot } from 'react-dom/client'

import ClientPortalAgreementPage from '@/components/client-management/portal/ClientPortalAgreementPage'
import ClientPortalExpensesPage from '@/components/client-management/portal/ClientPortalExpensesPage'
import ClientPortalIndexPage from '@/components/client-management/portal/ClientPortalIndexPage'
import ClientPortalInvoicePage from '@/components/client-management/portal/ClientPortalInvoicePage'
import ClientPortalInvoicesPage from '@/components/client-management/portal/ClientPortalInvoicesPage'
import ClientPortalProjectPage from '@/components/client-management/portal/ClientPortalProjectPage'
import ClientPortalTimePage from '@/components/client-management/portal/ClientPortalTimePage'

document.addEventListener('DOMContentLoaded', () => {
  const indexDiv = document.getElementById('ClientPortalIndexPage')
  if (indexDiv) {
    // Server-hydrated payload in <head> is now required for the index page.
    // Fall back to parsing data-* attributes only for non-critical arrays (back-compat).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const serverData: any = (window as any).__CLIENT_PORTAL_INITIAL_DATA__ || null

    if (!serverData || !serverData.slug) {
      console.error('Missing server-hydrated payload for Client Portal index — aborting mount.')
      return
    }

    const initialProjects = serverData.projects ?? (indexDiv.dataset.projects ? JSON.parse(indexDiv.dataset.projects) : [])
    const initialAgreements = serverData.agreements ?? (indexDiv.dataset.agreements ? JSON.parse(indexDiv.dataset.agreements) : [])
    const initialCompanyUsers = serverData.companyUsers ?? (indexDiv.dataset.companyUsers ? JSON.parse(indexDiv.dataset.companyUsers) : [])
    const initialRecentTimeEntries = serverData.recentTimeEntries ?? (indexDiv.dataset.recentTimeEntries ? JSON.parse(indexDiv.dataset.recentTimeEntries) : [])
    const initialCompanyFiles = serverData.companyFiles ?? (indexDiv.dataset.companyFiles ? JSON.parse(indexDiv.dataset.companyFiles) : [])

    const slug = serverData.slug
    const companyName = serverData.companyName
    const companyId = serverData.companyId
    const isAdmin = serverData.isAdmin

    const root = createRoot(indexDiv)
    root.render(<ClientPortalIndexPage 
      slug={slug}
      companyName={companyName}
      companyId={companyId}
      isAdmin={isAdmin}
      initialProjects={initialProjects}
      initialAgreements={initialAgreements}
      initialCompanyUsers={initialCompanyUsers}
      initialRecentTimeEntries={initialRecentTimeEntries}
      initialCompanyFiles={initialCompanyFiles}
      afterEdit={() => window.location.reload()}
    />)
  }

  const timeDiv = document.getElementById('ClientPortalTimePage')
  if (timeDiv) {
    // Prefer head-hydrated payload when available
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const serverData: any = (window as any).__CLIENT_PORTAL_INITIAL_DATA__ || null

    const slug = serverData?.slug ?? timeDiv.dataset.slug!
    const companyName = serverData?.companyName ?? timeDiv.dataset.companyName!
    const companyId = serverData?.companyId ?? parseInt(timeDiv.dataset.companyId!)
    const isAdmin = serverData?.isAdmin ?? (timeDiv.dataset.isAdmin === 'true')
    const initialCompanyUsers = serverData?.companyUsers ?? []
    const initialProjects = serverData?.projects ?? []

    const root = createRoot(timeDiv)
    root.render(<ClientPortalTimePage 
      slug={slug}
      companyName={companyName}
      companyId={companyId}
      isAdmin={isAdmin}
      initialCompanyUsers={initialCompanyUsers}
      initialProjects={initialProjects}
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
