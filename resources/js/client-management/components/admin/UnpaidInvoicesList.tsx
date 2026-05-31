import currency from 'currency.js'
import { FileText } from 'lucide-react'

import type { ClientInvoice } from '@/client-management/types/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface UnpaidInvoicesListProps {
  invoices: ClientInvoice[]
  companyId: number
}

function isOverdue(invoice: ClientInvoice): boolean {
  if (!invoice.due_date || invoice.status !== 'issued') {
    return false
  }

  return new Date(invoice.due_date) < new Date()
}

/**
 * Unpaid-invoice rows for a company card. The "View" link opens the admin
 * Manage page (admin context), not the client portal.
 */
export default function UnpaidInvoicesList({ invoices, companyId }: UnpaidInvoicesListProps) {
  if (invoices.length === 0) {
    return null
  }

  return (
    <div className="border-t pt-3">
      <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <FileText className="h-4 w-4" aria-hidden="true" />
        Unpaid Invoices
      </h4>
      <div className="space-y-2">
        {invoices.map((invoice) => {
          const overdue = isOverdue(invoice)

          return (
            <div
              key={invoice.client_invoice_id}
              className={`flex items-center justify-between rounded-md border border-muted bg-muted/30 p-2 text-sm ${
                overdue ? 'border-l-2 border-l-destructive' : ''
              }`}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium">{invoice.invoice_number}</span>
                <span className="text-muted-foreground">
                  Due: {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : 'N/A'}
                </span>
                <Badge
                  variant={invoice.status === 'issued' ? 'destructive' : 'secondary'}
                  className="px-1.5 py-0 text-[10px]"
                >
                  {invoice.status.toUpperCase()}
                </Badge>
                {overdue && (
                  <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                    OVERDUE
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-amber-600 dark:text-amber-400">
                  {currency(Number(invoice.remaining_balance)).format()}
                </span>
                <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
                  <a href={`/client/mgmt/${companyId}`}>View →</a>
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
