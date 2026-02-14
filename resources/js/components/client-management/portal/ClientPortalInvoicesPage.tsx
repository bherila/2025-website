import { ChevronRight, FileText, Loader2, Receipt, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ClientCompany } from '@/types/client-management/common'
import type { Invoice, InvoiceListItem } from '@/types/client-management/invoice'

import ClientPortalNav from './ClientPortalNav'

interface ClientPortalInvoicesPageProps {
  slug: string
  companyName: string
  companyId: number
  isAdmin?: boolean
  // can accept full invoices or lightweight list-item objects from server hydration
  initialInvoices?: (Invoice | InvoiceListItem)[]
}

export default function ClientPortalInvoicesPage({ slug, companyName, companyId, isAdmin = false, initialInvoices }: ClientPortalInvoicesPageProps) {
  const [invoices, setInvoices] = useState<(Invoice | InvoiceListItem)[]>(initialInvoices ?? [])
  const [company, setCompany] = useState<ClientCompany | null>(null)
  const [loading, setLoading] = useState(initialInvoices === undefined)
  const [generating, setGenerating] = useState(false)

  const fetchCompany = useCallback(async () => {
    try {
      const response = await fetch(`/api/client/portal/${slug}`)
      if (response.ok) {
        const data = await response.json()
        setCompany(data)
      }
    } catch (error) {
      console.error('Error fetching company:', error)
    }
  }, [slug])

  const fetchInvoices = useCallback(async () => {
    try {
      const response = await fetch(`/api/client/portal/${slug}/invoices`)
      if (response.ok) {
        const data = await response.json()
        // Sort by period_end ascending
        const sorted = data.sort((a: Invoice, b: Invoice) => {
          if (!a.period_end || !b.period_end) return 0
          return new Date(a.period_end).getTime() - new Date(b.period_end).getTime()
        })
        setInvoices(sorted)
      }
    } catch (error) {
      console.error('Error fetching invoices:', error)
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    if (initialInvoices === undefined) fetchInvoices()
    if (!company) fetchCompany()
  }, [fetchInvoices, fetchCompany, initialInvoices, company])

  useEffect(() => {
    document.title = `Invoices | ${companyName}`
  }, [companyName])

  const handleGenerateInvoices = async () => {
    if (!company) return

    setGenerating(true)
    try {
      const response = await fetch(`/api/client/mgmt/companies/${company.id}/invoices/generate-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
        }
      })

      if (response.ok) {
        await fetchInvoices()
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to generate invoices')
      }
    } catch (error) {
      console.error('Error generating invoices:', error)
      alert('An error occurred while generating invoices')
    } finally {
      setGenerating(false)
    }
  }

  const getStatusBadge = (status: string, invoice: Invoice | InvoiceListItem) => {
    // For draft invoices with period_end in the future, show "Upcoming"
    if (status === 'draft' && invoice.period_end) {
      const periodEnd = new Date(invoice.period_end);
      const now = new Date();
      if (periodEnd > now) {
        return <Badge variant="outline" className="border-blue-600 text-blue-600">Upcoming</Badge>
      }
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

  if (loading) {
    return (
      <>
        <ClientPortalNav slug={slug} companyName={companyName} companyId={companyId} isAdmin={isAdmin} currentPage="invoices" />
        <div className="mx-auto px-4 max-w-7xl">
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
      <ClientPortalNav slug={slug} companyName={companyName} companyId={companyId} isAdmin={isAdmin} currentPage="invoices" />
      <div className="mx-auto px-4 max-w-7xl">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Receipt className="h-8 w-8 text-muted-foreground" />
            <div>
              <h1 className="text-3xl font-bold">Invoices</h1>
            </div>
          </div>
          {isAdmin && (
            <Button
              onClick={handleGenerateInvoices}
              disabled={generating || !company}
              variant="outline"
            >
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Generate Invoices
                </>
              )}
            </Button>
          )}
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
                {invoices.map(invoice => (
                  <TableRow
                    key={invoice.client_invoice_id}
                    className="cursor-pointer group"
                    onClick={() => window.location.href = `/client/portal/${slug}/invoice/${invoice.client_invoice_id}`}
                  >
                    <TableCell className="py-3 font-medium">
                      {invoice.invoice_number || `INV-${invoice.client_invoice_id}`}
                    </TableCell>
                    <TableCell className="py-3 text-muted-foreground">
                      {invoice.period_start && invoice.period_end ? (
                        <span className="text-xs">
                          {new Date(invoice.period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(invoice.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
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
                      {getStatusBadge(invoice.status, invoice)}
                    </TableCell>
                    <TableCell className="text-right py-3 font-semibold">
                      ${parseFloat(invoice.invoice_total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  )
}
