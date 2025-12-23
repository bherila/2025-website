import { createRoot } from 'react-dom/client'
import ClientPortalIndexPage from '@/components/client-management/portal/ClientPortalIndexPage'
import ClientPortalTimePage from '@/components/client-management/portal/ClientPortalTimePage'
import ClientPortalProjectPage from '@/components/client-management/portal/ClientPortalProjectPage'

document.addEventListener('DOMContentLoaded', () => {
  const indexDiv = document.getElementById('ClientPortalIndexPage')
  if (indexDiv) {
    const root = createRoot(indexDiv)
    root.render(<ClientPortalIndexPage 
      slug={indexDiv.dataset.slug!}
      companyName={indexDiv.dataset.companyName!}
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
    />)
  }
})
