import ClientPortalProjectPage from '@/client-management/components/portal/ClientPortalProjectPage'
import { ProjectSchema, UserSchema } from '@/client-management/types/hydration-schemas'
import { mountElement } from '@/lib/mount'

import { readPortalHydration, validateAppInitialData } from './shared'

document.addEventListener('DOMContentLoaded', () => {
  validateAppInitialData()
  mountElement('ClientPortalProjectPage', () => {
    const serverData = readPortalHydration('project')

    if (!serverData?.project) {
      console.error('Missing server-hydrated payload for Client Portal project - aborting mount.')

      return null
    }

    const parsedCompanyUsers = UserSchema.array().safeParse(serverData.companyUsers ?? [])
    if (!parsedCompanyUsers.success) {
      console.error('Invalid hydrated companyUsers for project page - will fall back to API fetch.', parsedCompanyUsers.error)
    }

    const parsedProjects = ProjectSchema.array().safeParse(serverData.projects ?? [])
    if (!parsedProjects.success) {
      console.error('Invalid hydrated projects for project page - will fall back to API fetch.', parsedProjects.error)
    }

    return (
      <ClientPortalProjectPage
        slug={serverData.slug}
        companyName={serverData.companyName}
        companyId={serverData.companyId}
        projectSlug={serverData.project.slug}
        projectName={serverData.project.name}
        initialTasks={Array.isArray(serverData.tasks) ? serverData.tasks as any : undefined}
        initialCompanyUsers={parsedCompanyUsers.success ? parsedCompanyUsers.data as any : undefined}
        initialProjects={parsedProjects.success ? parsedProjects.data as any : undefined}
      />
    )
  })
})
