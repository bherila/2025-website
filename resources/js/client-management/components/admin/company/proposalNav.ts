import type { Proposal } from '@/client-management/types/proposal'

/** Navigates the browser to the admin proposal builder. */
export function openProposal(proposal: Proposal): void {
  window.location.href = `/client/mgmt/proposal/${proposal.id}`
}
