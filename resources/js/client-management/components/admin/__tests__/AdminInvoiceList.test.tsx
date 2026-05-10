import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import AdminInvoiceList, { hasStripePaymentFailure } from '@/client-management/components/admin/AdminInvoiceList'
import { fetchWrapper } from '@/fetchWrapper'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    post: jest.fn(),
  },
}))

const mockGet = fetchWrapper.get as jest.Mock
const mockPost = fetchWrapper.post as jest.Mock

describe('AdminInvoiceList', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
  })

  it('renders cadence and interim badges', async () => {
    mockGet.mockResolvedValue([
      {
        id: 1,
        invoice_number: 'INV-1',
        period_start: '2026-01-01',
        period_end: '2026-03-31',
        cycle_start: '2026-01-01',
        cycle_end: '2026-03-31',
        invoice_total: '3000.00',
        status: 'draft',
        invoice_kind: 'cadence_period',
        hours_worked: '9.0',
        retainer_hours_included: '30.0',
      },
      {
        id: 2,
        invoice_number: 'INV-2',
        period_start: '2026-04-01',
        period_end: '2026-04-30',
        cycle_start: '2026-01-01',
        cycle_end: '2026-12-31',
        invoice_total: '500.00',
        status: 'issued',
        invoice_kind: 'interim_overage',
        hours_worked: '15.0',
        retainer_hours_included: '0.0',
      },
    ])

    render(<AdminInvoiceList companyId={1} />)

    expect(await screen.findByText('Cadence Period')).toBeInTheDocument()
    expect(screen.getByText('Interim Overage')).toBeInTheDocument()
  })

  it('shows cadence-aware generation counts', async () => {
    mockGet.mockResolvedValue([])
    mockPost.mockResolvedValue({
      results: {
        summary: {
          cadence_period_invoices_created: 1,
          interim_invoices_created: 2,
        },
      },
    })

    render(<AdminInvoiceList companyId={1} />)

    await screen.findByText('No invoices match these filters.')
    fireEvent.click(await screen.findByRole('button', { name: /generate drafts/i }))

    await waitFor(() => {
      expect(screen.getByText('Created 1 cadence-period draft, 2 interim-overage drafts.')).toBeInTheDocument()
    })
  })

  it('shows a quiet no-op generation message', async () => {
    mockGet.mockResolvedValue([])
    mockPost.mockResolvedValue({
      results: {
        summary: {
          cadence_period_invoices_created: 0,
          interim_invoices_created: 0,
        },
      },
    })

    render(<AdminInvoiceList companyId={1} />)

    await screen.findByText('No invoices match these filters.')
    fireEvent.click(await screen.findByRole('button', { name: /generate drafts/i }))

    await waitFor(() => {
      expect(screen.getByText('No new invoices to generate.')).toBeInTheDocument()
    })
  })

  it('surfaces Stripe payment failures and exposes the filter predicate', async () => {
    mockGet.mockResolvedValue([
      {
        id: 1,
        invoice_number: 'INV-FAILED',
        period_start: '2026-01-01',
        period_end: '2026-01-31',
        cycle_start: '2026-01-01',
        cycle_end: '2026-01-31',
        invoice_total: '500.00',
        status: 'issued',
        invoice_kind: 'cadence_period',
        hours_worked: '0.0',
        retainer_hours_included: '0.0',
        stripe_payment_status: 'failed',
        stripe_failure_reason: 'Card declined',
      },
      {
        id: 2,
        invoice_number: 'INV-OK',
        period_start: '2026-02-01',
        period_end: '2026-02-28',
        cycle_start: '2026-02-01',
        cycle_end: '2026-02-28',
        invoice_total: '500.00',
        status: 'issued',
        invoice_kind: 'cadence_period',
        hours_worked: '0.0',
        retainer_hours_included: '0.0',
        stripe_payment_status: null,
        stripe_failure_reason: null,
      },
    ])

    render(<AdminInvoiceList companyId={1} />)

    expect(await screen.findByText('Card declined')).toBeInTheDocument()
    expect(screen.getByText('Stripe Failure')).toBeInTheDocument()
    expect(hasStripePaymentFailure({ stripe_payment_status: 'failed', stripe_failure_reason: null })).toBe(true)
    expect(hasStripePaymentFailure({ stripe_payment_status: null, stripe_failure_reason: null })).toBe(false)
  })
})
