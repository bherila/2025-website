import ClientPortalInvoicesPage from '@/client-management/components/portal/ClientPortalInvoicesPage'
import { InvoiceListItemSchema, InvoiceSchema } from '@/client-management/types/invoice'
import { mountElement } from '@/lib/mount'

import { readPortalHydration, validateAppInitialData } from './shared'

document.addEventListener('DOMContentLoaded', () => {
  validateAppInitialData()
  mountElement('ClientPortalInvoicesPage', () => {
    const serverData = readPortalHydration('invoices')

    if (!serverData?.slug) {
      console.error('Missing server-hydrated payload for Client Portal invoices - aborting mount.')

      return null
    }

    const parsedInvoices = InvoiceSchema.array().safeParse(serverData.invoices ?? [])
    let initialInvoices: any[] | undefined

    if (parsedInvoices.success) {
      initialInvoices = parsedInvoices.data
    } else {
      const parsedList = InvoiceListItemSchema.array().safeParse(serverData.invoices ?? [])

      if (parsedList.success) {
        initialInvoices = parsedList.data
      } else {
        console.error('Invalid hydrated invoices payload for invoices page - will fall back to API fetch.', parsedInvoices.error || parsedList.error)
      }
    }

    return (
      <ClientPortalInvoicesPage
        slug={serverData.slug}
        companyName={serverData.companyName}
        companyId={serverData.companyId}
        initialInvoices={initialInvoices as any}
      />
    )
  })
})
