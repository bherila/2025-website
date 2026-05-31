import { Receipt } from 'lucide-react'

import AdminInvoiceList from '@/client-management/components/admin/AdminInvoiceList'
import type { Agreement } from '@/client-management/types/common'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** Admin invoice management tab. */
export default function InvoicesTab({ companyId, agreements }: { companyId: number; agreements: Agreement[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5" />
          Admin Invoices
        </CardTitle>
      </CardHeader>
      <CardContent>
        <AdminInvoiceList companyId={companyId} agreements={agreements} />
      </CardContent>
    </Card>
  )
}
