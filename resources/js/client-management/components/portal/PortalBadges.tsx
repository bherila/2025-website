import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const micro = 'text-[9px] px-1 py-0 h-3.5 font-bold shrink-0 uppercase'

export function BillabilityBadge({ isBillable }: { isBillable: boolean }) {
  return (
    <Badge variant={isBillable ? 'default' : 'secondary'} className={`${micro}`}>
      {isBillable ? 'BILLABLE' : 'NON-BILLABLE'}
    </Badge>
  )
}

export function InvoicedBadge({ href }: { href?: string | undefined }) {
  const badge = (
    <Badge
      variant="outline"
      className={cn(micro, 'border-green-600 text-green-600 dark:border-green-400 dark:text-green-400', href && 'hover:bg-green-50 dark:hover:bg-green-950')}
    >
      Invoiced
    </Badge>
  )
  return href ? <a href={href} className="no-underline">{badge}</a> : badge
}

export function UpcomingMicroBadge({ href }: { href: string }) {
  return (
    <a href={href} className="no-underline">
      <Badge variant="outline" className={`${micro} border-blue-600 text-blue-600 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-950`}>
        Upcoming
      </Badge>
    </a>
  )
}

/** Amber badge with background fill — entry has been deferred off an invoice */
export function DeferredBadge({ title, className }: { title?: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(micro, 'border-amber-600 text-amber-700 bg-amber-50 dark:border-amber-500 dark:text-amber-400 dark:bg-amber-950', className)}
      title={title}
    >
      Deferred
    </Badge>
  )
}

/** Amber badge without background fill — entry is flagged for deferred billing but not yet deferred */
export function DeferrableBadge() {
  return (
    <Badge variant="outline" className={`${micro} border-amber-600 text-amber-700 dark:border-amber-500 dark:text-amber-400`}>
      Deferable
    </Badge>
  )
}

export function ProjectBadge({ name }: { name: string }) {
  return (
    <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 font-medium border-muted-foreground/30 text-muted-foreground shrink-0">
      {name}
    </Badge>
  )
}

/** Full-size status badge for the invoice list page */
export function InvoiceListStatusBadge({ status, periodEnd }: { status: string; periodEnd?: string | null | undefined }) {
  if (status === 'draft' && periodEnd && new Date(periodEnd) > new Date()) {
    return <Badge variant="outline" className="border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400">Upcoming</Badge>
  }
  switch (status) {
    case 'paid':
      return <Badge variant="default" className="bg-green-600">Paid</Badge>
    case 'issued':
      return <Badge variant="secondary">Issued</Badge>
    case 'void':
      return <Badge variant="destructive">Void</Badge>
    default:
      return <Badge variant="outline">Draft</Badge>
  }
}
