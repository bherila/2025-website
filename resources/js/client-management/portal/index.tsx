import ClientPortalIndexPage from '@/client-management/components/portal/ClientPortalIndexPage'
import { AgreementSchema, ProjectSchema, TimeEntrySchema, UserSchema } from '@/client-management/types/hydration-schemas'
import { mountElement } from '@/lib/mount'

import { readPortalHydration, validateAppInitialData } from './shared'

document.addEventListener('DOMContentLoaded', () => {
  validateAppInitialData()
  mountElement('ClientPortalIndexPage', () => {
    const serverData = readPortalHydration('index')

    if (!serverData?.slug) {
      console.error('Missing server-hydrated payload for Client Portal index - aborting mount.')

      return null
    }

    const parsedProjects = ProjectSchema.array().safeParse(serverData.projects ?? [])
    if (!parsedProjects.success) {
      console.error('Invalid hydrated projects payload - will fall back to API fetch.', parsedProjects.error)
    }

    const parsedAgreements = AgreementSchema.array().safeParse(serverData.agreements ?? [])
    if (!parsedAgreements.success) {
      console.error('Invalid hydrated agreements payload - ignoring server data.', parsedAgreements.error)
    }

    const parsedCompanyUsers = UserSchema.array().safeParse(serverData.companyUsers ?? [])
    if (!parsedCompanyUsers.success) {
      console.error('Invalid hydrated companyUsers payload - will fall back to API fetch.', parsedCompanyUsers.error)
    }

    const parsedRecentTimeEntries = TimeEntrySchema.array().safeParse(serverData.recentTimeEntries ?? [])
    if (!parsedRecentTimeEntries.success) {
      console.error('Invalid hydrated recentTimeEntries payload - ignoring server data.', parsedRecentTimeEntries.error)
    }

    return (
      <ClientPortalIndexPage
        slug={serverData.slug}
        companyName={serverData.companyName}
        companyId={serverData.companyId}
        initialProjects={parsedProjects.success ? parsedProjects.data as any : undefined}
        initialAgreements={parsedAgreements.success ? parsedAgreements.data as any : undefined}
        initialCompanyUsers={parsedCompanyUsers.success ? parsedCompanyUsers.data as any : undefined}
        initialRecentTimeEntries={parsedRecentTimeEntries.success ? parsedRecentTimeEntries.data as any : undefined}
        afterEdit={() => window.location.reload()}
      />
    )
  })
})
