import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import InvoicePayPanel from '@/client-management/components/portal/InvoicePayPanel'
import type { Invoice } from '@/client-management/types'
import { fetchWrapper } from '@/fetchWrapper'

jest.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: ReactNode }) => <>{children}</>,
  PaymentElement: () => <div>Payment element</div>,
  useElements: () => null,
  useStripe: () => null,
}))

jest.mock('@stripe/stripe-js', () => ({
  loadStripe: jest.fn(() => Promise.resolve(null)),
}))

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    post: jest.fn(),
  },
}))

const mockGet = fetchWrapper.get as jest.Mock

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
  beforeEach(() => {
    mockGet.mockReset()
    window.history.replaceState({}, '', '/client/portal/acme/invoice/10')
  })

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
    expect(screen.getByText('Manual Payment Required').closest('[data-slot="card"]')).toHaveClass('print:hidden')
    expect(screen.queryByText('Pay This Invoice')).not.toBeInTheDocument()
  })

  it('hides the online payment panel when printing', async () => {
    mockGet.mockResolvedValue({ payment_methods: [] })

    render(
      <InvoicePayPanel
        invoice={makeInvoice({ invoice_total: '500.00', remaining_balance: '500.00' })}
        companyId={20}
        stripePublishableKey="pk_test_local"
        stripeMaxAmountCents={100000}
        onPaymentUpdated={() => undefined}
      />
    )

    expect(await screen.findByText('Pay This Invoice')).toBeInTheDocument()
    expect(screen.getByText('Pay This Invoice').closest('[data-slot="card"]')).toHaveClass('print:hidden')
  })

  it('defaults saving a new payment method to explicit opt-in', async () => {
    mockGet.mockResolvedValue({ payment_methods: [] })

    render(
      <InvoicePayPanel
        invoice={makeInvoice({ invoice_total: '500.00', remaining_balance: '500.00' })}
        companyId={20}
        stripePublishableKey="pk_test_local"
        stripeMaxAmountCents={100000}
        onPaymentUpdated={() => undefined}
      />
    )

    const checkbox = await screen.findByRole('checkbox', { name: /save this method/i })
    expect(checkbox).not.toBeChecked()
  })

  it('renders saved payment method radios when methods load', async () => {
    mockGet.mockResolvedValue({
      payment_methods: [
        {
          id: 7,
          type: 'card',
          brand: 'visa',
          last4: '4242',
          exp_month: 12,
          exp_year: 2031,
          bank_name: null,
          is_default: true,
          created_at: '2026-05-01T00:00:00Z',
        },
      ],
    })

    render(
      <InvoicePayPanel
        invoice={makeInvoice({ invoice_total: '500.00', remaining_balance: '500.00' })}
        companyId={20}
        stripePublishableKey="pk_test_local"
        stripeMaxAmountCents={100000}
        onPaymentUpdated={() => undefined}
      />
    )

    expect(await screen.findByText('VISA ending in 4242')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /visa ending in 4242/i })).toBeChecked()
  })

  it('polls a returned Stripe payment intent and clears redirect query params', async () => {
    const onPaymentUpdated = jest.fn()
    window.history.replaceState({}, '', '/client/portal/acme/invoice/10?payment_intent=pi_return&redirect_status=succeeded')
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/payment-methods')) {
        return Promise.resolve({ payment_methods: [] })
      }

      return Promise.resolve({
        payment: {
          id: 1,
          stripe_payment_intent_id: 'pi_return',
          status: 'processing',
          failure_reason: null,
        },
        invoice: null,
      })
    })

    render(
      <InvoicePayPanel
        invoice={makeInvoice({ invoice_total: '500.00', remaining_balance: '500.00' })}
        companyId={20}
        stripePublishableKey="pk_test_local"
        stripeMaxAmountCents={100000}
        onPaymentUpdated={onPaymentUpdated}
      />
    )

    await waitFor(() => expect(onPaymentUpdated).toHaveBeenCalled())
    expect(window.location.search).not.toContain('payment_intent')
    expect(await screen.findByText('Payment is processing.')).toBeInTheDocument()
  })
})
