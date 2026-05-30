import type { Agreement } from '@/client-management/types/common'

import AgreementCard from './AgreementCard'

interface AgreementListProps {
  agreements: Agreement[]
  onOpen?: (agreement: Agreement) => void
  actionLabel?: string
  emptyMessage?: string
  className?: string
}

/**
 * Renders a list of {@link AgreementCard}s with a shared empty state. Pass a
 * single-element array for the overview's "active agreement" summary or the
 * full set for the agreements timeline.
 */
export default function AgreementList({
  agreements,
  onOpen,
  actionLabel = 'Open',
  emptyMessage = 'No agreements found for this company.',
  className = 'space-y-3',
}: AgreementListProps) {
  if (agreements.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className={className}>
      {agreements.map((agreement) => (
        <AgreementCard key={agreement.id} agreement={agreement} onOpen={onOpen} actionLabel={actionLabel} />
      ))}
    </div>
  )
}
