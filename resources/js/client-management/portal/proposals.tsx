import ClientPortalProposalsPage from '@/client-management/components/portal/ClientPortalProposalsPage'
import { ProposalSchema } from '@/client-management/types/proposal'
import { mountElement } from '@/lib/mount'

import { readPortalHydration, validateAppInitialData } from './shared'

document.addEventListener('DOMContentLoaded', () => {
  validateAppInitialData()
  mountElement('ClientPortalProposalsPage', () => {
    const serverData = readPortalHydration('proposals')

    if (!serverData) {
      return null
    }

    const parsed = ProposalSchema.array().safeParse(serverData.proposals ?? [])
    if (!parsed.success) {
      console.error('Invalid hydrated proposals - aborting mount.', parsed.error)

      return null
    }

    return (
      <ClientPortalProposalsPage
        slug={serverData.slug}
        companyName={serverData.companyName}
        companyId={serverData.companyId}
        proposals={parsed.data}
      />
    )
  })
})
