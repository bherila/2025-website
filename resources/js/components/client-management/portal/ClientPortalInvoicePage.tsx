import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table'
import { Receipt, Check, Clock } from 'lucide-react'
import ClientPortalNav from './ClientPortalNav'

interface InvoiceLine {
  client_invoice_line_id: number
  description: string
  quantity: string
  unit_price: string
  line_total: string
  line_type: string
  hours: string | null
}

interface Invoice {
  client_invoice_id: number
  invoice_number: string | null
  invoice_total: string
  issue_date: string | null
  due_date: string | null
  paid_date: string | null
  status: 'draft' | 'issued' | 'paid' | 'void'
  period_start: string | null
  period_end: string | null
  retainer_hours_included: string
  hours_worked: string
  rollover_hours_used: string
  unused_hours_balance: string
  negative_hours_balance: string
  hours_billed_at_rate: string
  notes: string | null
  line_items: InvoiceLine[]
}

interface ClientPortalInvoicePageProps {
  slug: string
  companyName: string
  invoiceId: number
}

export default function ClientPortalInvoicePage({ slug, companyName, invoiceId }: ClientPortalInvoicePageProps) {
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchInvoice()
  }, [invoiceId])

  useEffect(() => {
    if (invoice) {
      document.title = `Invoice ${invoice.invoice_number || '#' + invoiceId} | ${companyName}`
    }
  }, [invoice, invoiceId, companyName])

  const fetchInvoice = async () => {
    try {
      const response = await fetch(`/api/client/portal/${slug}/invoices/${invoiceId}`)
      if (response.ok) {
        const data = await response.json()
        setInvoice(data)
      }
    } catch (error) {
      console.error('Error fetching invoice:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge variant="default" className="bg-green-600"><Check className="mr-1 h-3 w-3" /> Paid</Badge>
      case 'issued':
        return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" /> Issued</Badge>
      case 'void':
        return <Badge variant="destructive">Void</Badge>
      default:
        return <Badge variant="outline">Draft</Badge>
    }
  }

  if (loading) {
    return (
      <>
        <ClientPortalNav slug={slug} companyName={companyName} currentPage="invoice" />
        <div className="container mx-auto px-8 max-w-4xl">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <Skeleton className="h-8 w-48 mb-2" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i}>
                    <Skeleton className="h-4 w-20 mb-1" />
                    <Skeleton className="h-5 w-24" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-48 w-full" />
            </CardContent>
          </Card>
        </div>
      </>
    )
  }

  if (!invoice) {
    return <div className="p-8">Invoice not found</div>
  }

  return (
    <>
      <ClientPortalNav slug={slug} companyName={companyName} currentPage="invoice" />
      <div className="container mx-auto px-8 max-w-4xl">
        <div className="flex items-center gap-4 mb-6">
          <Receipt className="h-8 w-8 text-muted-foreground" />
          <div>
            <h1 className="text-3xl font-bold">
              {invoice.invoice_number || `Invoice #${invoice.client_invoice_id}`}
            </h1>
          </div>
          <div className="ml-auto">
            {getStatusBadge(invoice.status)}
          </div>
        </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Invoice Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {invoice.period_start && invoice.period_end && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Period:</span>
                <span>{new Date(invoice.period_start).toLocaleDateString()} - {new Date(invoice.period_end).toLocaleDateString()}</span>
              </div>
            )}
            {invoice.issue_date && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Issue Date:</span>
                <span>{new Date(invoice.issue_date).toLocaleDateString()}</span>
              </div>
            )}
            {invoice.due_date && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Due Date:</span>
                <span>{new Date(invoice.due_date).toLocaleDateString()}</span>
              </div>
            )}
            {invoice.paid_date && (
              <div className="flex justify-between text-green-600">
                <span>Paid Date:</span>
                <span>{new Date(invoice.paid_date).toLocaleDateString()}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Hours Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Retainer Hours:</span>
              <span>{parseFloat(invoice.retainer_hours_included).toFixed(2)}</span>
            </div>
            {parseFloat(invoice.rollover_hours_used) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rollover Used:</span>
                <span>{parseFloat(invoice.rollover_hours_used).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Hours Worked:</span>
              <span>{parseFloat(invoice.hours_worked).toFixed(2)}</span>
            </div>
            {parseFloat(invoice.hours_billed_at_rate) > 0 && (
              <div className="flex justify-between text-orange-600">
                <span>Additional Hours Billed:</span>
                <span>{parseFloat(invoice.hours_billed_at_rate).toFixed(2)}</span>
              </div>
            )}
            <hr />
            <div className="flex justify-between font-medium">
              <span>{parseFloat(invoice.unused_hours_balance) >= 0 ? 'Unused Hours Balance:' : 'Hours Deficit:'}</span>
              <span className={parseFloat(invoice.unused_hours_balance) < 0 ? 'text-orange-600' : 'text-green-600'}>
                {Math.abs(parseFloat(invoice.unused_hours_balance)).toFixed(2)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.line_items.map(line => (
                <TableRow key={line.client_invoice_line_id}>
                  <TableCell>{line.description}</TableCell>
                  <TableCell className="text-right">{parseFloat(line.quantity).toFixed(2)}</TableCell>
                  <TableCell className="text-right">${parseFloat(line.unit_price).toFixed(2)}</TableCell>
                  <TableCell className="text-right">${parseFloat(line.line_total).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="text-right font-bold">Total</TableCell>
                <TableCell className="text-right font-bold text-lg">${parseFloat(invoice.invoice_total).toFixed(2)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      {invoice.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{invoice.notes}</p>
          </CardContent>
        </Card>
      )}
      </div>
    </>
  )
}
