import ClientPortalInvoicePage from '@/client-management/components/portal/ClientPortalInvoicePage'
import type { Invoice } from '@/client-management/types/invoice'
import { InvoiceSchema } from '@/client-management/types/invoice'
import { mountElement } from '@/lib/mount'

import { readPortalHydration, validateAppInitialData } from './shared'

document.addEventListener('DOMContentLoaded', () => {
  validateAppInitialData()
  mountElement('ClientPortalInvoicePage', () => {
    const serverData = readPortalHydration('invoice')

    if (!serverData?.invoice) {
      console.error('Missing server-hydrated payload for Client Portal invoice - aborting mount.')

      return null
    }

    const rawInvoice = serverData.invoice ?? null
    let initialInvoice: Invoice | null = null

    if (rawInvoice) {
      const strict = InvoiceSchema.safeParse(rawInvoice)

      if (strict.success) {
        initialInvoice = strict.data
      } else {
        console.error('Invalid or missing hydrated invoice payload - aborting mount.', strict.error)
      }
    }

    if (!initialInvoice) {
      console.error('Invalid or missing hydrated invoice payload - aborting mount.')

      return null
    }

    return (
      <ClientPortalInvoicePage
        slug={serverData.slug}
        companyName={serverData.companyName}
        companyId={serverData.companyId}
        invoiceId={initialInvoice.client_invoice_id}
        initialInvoice={initialInvoice}
        stripeBillingEnabled={serverData.stripeBillingEnabled ?? true}
        stripePublishableKey={serverData.stripePublishableKey ?? null}
        stripeMaxAmountCents={serverData.stripeMaxAmountCents ?? 100000}
      />
    )
  })
})
