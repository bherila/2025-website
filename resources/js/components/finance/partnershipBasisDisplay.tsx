import type { ReactElement } from 'react'

import { Badge } from '@/components/ui/badge'

/** Humanises snake_case event/source type labels for display. */
export function humanizeBasisLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

/** Review/lock status badge for a partnership basis year or interest. */
export function statusBadge(reviewStatus: string, isStale: boolean): ReactElement {
  if (isStale) {
    return <Badge variant="destructive">Stale</Badge>
  }
  if (reviewStatus === 'locked') {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">Locked</Badge>
  }
  if (reviewStatus === 'reviewed') {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">Reviewed</Badge>
  }
  if (reviewStatus === 'estimated') {
    return <Badge variant="secondary">Estimated</Badge>
  }
  return <Badge variant="outline">Needs review</Badge>
}

/** Badge for a reconciliation comparison: green when matched, red for mismatch, neutral for info. */
export function reconciliationStatusBadge(status: string): ReactElement {
  if (status === 'match') {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">Match</Badge>
  }
  if (status === 'mismatch') {
    return <Badge variant="destructive">Mismatch</Badge>
  }
  return <Badge variant="outline">Info</Badge>
}
