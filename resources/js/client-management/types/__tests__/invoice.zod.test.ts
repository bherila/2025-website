import { InvoiceHydrationSchema, InvoiceLineSchema, InvoiceSchema } from '@/client-management/types/invoice'

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

    const result = InvoiceHydrationSchema.safeParse(hydrated)
    expect(result.success).toBe(true)
  })

  it('InvoiceHydrationSchema accepts compact Stripe activity with null fields omitted', () => {
    const hydrated = {
      client_invoice_id: 1,
      invoice_total: 123.45,
      status: 'issued',
      line_items: [],
      payments: [],
      stripe_payments: [
        {
          id: 10,
          stripe_payment_intent_id: 'pi_test',
          amount: 12345,
          status: 'succeeded',
        },
      ],
      remaining_balance: 0,
      payments_total: 123.45,
    }

    const result = InvoiceHydrationSchema.safeParse(hydrated)
    expect(result.success).toBe(true)
    expect(result.data?.stripe_payments[0]?.failure_reason).toBeNull()
  })

  it('InvoiceSchema accepts existing custom payment method labels with compact nullable fields', () => {
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
      payments: [
        {
          client_invoice_payment_id: 1,
          client_invoice_id: 1,
          amount: '123.45',
          payment_date: '2024-01-15',
          payment_method: 'Wire Transfer',
        },
      ],
      remaining_balance: '0.00',
      payments_total: '123.45',
    }

    const result = InvoiceSchema.safeParse(payload)
    expect(result.success).toBe(true)
    expect(result.data?.payments[0]?.notes).toBeNull()
    expect(result.data?.payments[0]?.created_at).toBeNull()
    expect(result.data?.payments[0]?.updated_at).toBeNull()
  })

  it('rejects an invalid invoice shape', () => {
    const bad = { foo: 'bar' }
    const result = InvoiceSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })
})

describe('InvoiceLineSchema quantity field', () => {
  const base = {
    client_invoice_line_id: 1,
    description: 'Test line',
    unit_price: '100.00',
    line_total: '0.00',
    line_type: 'additional_hours',
    hours: null,
    line_date: null,
  }

  it('preserves h:mm time strings verbatim', () => {
    const result = InvoiceLineSchema.safeParse({ ...base, quantity: '3:45' })
    expect(result.success).toBe(true)
    expect(result.data?.quantity).toBe('3:45')
  })

  it('preserves plain numeric strings', () => {
    const result = InvoiceLineSchema.safeParse({ ...base, quantity: '1' })
    expect(result.success).toBe(true)
    expect(result.data?.quantity).toBe('1')
  })

  it('coerces empty string to empty string', () => {
    const result = InvoiceLineSchema.safeParse({ ...base, quantity: '' })
    expect(result.success).toBe(true)
    expect(result.data?.quantity).toBe('')
  })

  it('coerces null to empty string', () => {
    const result = InvoiceLineSchema.safeParse({ ...base, quantity: null })
    expect(result.success).toBe(true)
    expect(result.data?.quantity).toBe('')
  })
})
