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

  it('InvoiceHydrationSchema accepts compact invoice detail payloads with omitted null fields', () => {
    const hydrated = {
      client_invoice_id: 63,
      client_company_id: 1,
      invoice_number: 'VETV-202604-001',
      invoice_total: '7281.24',
      issue_date: '2026-05-02',
      paid_date: '2026-05-07',
      status: 'paid',
      invoice_kind: 'cadence_period',
      period_start: '2026-04-01',
      period_end: '2026-04-30',
      retainer_hours_included: '10.0000',
      hours_worked: '0.1667',
      negative_offset: 10,
      rollover_hours_used: '0.0000',
      unused_hours_balance: '0.0000',
      negative_hours_balance: '18.0000',
      starting_unused_hours: '0.0000',
      starting_negative_hours: '8.0000',
      hours_billed_at_rate: '9.4166',
      payments: [],
      stripe_payments: [],
      payments_total: 7281.2399999999998,
      remaining_balance: 0,
      deferred_pending: [
        {
          id: 255,
          hours: 0.75,
          date_worked: '2026-04-18',
          name: 'Built out jest e2e test suite for daily runs',
          billed_invoice: {
            id: 64,
            invoice_number: 'VETV-202605-001',
          },
        },
        {
          id: 333,
          hours: 0.25,
          date_worked: '2026-04-26',
        },
      ],
      line_items: [
        {
          client_invoice_line_id: 558,
          description: 'Work items applied to retainer',
          quantity: '',
          unit_price: '0.00',
          line_total: '0.00',
          line_type: 'prior_month_retainer',
          hours: '1.1667',
          line_date: '2026-04-30',
          time_entries: [
            {
              minutes_worked: 15,
              is_deferred_billing: false,
            },
          ],
        },
      ],
    }

    const result = InvoiceHydrationSchema.safeParse(hydrated)
    expect(result.success).toBe(true)

    if (!result.success) {
      return
    }

    expect(result.data.negative_offset).toBe('10')
    expect(result.data.remaining_balance).toBe('0.00')
    expect(result.data.payments_total).toBe('7281.24')
    expect(result.data.deferred_pending?.[0]?.billed_invoice?.issue_date).toBeNull()
    expect(result.data.deferred_pending?.[1]?.name).toBeNull()
    expect(result.data.line_items[0]?.time_entries?.[0]?.name).toBeNull()
    expect(result.data.line_items[0]?.time_entries?.[0]?.date_worked).toBeNull()

    const strict = InvoiceSchema.safeParse({
      ...result.data,
      invoice_number: result.data.invoice_number ?? null,
      issue_date: result.data.issue_date ?? null,
      due_date: result.data.due_date ?? null,
      paid_date: result.data.paid_date ?? null,
      period_start: result.data.period_start ?? null,
      period_end: result.data.period_end ?? null,
      notes: result.data.notes ?? null,
      invoice_total: result.data.invoice_total ?? '0.00',
      retainer_hours_included: result.data.retainer_hours_included ?? '0',
      hours_worked: result.data.hours_worked ?? '0',
      negative_offset: result.data.negative_offset ?? '0',
      rollover_hours_used: result.data.rollover_hours_used ?? '0',
      unused_hours_balance: result.data.unused_hours_balance ?? '0',
      negative_hours_balance: result.data.negative_hours_balance ?? '0',
      starting_unused_hours: result.data.starting_unused_hours ?? '0',
      starting_negative_hours: result.data.starting_negative_hours ?? '0',
      hours_billed_at_rate: result.data.hours_billed_at_rate ?? '0',
      remaining_balance: result.data.remaining_balance ?? '0.00',
      payments_total: result.data.payments_total ?? '0.00',
    })
    expect(strict.success).toBe(true)
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
