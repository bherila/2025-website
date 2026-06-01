import ClientPortalProposalPage from '@/client-management/components/portal/ClientPortalProposalPage'
import { ProposalSchema } from '@/client-management/types/proposal'
import { mountElement } from '@/lib/mount'

import { readPortalHydration, validateAppInitialData } from './shared'

document.addEventListener('DOMContentLoaded', () => {
  validateAppInitialData()
  mountElement('ClientPortalProposalPage', () => {
    const serverData = readPortalHydration('proposal')

    if (!serverData?.proposal) {
      console.error('Missing server-hydrated payload for Client Portal proposal - aborting mount.')

      return null
    }

    const parsed = ProposalSchema.safeParse(serverData.proposal)
    if (!parsed.success) {
      console.error('Invalid or missing hydrated proposal - aborting mount.', parsed.error)

      return null
    }

    return (
      <ClientPortalProposalPage
        slug={serverData.slug}
        companyName={serverData.companyName}
        companyId={serverData.companyId}
        initialProposal={parsed.data}
      />
    )
  })
})
