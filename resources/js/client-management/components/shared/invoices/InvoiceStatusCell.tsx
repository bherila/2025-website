import { InvoiceStatusBadge } from '@/client-management/components/admin/ClientBadges'
import { InvoiceListStatusBadge } from '@/client-management/components/portal/PortalBadges'

interface InvoiceStatusCellProps {
  status: string
  periodEnd?: string | null
  mode: 'admin' | 'portal'
}

/**
 * Renders the appropriate status badge depending on context.
 * Admin mode uses InvoiceStatusBadge; portal mode uses InvoiceListStatusBadge.
 */
export function InvoiceStatusCell({ status, periodEnd, mode }: InvoiceStatusCellProps) {
  if (mode === 'portal') {
    return <InvoiceListStatusBadge status={status} periodEnd={periodEnd} />
  }

  return <InvoiceStatusBadge value={status} />
}
