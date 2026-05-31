import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import type { NormalizedInvoice } from './invoiceAdapters'
import { InvoiceEmptyState } from './InvoiceEmptyState'
import { AdminInvoiceTableRow, PortalInvoiceTableRow } from './InvoiceTableRow'

// ── Admin mode props ───────────────────────────────────────────────────────────

interface AdminInvoiceTableProps {
  mode: 'admin'
  invoices: NormalizedInvoice[]
  selected: number[]
  onToggleSelected: (id: number) => void
  renderActions: (invoice: NormalizedInvoice) => ReactNode
}

// ── Portal mode props ─────────────────────────────────────────────────────────

interface PortalInvoiceTableProps {
  mode: 'portal'
  invoices: NormalizedInvoice[]
  slug: string
  onOpen: (invoice: NormalizedInvoice) => void
}

type InvoiceTableProps = AdminInvoiceTableProps | PortalInvoiceTableProps

/**
 * Shared invoice table shell. Renders admin or portal column layout depending on `mode`.
 *
 * Admin mode: checkbox + invoice# + cycle + kind + hours + total + status + stripe-failure + actions
 * Portal mode: invoice# + period + due-date + status + total + chevron (row click fires onOpen)
 */
export function InvoiceTable(props: InvoiceTableProps) {
  if (props.mode === 'admin') {
    return <AdminInvoiceTable {...props} />
  }

  return <PortalInvoiceTable {...props} />
}

function AdminInvoiceTable({ invoices, selected, onToggleSelected, renderActions }: AdminInvoiceTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead>Invoice</TableHead>
            <TableHead>Cycle</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Hours</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Stripe Failure</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => (
            <AdminInvoiceTableRow
              key={invoice.id}
              invoice={invoice}
              selected={selected.includes(invoice.id)}
              onToggleSelected={onToggleSelected}
              renderActions={renderActions}
            />
          ))}
          {invoices.length === 0 && (
            <InvoiceEmptyState mode="admin" colSpan={9} />
          )}
        </TableBody>
      </Table>
    </div>
  )
}

function PortalInvoiceTable({ invoices, slug, onOpen }: PortalInvoiceTableProps) {
  if (invoices.length === 0) {
    return <InvoiceEmptyState mode="portal" />
  }

  return (
    <div className="border border-muted/50 rounded-md overflow-hidden bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="py-2">Invoice #</TableHead>
            <TableHead className="py-2">Period</TableHead>
            <TableHead className="py-2">Due Date</TableHead>
            <TableHead className="py-2">Status</TableHead>
            <TableHead className="text-right py-2">Total</TableHead>
            <TableHead className="w-[40px] py-2 text-right">
              <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground/50" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => (
            <PortalInvoiceTableRow
              key={invoice.id}
              invoice={invoice}
              slug={slug}
              onOpen={onOpen}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
