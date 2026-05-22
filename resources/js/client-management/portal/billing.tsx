import ClientPortalBillingPage from '@/client-management/components/portal/ClientPortalBillingPage'
import { mountElement } from '@/lib/mount'

import { readPortalHydration, validateAppInitialData } from './shared'

document.addEventListener('DOMContentLoaded', () => {
  validateAppInitialData()
  mountElement('ClientPortalBillingPage', () => {
    const serverData = readPortalHydration('billing')

    if (!serverData?.slug) {
      console.error('Missing server-hydrated payload for Client Portal billing - aborting mount.')

      return null
    }

    return (
      <ClientPortalBillingPage
        slug={serverData.slug}
        companyName={serverData.companyName}
        companyId={serverData.companyId}
        stripeBillingEnabled={serverData.stripeBillingEnabled ?? true}
        stripePublishableKey={serverData.stripePublishableKey ?? null}
      />
    )
  })
})
