import currency from 'currency.js'

import { ProposalStatusBadge } from '@/client-management/components/admin/ClientBadges'
import type { Proposal } from '@/client-management/types/proposal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface ProposalCardProps {
  proposal: Proposal
  onOpen?: ((proposal: Proposal) => void) | undefined
  actionLabel?: string
}

/** Maximum upfront net (base + all add-ons − credit); optionals are client-selectable. */
function maxNet(proposal: Proposal): number {
  let total = currency(proposal.base_amount)
  for (const item of proposal.items) {
    if (item.kind === 'add_on' && item.charge_cadence === 'one_time' && item.amount) {
      total = total.add(item.amount)
    }
  }
  return total.subtract(proposal.credit_amount ?? 0).value
}

/**
 * A single proposal row: title, version + status badges and the upfront net.
 * Shared by the admin proposals timeline and (later) the client portal list.
 */
export default function ProposalCard({ proposal, onOpen, actionLabel = 'Open' }: ProposalCardProps) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-md border p-4 hover:bg-muted/40 ${onOpen ? 'cursor-pointer' : ''}`}
      onClick={onOpen ? () => onOpen(proposal) : undefined}
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{proposal.title}</span>
          <Badge variant="outline">v{proposal.version}</Badge>
          <ProposalStatusBadge value={proposal.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {currency(maxNet(proposal)).format()} upfront
          {proposal.retainer_interval_months
            ? ` · retainer every ${proposal.retainer_interval_months} mo`
            : ''}
        </p>
      </div>
      {onOpen && (
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            onOpen(proposal)
          }}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
