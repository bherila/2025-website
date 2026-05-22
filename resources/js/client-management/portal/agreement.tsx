import ClientPortalAgreementPage from '@/client-management/components/portal/ClientPortalAgreementPage'
import { AgreementSchema } from '@/client-management/types/hydration-schemas'
import { InvoiceSchema } from '@/client-management/types/invoice'
import { mountElement } from '@/lib/mount'

import { readPortalHydration, validateAppInitialData } from './shared'

document.addEventListener('DOMContentLoaded', () => {
  validateAppInitialData()
  mountElement('ClientPortalAgreementPage', () => {
    const serverData = readPortalHydration('agreement')

    if (!serverData?.agreement) {
      console.error('Missing server-hydrated payload for Client Portal agreement - aborting mount.')

      return null
    }

    const parsedAgreement = AgreementSchema.safeParse(serverData.agreement ?? {})
    if (!parsedAgreement.success) {
      console.error('Invalid or missing hydrated agreement - aborting mount.', parsedAgreement.error)

      return null
    }

    const parsedInvoices = InvoiceSchema.array().safeParse(serverData.invoices ?? [])
    if (!parsedInvoices.success) {
      console.error('Invalid hydrated invoices for agreement page - ignoring server invoices.', parsedInvoices.error)
    }

    return (
      <ClientPortalAgreementPage
        slug={serverData.slug}
        companyName={serverData.companyName}
        companyId={serverData.companyId}
        agreementId={parsedAgreement.data.id}
        initialAgreement={parsedAgreement.data as any}
        initialInvoices={parsedInvoices.success ? parsedInvoices.data as any : undefined}
      />
    )
  })
})
