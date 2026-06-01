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
  const latest = latestPerChain(proposals)

  if (latest.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">{emptyMessage}</div>
    )
  }

  return (
    <div className={className}>
      {latest.map((proposal) => (
        <ProposalCard key={proposal.id} proposal={proposal} onOpen={onOpen} actionLabel={actionLabel} />
      ))}
    </div>
  )
}

/** Collapses a version chain (grouped by `root_id`) down to its highest version. */
function latestPerChain(proposals: Proposal[]): Proposal[] {
  const byChain = new Map<number, Proposal>()
  for (const proposal of proposals) {
    const chainId = proposal.root_id ?? proposal.id
    const current = byChain.get(chainId)
    if (!current || proposal.version > current.version) {
      byChain.set(chainId, proposal)
    }
  }
  return [...byChain.values()]
}
