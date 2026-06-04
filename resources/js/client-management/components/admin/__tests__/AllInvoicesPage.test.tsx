import '@testing-library/jest-dom'

import { render, screen, waitFor } from '@testing-library/react'

import type { AdminInvoice } from '@/client-management/components/admin/AdminInvoiceList'
import AllInvoicesPage from '@/client-management/components/admin/AllInvoicesPage'
import { fetchWrapper } from '@/fetchWrapper'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    post: jest.fn(),
  },
}))

const mockGet = fetchWrapper.get as jest.Mock

const invoices: AdminInvoice[] = [
  {
    id: 1,
    invoice_number: 'INV-ALPHA-1',
    period_start: '2026-01-01',
    period_end: '2026-01-31',
    cycle_start: '2026-01-01',
    cycle_end: '2026-01-31',
    invoice_total: '1500.00',
    status: 'issued',
    invoice_kind: 'cadence_period',
    hours_worked: '10.0',
    retainer_hours_included: '20.0',
    company_id: 7,
    company_name: 'Alpha Co',
  },
  {
    id: 2,
    invoice_number: 'INV-BETA-1',
    period_start: '2026-02-01',
    period_end: '2026-02-28',
    cycle_start: '2026-02-01',
    cycle_end: '2026-02-28',
    invoice_total: '900.00',
    status: 'paid',
    invoice_kind: 'cadence_period',
    hours_worked: '5.0',
    retainer_hours_included: '20.0',
    company_id: 9,
    company_name: 'Beta Co',
  },
]

describe('AllInvoicesPage', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue(invoices)
  })

  it('renders the heading and invoices from both companies', async () => {
    render(<AllInvoicesPage />)

    expect(screen.getByText('All Invoices')).toBeInTheDocument()

    expect(await screen.findByText('Alpha Co')).toBeInTheDocument()
    expect(screen.getByText('Beta Co')).toBeInTheDocument()
    expect(screen.getByText('INV-ALPHA-1')).toBeInTheDocument()
    expect(screen.getByText('INV-BETA-1')).toBeInTheDocument()
  })

  it('loads invoices from the cross-company index endpoint', async () => {
    render(<AllInvoicesPage />)

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/client/mgmt/invoices')
    })
  })
})
