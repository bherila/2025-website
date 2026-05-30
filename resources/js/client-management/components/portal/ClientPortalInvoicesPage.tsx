import { Loader2, Receipt, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { ClientCompany } from '@/client-management/types/common'
import type { Invoice, InvoiceListItem } from '@/client-management/types/invoice'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsUserAdmin } from '@/hooks/useAppInitialData'

import { fromPortalInvoice, type NormalizedInvoice } from '../shared/invoices/invoiceAdapters'
import { InvoiceTable } from '../shared/invoices/InvoiceTable'
import ClientPortalNav from './ClientPortalNav'

interface ClientPortalInvoicesPageProps {
  slug: string
  companyName: string
  companyId: number
  // can accept full invoices or lightweight list-item objects from server hydration
  initialInvoices?: (Invoice | InvoiceListItem)[]
}

export default function ClientPortalInvoicesPage({ slug, companyName, companyId, initialInvoices }: ClientPortalInvoicesPageProps) {
  const isAdmin = useIsUserAdmin()
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

  const handleOpen = (invoice: NormalizedInvoice) => {
    window.location.href = `/client/portal/${slug}/invoice/${invoice.id}`
  }

  const normalizedInvoices = invoices.map(fromPortalInvoice)

  if (loading) {
    return (
      <>
        <ClientPortalNav slug={slug} companyName={companyName} companyId={companyId} currentPage="invoices" />
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
      <ClientPortalNav slug={slug} companyName={companyName} companyId={companyId} currentPage="invoices" />
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

        <InvoiceTable
          mode="portal"
          invoices={normalizedInvoices}
          slug={slug}
          onOpen={handleOpen}
        />
      </div>
    </>
  )
}
