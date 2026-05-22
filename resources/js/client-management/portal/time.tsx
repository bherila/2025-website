import ClientPortalTimePage from '@/client-management/components/portal/ClientPortalTimePage'
import { ProjectSchema, UserSchema } from '@/client-management/types/hydration-schemas'
import { mountElement } from '@/lib/mount'

import { readPortalHydration, validateAppInitialData } from './shared'

document.addEventListener('DOMContentLoaded', () => {
  validateAppInitialData()
  mountElement('ClientPortalTimePage', () => {
    const serverData = readPortalHydration('time')

    if (!serverData?.slug) {
      console.error('Missing server-hydrated payload for Client Portal time - aborting mount.')

      return null
    }

    const parsedCompanyUsers = UserSchema.array().safeParse(serverData.companyUsers ?? [])
    if (!parsedCompanyUsers.success) {
      console.error('Invalid hydrated companyUsers for time page - will fall back to API fetch.', parsedCompanyUsers.error)
    }

    const parsedProjects = ProjectSchema.array().safeParse(serverData.projects ?? [])
    if (!parsedProjects.success) {
      console.error('Invalid hydrated projects for time page - will fall back to API fetch.', parsedProjects.error)
    }

    return (
      <ClientPortalTimePage
        slug={serverData.slug}
        companyName={serverData.companyName}
        companyId={serverData.companyId}
        initialCompanyUsers={parsedCompanyUsers.success ? parsedCompanyUsers.data as any : undefined}
        initialProjects={parsedProjects.success ? parsedProjects.data as any : undefined}
      />
    )
  })
})
