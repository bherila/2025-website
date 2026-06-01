import { InvoiceLineSchema, InvoiceSchema } from '@/client-management/types/invoice'

function makeInvoicePayload(overrides: Record<string, unknown> = {}) {
  return {
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
    invoice_kind: 'cadence_period',
    cycle_start: null,
    cycle_end: null,
    retainer_hours_included: '0.0000',
    hours_worked: '0.0000',
    carried_in_hours: 0,
    current_month_hours: 0,
    negative_offset: 0,
    rollover_hours_used: '0.0000',
    unused_hours_balance: '0.0000',
    negative_hours_balance: '0.0000',
    starting_unused_hours: '0.0000',
    starting_negative_hours: '0.0000',
    hours_billed_at_rate: '0.0000',
    notes: null,
    line_items: [],
    payments: [],
    stripe_payments: [],
    remaining_balance: '123.45',
    payments_total: '0.00',
    credit_applied: 0,
    overpaid_amount: 0,
    available_credit_after: 0,
    deferred_pending: [],
    previous_invoice_id: null,
    next_invoice_id: null,
    ...overrides,
  }
}

describe('InvoiceSchema (zod)', () => {
  it('parses the canonical invoice detail payload', () => {
    const result = InvoiceSchema.safeParse(makeInvoicePayload())

    expect(result.success).toBe(true)
  })

  it('parses canonical nested invoice detail fields with explicit nulls', () => {
    const payload = makeInvoicePayload({
      invoice_number: null,
      due_date: null,
      paid_date: null,
      notes: null,
      negative_offset: 10,
      payments_total: '7281.24',
      remaining_balance: '0.00',
      deferred_pending: [
        {
          id: 255,
          hours: 0.75,
          date_worked: '2026-04-18',
          name: 'Built out focused test suite',
          billed_invoice: {
            id: 64,
            invoice_number: null,
            issue_date: null,
          },
        },
        {
          id: 333,
          hours: 0.25,
          date_worked: '2026-04-26',
          name: null,
          billed_invoice: null,
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
          line_date: null,
          client_agreement_recurring_item_id: null,
          time_entries: [
            {
              name: null,
              minutes_worked: 15,
              date_worked: null,
              is_deferred_billing: false,
            },
          ],
        },
      ],
      stripe_payments: [
        {
          id: 10,
          stripe_payment_intent_id: 'pi_test',
          stripe_payment_method_id: null,
          amount: 12345,
          status: 'succeeded',
          failure_reason: null,
          last_event_id: null,
          created_at: null,
          updated_at: null,
        },
      ],
    })

    const result = InvoiceSchema.safeParse(payload)

    expect(result.success).toBe(true)

    if (!result.success) {
      return
    }

    expect(result.data.negative_offset).toBe(10)
    expect(result.data.remaining_balance).toBe('0.00')
    expect(result.data.deferred_pending[0]?.billed_invoice?.issue_date).toBeNull()
    expect(result.data.deferred_pending[1]?.name).toBeNull()
    expect(result.data.deferred_pending[1]?.billed_invoice).toBeNull()
    expect(result.data.line_items[0]?.client_agreement_recurring_item_id).toBeNull()
    expect(result.data.line_items[0]?.time_entries[0]?.name).toBeNull()
    expect(result.data.line_items[0]?.time_entries[0]?.date_worked).toBeNull()
  })

  it('rejects compact invoice detail payloads with omitted canonical null fields', () => {
    const payload = makeInvoicePayload({
      due_date: undefined,
      notes: undefined,
      deferred_pending: [
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
          time_entries: [
            {
              minutes_worked: 15,
              is_deferred_billing: false,
            },
          ],
        },
      ],
    })

    const result = InvoiceSchema.safeParse(payload)

    expect(result.success).toBe(false)
  })

  it('accepts existing custom payment method labels with nullable metadata fields', () => {
    const payload = makeInvoicePayload({
      payments: [
        {
          client_invoice_payment_id: 1,
          client_invoice_id: 1,
          amount: '123.45',
          payment_date: '2024-01-15',
          payment_method: 'Wire Transfer',
          notes: null,
          created_at: null,
          updated_at: null,
        },
      ],
      remaining_balance: '0.00',
      payments_total: '123.45',
    })

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
    client_agreement_recurring_item_id: null,
    time_entries: [],
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
