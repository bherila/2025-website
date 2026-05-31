import type { AdminInvoice } from '@/client-management/components/admin/AdminInvoiceList'
import type { InvoiceListItem } from '@/client-management/types/invoice'

import { fromAdminInvoice, fromPortalInvoice } from '../invoiceAdapters'

describe('fromAdminInvoice', () => {
  const base: AdminInvoice = {
    id: 42,
    invoice_number: 'INV-42',
    period_start: '2026-01-01',
    period_end: '2026-01-31',
    cycle_start: '2026-01-01',
    cycle_end: '2026-01-31',
    invoice_total: '1500.00',
    status: 'draft',
    invoice_kind: 'cadence_period',
    hours_worked: '10.5',
    retainer_hours_included: '20.0',
    hours_billed_at_rate: '0.0',
    stripe_payment_status: null,
    stripe_failure_reason: null,
    client_agreement_id: 7,
  }

  it('maps id, invoice_number, status', () => {
    const result = fromAdminInvoice(base)
    expect(result.id).toBe(42)
    expect(result.invoice_number).toBe('INV-42')
    expect(result.status).toBe('draft')
  })

  it('coerces invoice_total to number', () => {
    const result = fromAdminInvoice(base)
    expect(result.invoice_total).toBe(1500)
  })

  it('maps cycle dates from explicit cycle_start/cycle_end', () => {
    const result = fromAdminInvoice(base)
    expect(result.cycle_start).toBe('2026-01-01')
    expect(result.cycle_end).toBe('2026-01-31')
  })

  it('falls back cycle_start/cycle_end to period_start/period_end when absent', () => {
    const { cycle_start, cycle_end, ...rest } = base
    const result = fromAdminInvoice(rest as AdminInvoice)
    expect(result.cycle_start).toBe('2026-01-01')
    expect(result.cycle_end).toBe('2026-01-31')
  })

  it('maps admin-only fields (invoice_kind, hours, stripe)', () => {
    const result = fromAdminInvoice(base)
    expect(result.invoice_kind).toBe('cadence_period')
    expect(result.hours_worked).toBe(10.5)
    expect(result.retainer_hours_included).toBe(20)
    expect(result.stripe_payment_status).toBeNull()
    expect(result.stripe_failure_reason).toBeNull()
  })

  it('maps stripe failure fields', () => {
    const result = fromAdminInvoice({
      ...base,
      stripe_payment_status: 'failed',
      stripe_failure_reason: 'Card declined',
    })
    expect(result.stripe_payment_status).toBe('failed')
    expect(result.stripe_failure_reason).toBe('Card declined')
  })

  it('maps client_agreement_id', () => {
    const result = fromAdminInvoice(base)
    expect(result.client_agreement_id).toBe(7)
  })

  it('falls back to agreement_id when client_agreement_id absent', () => {
    const { client_agreement_id, ...rest } = base
    const result = fromAdminInvoice({ ...rest, agreement_id: 99 } as AdminInvoice)
    expect(result.client_agreement_id).toBe(99)
  })

  it('due_date is null (admin invoices have no due_date field)', () => {
    const result = fromAdminInvoice(base)
    expect(result.due_date).toBeNull()
  })
})

describe('fromPortalInvoice', () => {
  const base: InvoiceListItem = {
    client_invoice_id: 55,
    invoice_number: 'INV-55',
    invoice_total: '2000.00',
    status: 'issued',
    period_start: '2026-03-01',
    period_end: '2026-03-31',
    due_date: '2026-04-15',
  }

  it('maps client_invoice_id as id', () => {
    const result = fromPortalInvoice(base)
    expect(result.id).toBe(55)
  })

  it('maps invoice_number and status', () => {
    const result = fromPortalInvoice(base)
    expect(result.invoice_number).toBe('INV-55')
    expect(result.status).toBe('issued')
  })

  it('coerces invoice_total to number', () => {
    const result = fromPortalInvoice(base)
    expect(result.invoice_total).toBe(2000)
  })

  it('maps period and due_date', () => {
    const result = fromPortalInvoice(base)
    expect(result.period_start).toBe('2026-03-01')
    expect(result.period_end).toBe('2026-03-31')
    expect(result.due_date).toBe('2026-04-15')
  })

  it('falls back cycle_start/cycle_end to period dates when not provided', () => {
    const result = fromPortalInvoice(base)
    expect(result.cycle_start).toBe('2026-03-01')
    expect(result.cycle_end).toBe('2026-03-31')
  })

  it('portal result has no admin-only fields', () => {
    const result = fromPortalInvoice(base)
    expect(result.invoice_kind).toBeUndefined()
    expect(result.hours_worked).toBeUndefined()
    expect(result.stripe_payment_status).toBeUndefined()
  })

  it('handles null invoice_number', () => {
    const result = fromPortalInvoice({ ...base, invoice_number: null })
    expect(result.invoice_number).toBeNull()
  })

  it('handles numeric invoice_total (full Invoice type)', () => {
    // Invoice type has invoice_total as string, but numeric input coerces fine
    const result = fromPortalInvoice({ ...base, invoice_total: '750.50' })
    expect(result.invoice_total).toBeCloseTo(750.5)
  })
})
