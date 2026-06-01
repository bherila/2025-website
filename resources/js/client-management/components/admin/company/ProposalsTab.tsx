import { useCallback, useEffect, useState } from 'react'

import ProposalList from '@/client-management/components/shared/proposal/ProposalList'
import type { Proposal } from '@/client-management/types/proposal'
import { ProposalSchema } from '@/client-management/types/proposal'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchWrapper } from '@/fetchWrapper'

import { openProposal } from './proposalNav'

interface ProposalsTabProps {
  companyId: number
  onCreateProposal: () => void
  creating: boolean
}

/**
 * The proposals timeline tab. Fetches the company's proposals directly from the
 * admin API (the API already returns newest chain/version first), keeping the
 * proposal payload off the heavier company-detail hydration.
 */
export default function ProposalsTab({ companyId, onCreateProposal, creating }: ProposalsTabProps) {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)

  const fetchProposals = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchWrapper.get(`/api/client/mgmt/companies/${companyId}/proposals`)
      const parsed = Array.isArray(data) ? data.map((row) => ProposalSchema.parse(row)) : []
      setProposals(parsed)
    } catch (error) {
      console.error('Error fetching proposals:', error)
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    void fetchProposals()
  }, [fetchProposals])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Proposals</CardTitle>
        <Button size="sm" onClick={onCreateProposal} disabled={creating}>
          New Proposal
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <ProposalList proposals={proposals} onOpen={openProposal} actionLabel="Open" />
        )}
      </CardContent>
    </Card>
  )
}
