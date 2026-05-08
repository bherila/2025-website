import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import AdminInvoiceList from '@/client-management/components/admin/AdminInvoiceList'
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
})
