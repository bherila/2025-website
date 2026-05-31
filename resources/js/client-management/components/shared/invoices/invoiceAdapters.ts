import type { AdminInvoice } from '@/client-management/components/admin/AdminInvoiceList'
import type { Invoice, InvoiceListItem } from '@/client-management/types/invoice'

/**
 * Normalized view-model for invoice table rows, shared between admin and portal modes.
 * Admin-only fields (kind, hours, stripe) are optional — absent in portal mode.
 */
export interface NormalizedInvoice {
  /** Stable row key — admin uses numeric `id`, portal uses `client_invoice_id` */
  id: number
  invoice_number: string | null
  period_start: string | null
  period_end: string | null
  /** cycle_start falls back to period_start when not present */
  cycle_start: string | null
  /** cycle_end falls back to period_end when not present */
  cycle_end: string | null
  due_date: string | null
  status: string
  /** invoice_total coerced to number */
  invoice_total: number
  // Admin-only optional fields
  invoice_kind?: string | null
  hours_worked?: number | null
  retainer_hours_included?: number | null
  hours_billed_at_rate?: number | null
  stripe_payment_status?: string | null
  stripe_failure_reason?: string | null
  client_agreement_id?: number | null
}

export function fromAdminInvoice(invoice: AdminInvoice): NormalizedInvoice {
  return {
    id: invoice.id,
    invoice_number: invoice.invoice_number ?? null,
    period_start: invoice.period_start ?? null,
    period_end: invoice.period_end ?? null,
    cycle_start: invoice.cycle_start ?? invoice.period_start ?? null,
    cycle_end: invoice.cycle_end ?? invoice.period_end ?? null,
    due_date: null,
    status: invoice.status,
    invoice_total: Number(invoice.invoice_total),
    invoice_kind: invoice.invoice_kind ?? null,
    hours_worked: invoice.hours_worked != null ? Number(invoice.hours_worked) : null,
    retainer_hours_included: invoice.retainer_hours_included != null ? Number(invoice.retainer_hours_included) : null,
    hours_billed_at_rate: invoice.hours_billed_at_rate != null ? Number(invoice.hours_billed_at_rate) : null,
    stripe_payment_status: invoice.stripe_payment_status ?? null,
    stripe_failure_reason: invoice.stripe_failure_reason ?? null,
    client_agreement_id: invoice.client_agreement_id ?? invoice.agreement_id ?? null,
  }
}

export function fromPortalInvoice(invoice: Invoice | InvoiceListItem): NormalizedInvoice {
  return {
    id: invoice.client_invoice_id,
    invoice_number: invoice.invoice_number ?? null,
    period_start: invoice.period_start ?? null,
    period_end: invoice.period_end ?? null,
    cycle_start: invoice.cycle_start ?? invoice.period_start ?? null,
    cycle_end: invoice.cycle_end ?? invoice.period_end ?? null,
    due_date: (invoice as InvoiceListItem).due_date ?? null,
    status: invoice.status,
    invoice_total: Number(invoice.invoice_total),
  }
}
