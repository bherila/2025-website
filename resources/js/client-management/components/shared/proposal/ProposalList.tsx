import type { Proposal } from '@/client-management/types/proposal'

import ProposalCard from './ProposalCard'

interface ProposalListProps {
  proposals: Proposal[]
  onOpen?: (proposal: Proposal) => void
  actionLabel?: string
  emptyMessage?: string
  className?: string
}

/**
 * Renders the latest version of each proposal chain (grouped by `root_id`) as a
 * list of {@link ProposalCard}s with a shared empty state.
 */
export default function ProposalList({
  proposals,
  onOpen,
  actionLabel = 'Open',
  emptyMessage = 'No proposals yet for this company.',
  className = 'space-y-3',
}: ProposalListProps) {
  if (proposals.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">{emptyMessage}</div>
    )
  }

  return (
    <div className={className}>
      {proposals.map((proposal) => (
        <ProposalCard key={proposal.id} proposal={proposal} onOpen={onOpen} actionLabel={actionLabel} />
      ))}
    </div>
  )
}
