import ProposalList from '@/client-management/components/shared/proposal/ProposalList'
import type { Proposal } from '@/client-management/types/proposal'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import ClientPortalNav from './ClientPortalNav'

interface ClientPortalProposalsPageProps {
  slug: string
  companyName: string
  companyId: number
  proposals: Proposal[]
}

export default function ClientPortalProposalsPage({
  slug,
  companyName,
  companyId,
  proposals,
}: ClientPortalProposalsPageProps) {
  const openProposal = (proposal: Proposal) => {
    window.location.href = `/client/portal/${encodeURIComponent(slug)}/proposal/${encodeURIComponent(String(proposal.id))}`
  }

  return (
    <>
      <ClientPortalNav slug={slug} companyName={companyName} companyId={companyId} currentPage="proposals" />
      <div className="mx-auto max-w-4xl px-4">
        <Card>
          <CardHeader>
            <CardTitle>Proposals</CardTitle>
          </CardHeader>
          <CardContent>
            <ProposalList
              proposals={proposals}
              onOpen={openProposal}
              actionLabel="View"
              emptyMessage="You don't have any proposals yet."
            />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
