import { render, screen } from '@testing-library/react'

import InvoicePayPanel from '@/client-management/components/portal/InvoicePayPanel'
import type { Invoice } from '@/client-management/types'

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    client_invoice_id: 10,
    client_company_id: 20,
    invoice_number: 'INV-10',
    invoice_total: '1000.01',
    issue_date: '2026-05-01',
    due_date: '2026-05-15',
    paid_date: null,
    status: 'issued',
    period_start: '2026-04-01',
    period_end: '2026-04-30',
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
    stripe_payments: [],
    remaining_balance: '1000.01',
    payments_total: '0.00',
    ...overrides,
  }
}

describe('InvoicePayPanel', () => {
  it('shows manual-only state for invoices over the Stripe cap', () => {
    render(
      <InvoicePayPanel
        invoice={makeInvoice()}
        companyId={20}
        stripePublishableKey="pk_test_local"
        stripeMaxAmountCents={100000}
        onPaymentUpdated={() => undefined}
      />
    )

    expect(screen.getByText('Manual Payment Required')).toBeInTheDocument()
    expect(screen.queryByText('Pay This Invoice')).not.toBeInTheDocument()
  })
})
