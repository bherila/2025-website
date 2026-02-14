import { InvoiceSchema } from '@/types/client-management/invoice'

describe('InvoiceSchema (zod)', () => {
  it('parses a valid invoice', () => {
    const payload = {
      client_invoice_id: 1,
      client_company_id: 2,
      invoice_number: 'INV-1',
      invoice_total: '123.45',
      issue_date: null,
      due_date: null,
      paid_date: null,
      status: 'issued',
      period_start: '2024-01-01',
      period_end: '2024-01-31',
      retainer_hours_included: '0',
      hours_worked: '0',
      rollover_hours_used: '0',
      unused_hours_balance: '0',
      negative_hours_balance: '0',
      starting_unused_hours: '0',
      starting_negative_hours: '0',
      hours_billed_at_rate: '0',
      notes: null,
      line_items: [],
      payments: [],
      remaining_balance: '123.45',
      payments_total: '0.00'
    }

    const result = InvoiceSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it('InvoiceHydrationSchema accepts numeric totals and payments with missing notes', () => {
    const hydrated = {
      client_invoice_id: 1,
      invoice_total: 123.45,
      status: 'issued',
      period_start: '2024-01-01',
      period_end: '2024-01-31',
      retainer_hours_included: 10,
      hours_worked: 2,
      hours_billed_at_rate: 0,
      line_items: [],
      payments: [
        { client_invoice_payment_id: 1, client_invoice_id: 1, amount: 50, payment_date: '2024-01-15', payment_method: 'ACH' }
      ],
      remaining_balance: 73.45,
      payments_total: 50
    }

    const { InvoiceHydrationSchema } = require('@/types/client-management/invoice')
    const result = InvoiceHydrationSchema.safeParse(hydrated)
    expect(result.success).toBe(true)
  })

  it('rejects an invalid invoice shape', () => {
    const bad = { foo: 'bar' }
    const result = InvoiceSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })
})
