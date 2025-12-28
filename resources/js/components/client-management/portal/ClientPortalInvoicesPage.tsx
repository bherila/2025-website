import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, FileText, Receipt } from 'lucide-react'
import ClientPortalNav from './ClientPortalNav'
import type { Invoice } from '@/types/client-management/invoice'
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

interface ClientPortalInvoicesPageProps {
  slug: string
  companyName: string
}

export default function ClientPortalInvoicesPage({ slug, companyName }: ClientPortalInvoicesPageProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchInvoices()
  }, [slug])

  useEffect(() => {
    document.title = `Invoices | ${companyName}`
  }, [companyName])

  const fetchInvoices = async () => {
    try {
      const response = await fetch(`/api/client/portal/${slug}/invoices`)
      if (response.ok) {
        const data = await response.json()
        setInvoices(data)
      }
    } catch (error) {
      console.error('Error fetching invoices:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
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

  if (loading) {
    return (
      <>
        <ClientPortalNav slug={slug} companyName={companyName} currentPage="invoices" />
        <div className="container mx-auto px-8 max-w-4xl">
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-center">
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                    <Skeleton className="h-6 w-16" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <ClientPortalNav slug={slug} companyName={companyName} currentPage="invoices" />
      <div className="container mx-auto px-8 max-w-4xl">
        <div className="mb-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href={`/client/portal/${slug}`}>Home</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Invoices</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div className="flex items-center gap-4 mb-6">
          <Receipt className="h-8 w-8 text-muted-foreground" />
          <div>
            <h1 className="text-3xl font-bold">Invoices</h1>
          </div>
        </div>

      {invoices.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No invoices yet</h3>
            <p className="text-muted-foreground">Invoices will appear here once they are issued.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {invoices.map(invoice => (
            <Card key={invoice.client_invoice_id} 
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => window.location.href = `/client/portal/${slug}/invoice/${invoice.client_invoice_id}`}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-lg">
                    {invoice.invoice_number || `Invoice #${invoice.client_invoice_id}`}
                  </CardTitle>
                  {getStatusBadge(invoice.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center">
                  <div className="space-y-1 text-sm text-muted-foreground">
                    {invoice.period_start && invoice.period_end && (
                      <p>Period: {new Date(invoice.period_start).toLocaleDateString()} - {new Date(invoice.period_end).toLocaleDateString()}</p>
                    )}
                    {invoice.issue_date && (
                      <p>Issued: {new Date(invoice.issue_date).toLocaleDateString()}</p>
                    )}
                    {invoice.due_date && invoice.status === 'issued' && (
                      <p>Due: {new Date(invoice.due_date).toLocaleDateString()}</p>
                    )}
                    {invoice.paid_date && (
                      <p className="text-green-600">Paid: {new Date(invoice.paid_date).toLocaleDateString()}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">${parseFloat(invoice.invoice_total).toLocaleString()}</p>
                    {parseFloat(invoice.unused_hours_balance) !== 0 && (
                      <p className="text-sm text-muted-foreground">
                        {parseFloat(invoice.unused_hours_balance) > 0 ? 'Unused hours' : 'Hours owed'}: {Math.abs(parseFloat(invoice.unused_hours_balance)).toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </div>
    </>
  )
}
