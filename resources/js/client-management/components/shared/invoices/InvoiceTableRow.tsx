import { AlertTriangle, ChevronRight, FileText } from 'lucide-react'
import type { ReactNode } from 'react'

import { hasStripePaymentFailure } from '@/client-management/components/admin/AdminInvoiceList'
import { InvoiceKindBadge } from '@/client-management/components/admin/ClientBadges'
import { Checkbox } from '@/components/ui/checkbox'
import { TableCell, TableRow } from '@/components/ui/table'

import type { NormalizedInvoice } from './invoiceAdapters'
import { InvoicePeriod } from './InvoicePeriod'
import { InvoiceStatusCell } from './InvoiceStatusCell'
import { InvoiceTotal } from './InvoiceTotal'

// ── Admin row ──────────────────────────────────────────────────────────────────

interface AdminInvoiceTableRowProps {
  invoice: NormalizedInvoice
  selected: boolean
  onToggleSelected: (id: number) => void
  renderActions: (invoice: NormalizedInvoice) => ReactNode
}

export function AdminInvoiceTableRow({ invoice, selected, onToggleSelected, renderActions }: AdminInvoiceTableRowProps) {
  return (
    <TableRow>
      <TableCell>
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelected(invoice.id)}
        />
      </TableCell>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          {invoice.invoice_number ?? `Draft ${invoice.id}`}
        </div>
      </TableCell>
      <TableCell>
        <InvoicePeriod start={invoice.cycle_start} end={invoice.cycle_end} variant="admin" />
      </TableCell>
      <TableCell>
        <InvoiceKindBadge value={invoice.invoice_kind} />
      </TableCell>
      <TableCell className="text-sm">
        {Number(invoice.hours_worked ?? 0).toFixed(2)} worked / {Number(invoice.retainer_hours_included ?? 0).toFixed(2)} retained
      </TableCell>
      <TableCell>
        <InvoiceTotal value={invoice.invoice_total} variant="admin" />
      </TableCell>
      <TableCell>
        <InvoiceStatusCell status={invoice.status} mode="admin" />
      </TableCell>
      <TableCell className="max-w-[220px] text-xs text-muted-foreground">
        {hasStripePaymentFailure({ stripe_failure_reason: invoice.stripe_failure_reason ?? null, stripe_payment_status: invoice.stripe_payment_status ?? null }) ? (
          <div className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="line-clamp-2">
              {invoice.stripe_failure_reason ?? `Stripe payment ${invoice.stripe_payment_status}`}
            </span>
          </div>
        ) : (
          <span>—</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-2">
          {renderActions(invoice)}
        </div>
      </TableCell>
    </TableRow>
  )
}

// ── Portal row ────────────────────────────────────────────────────────────────

interface PortalInvoiceTableRowProps {
  invoice: NormalizedInvoice
  slug: string
  onOpen: (invoice: NormalizedInvoice) => void
}

export function PortalInvoiceTableRow({ invoice, slug: _slug, onOpen }: PortalInvoiceTableRowProps) {
  return (
    <TableRow
      className="cursor-pointer group"
      onClick={() => onOpen(invoice)}
    >
      <TableCell className="py-3 font-medium">
        {invoice.invoice_number ?? `INV-${invoice.id}`}
      </TableCell>
      <TableCell className="py-3 text-muted-foreground">
        {invoice.period_start ?? invoice.period_end ? (
          <InvoicePeriod start={invoice.period_start} end={invoice.period_end} variant="portal" />
        ) : '-'}
      </TableCell>
      <TableCell className="py-3 text-muted-foreground">
        {invoice.status === 'issued' && invoice.due_date ? (
          <span className="text-xs">
            {new Date(invoice.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        ) : '-'}
      </TableCell>
      <TableCell className="py-3">
        <InvoiceStatusCell status={invoice.status} periodEnd={invoice.period_end} mode="portal" />
      </TableCell>
      <TableCell className="text-right py-3">
        <InvoiceTotal value={invoice.invoice_total} variant="portal" />
      </TableCell>
      <TableCell className="py-3 text-right">
        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </TableCell>
    </TableRow>
  )
}
