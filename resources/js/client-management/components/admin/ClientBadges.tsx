import type { BillingCadence } from '@/client-management/types/client-agreement'
import { formatBillingCadence } from '@/client-management/utils/formatBillingCadence'
import { Badge } from '@/components/ui/badge'

interface BadgeProps {
  value?: string | null | undefined
}

function humanize(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const BILLING_CADENCES = new Set<BillingCadence>(['monthly', 'quarterly', 'semi_annual', 'annual'])

function isBillingCadence(value: string): value is BillingCadence {
  return BILLING_CADENCES.has(value as BillingCadence)
}

export function CadenceBadge({ value }: BadgeProps) {
  if (!value) {
    return <Badge variant="outline">No cadence</Badge>
  }

  const label = isBillingCadence(value) ? formatBillingCadence(value) : humanize(value)

  return <Badge variant={value === 'monthly' ? 'secondary' : 'default'}>{label}</Badge>
}

export function InvoiceKindBadge({ value }: BadgeProps) {
  if (!value) {
    return null
  }

  const variant = value === 'interim_overage' ? 'outline' : 'secondary'

  return <Badge variant={variant}>{humanize(value)}</Badge>
}

export function InvoiceStatusBadge({ value }: BadgeProps) {
  if (!value) {
    return null
  }

  const variant = value === 'paid' ? 'default' : value === 'void' ? 'destructive' : 'secondary'

  return <Badge variant={variant}>{humanize(value)}</Badge>
}

const PROPOSAL_STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  sent: 'outline',
  changes_requested: 'outline',
  accepted: 'default',
  rejected: 'destructive',
  expired: 'secondary',
}

export function ProposalStatusBadge({ value }: BadgeProps) {
  if (!value) {
    return <Badge variant="secondary">Draft</Badge>
  }

  return <Badge variant={PROPOSAL_STATUS_VARIANTS[value] ?? 'secondary'}>{humanize(value)}</Badge>
}

interface AgreementStatusBadgesProps {
  signedAt?: string | null
  terminatedAt?: string | null
  visible?: boolean | undefined
}

export function AgreementStatusBadges({ signedAt, terminatedAt, visible }: AgreementStatusBadgesProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {signedAt ? <Badge variant="default">Signed</Badge> : <Badge variant="secondary">Draft</Badge>}
      {terminatedAt && <Badge variant="destructive">Terminated</Badge>}
      {visible && <Badge variant="outline">Visible</Badge>}
    </div>
  )
}
