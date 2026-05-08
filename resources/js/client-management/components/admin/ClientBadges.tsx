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

export function CadenceBadge({ value }: BadgeProps) {
  if (!value) {
    return <Badge variant="outline">No cadence</Badge>
  }

  return <Badge variant={value === 'monthly' ? 'secondary' : 'default'}>{humanize(value)}</Badge>
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
