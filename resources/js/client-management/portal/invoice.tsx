import ClientPortalInvoicePage from '@/client-management/components/portal/ClientPortalInvoicePage'
import { InvoiceHydrationSchema, InvoiceSchema } from '@/client-management/types/invoice'
import { mountElement } from '@/lib/mount'

import { readPortalHydration, validateAppInitialData } from './shared'

function formatMoneyString(value: unknown, fallback = '0.00'): string {
  if (typeof value === 'number') {
    return value.toFixed(2)
  }

  if (value !== null && value !== undefined) {
    return String(value)
  }

  return fallback
}

document.addEventListener('DOMContentLoaded', () => {
  validateAppInitialData()
  mountElement('ClientPortalInvoicePage', () => {
    const serverData = readPortalHydration('invoice')

    if (!serverData?.invoice) {
      console.error('Missing server-hydrated payload for Client Portal invoice - aborting mount.')

      return null
    }

    const rawInvoice = serverData.invoice ?? null
    let initialInvoice: any = null

    if (rawInvoice) {
      const strict = InvoiceSchema.safeParse(rawInvoice)

      if (strict.success) {
        initialInvoice = strict.data
      } else {
        const relaxed = InvoiceHydrationSchema.safeParse(rawInvoice)

        if (relaxed.success) {
          const src = relaxed.data
          const coerced: any = {
            ...src,
            client_company_id: src.client_company_id ?? serverData.companyId,
            invoice_number: src.invoice_number ?? null,
            issue_date: src.issue_date ?? null,
            due_date: src.due_date ?? null,
            paid_date: src.paid_date ?? null,
            status: src.status ?? 'draft',
            period_start: src.period_start ?? null,
            period_end: src.period_end ?? null,
            notes: src.notes ?? null,
            invoice_total: formatMoneyString(src.invoice_total),
            remaining_balance: formatMoneyString(src.remaining_balance),
            payments_total: formatMoneyString(src.payments_total),
            retainer_hours_included: src.retainer_hours_included != null ? String(src.retainer_hours_included) : '0',
            hours_worked: src.hours_worked != null ? String(src.hours_worked) : '0',
            rollover_hours_used: src.rollover_hours_used != null ? String(src.rollover_hours_used) : '0',
            negative_offset: src.negative_offset != null ? String(src.negative_offset) : '0',
            unused_hours_balance: src.unused_hours_balance != null ? String(src.unused_hours_balance) : '0',
            negative_hours_balance: src.negative_hours_balance != null ? String(src.negative_hours_balance) : '0',
            starting_unused_hours: src.starting_unused_hours != null ? String(src.starting_unused_hours) : '0',
            starting_negative_hours: src.starting_negative_hours != null ? String(src.starting_negative_hours) : '0',
            hours_billed_at_rate: src.hours_billed_at_rate != null ? String(src.hours_billed_at_rate) : '0',
            payments: src.payments.map((payment: any) => ({
              ...payment,
              client_invoice_id: payment.client_invoice_id ?? src.client_company_id ?? serverData.companyId,
              payment_date: payment.payment_date ?? null,
              payment_method: payment.payment_method ?? 'Other',
              notes: payment.notes ?? null,
              created_at: payment.created_at ?? payment.payment_date ?? new Date().toISOString(),
              updated_at: payment.updated_at ?? payment.payment_date ?? new Date().toISOString(),
            })),
            stripe_payments: src.stripe_payments ?? [],
            previous_invoice_id: src.previous_invoice_id ?? null,
            next_invoice_id: src.next_invoice_id ?? null,
          }

          const recheck = InvoiceSchema.safeParse(coerced)

          if (recheck.success) {
            initialInvoice = recheck.data
          } else {
            console.error('Invalid or missing hydrated invoice payload - aborting mount.', recheck.error)
          }
        } else {
          console.error('Invalid or missing hydrated invoice payload - aborting mount.', relaxed.error)
        }
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
