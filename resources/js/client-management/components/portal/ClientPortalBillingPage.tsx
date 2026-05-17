import ClientPortalNav from './ClientPortalNav'
import SavedPaymentMethodsCard from './SavedPaymentMethodsCard'

interface ClientPortalBillingPageProps {
  slug: string
  companyName: string
  companyId: number
  stripeBillingEnabled: boolean
  stripePublishableKey: string | null
}

export default function ClientPortalBillingPage({
  slug,
  companyName,
  companyId,
  stripeBillingEnabled,
  stripePublishableKey,
}: ClientPortalBillingPageProps) {
  return (
    <>
      <ClientPortalNav slug={slug} companyName={companyName} companyId={companyId} currentPage="billing" />

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 pb-12">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-normal">Billing</h1>
          <p className="text-sm text-muted-foreground">Manage saved payment methods for invoice checkout.</p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          {stripeBillingEnabled ? (
            <SavedPaymentMethodsCard companyId={companyId} publishableKey={stripePublishableKey} />
          ) : (
            <section className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
              <h2 className="text-base font-semibold">Online Payments Disabled</h2>
              <p className="mt-3 text-sm text-amber-900/80 dark:text-amber-200/80">
                Stripe payment methods are not available for this client company right now.
              </p>
            </section>
          )}

          <section className="rounded-lg border border-border bg-card p-6 text-card-foreground">
            <h2 className="text-base font-semibold">Online Payments</h2>
            <div className="mt-3 flex flex-col gap-3 text-sm text-muted-foreground">
              {stripeBillingEnabled ? (
                <>
                  <p>Issued invoices up to $1,000 can be paid online by card or US bank account.</p>
                  <p>Invoices above that limit stay on manual payment instructions.</p>
                </>
              ) : (
                <p>Invoices for this company currently use manual payment instructions.</p>
              )}
            </div>
          </section>
        </div>
      </main>
    </>
  )
}
