import { FileText } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { TableCell, TableRow } from '@/components/ui/table'

interface InvoiceEmptyStateProps {
  mode: 'admin' | 'portal'
  /** Number of columns the empty row should span (admin mode only) */
  colSpan?: number
  message?: string
}

/**
 * Empty state for the invoice table.
 * Admin mode renders a table row; portal mode renders a Card.
 */
export function InvoiceEmptyState({ mode, colSpan = 10, message }: InvoiceEmptyStateProps) {
  if (mode === 'portal') {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No invoices yet</h3>
          <p className="text-muted-foreground">{message ?? 'Invoices will appear here once they are issued.'}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-24 text-center text-muted-foreground">
        {message ?? 'No invoices match these filters.'}
      </TableCell>
    </TableRow>
  )
}
