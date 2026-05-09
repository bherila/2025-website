import '@testing-library/jest-dom'

import { fireEvent, render, screen } from '@testing-library/react'

import ClientManagementIndexPage from '@/client-management/components/ClientManagementIndexPage'
import { fetchWrapper } from '@/fetchWrapper'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
  },
}))

jest.mock('@/client-management/components/InvitePeopleModal', () => ({
  __esModule: true,
  default: function InvitePeopleModalMock() {
    return null
  },
}))

const mockGet = fetchWrapper.get as jest.Mock

describe('ClientManagementIndexPage', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it('loads the company list through fetchWrapper', async () => {
    mockGet.mockResolvedValue([
      {
        id: 1,
        company_name: 'Acme Consulting',
        slug: 'acme-consulting',
        is_active: true,
        created_at: '2026-05-01 00:00:00',
        users: [],
        agreements: [],
        total_balance_due: 375,
        uninvoiced_hours: 1.5,
        uninvoiced_task_total: 250,
        lifetime_value: 800,
        unpaid_invoices: [],
        current_billing_cadence: 'quarterly',
        current_cycle_progress: 35,
        needs_attention: true,
      },
    ])

    render(<ClientManagementIndexPage />)

    expect(await screen.findByText('Acme Consulting')).toBeInTheDocument()
    expect(screen.getByText('Quarterly')).toBeInTheDocument()
    expect(screen.getByText('$375.00 balance due')).toBeInTheDocument()
    expect(screen.getByText('1.50 uninvoiced hours')).toBeInTheDocument()
    expect(mockGet).toHaveBeenCalledWith('/api/client/mgmt/companies')
  })

  it('filters companies by search and needs-attention chip', async () => {
    mockGet.mockResolvedValue([
      {
        id: 1,
        company_name: 'Acme Consulting',
        slug: 'acme-consulting',
        is_active: true,
        created_at: '2026-05-01 00:00:00',
        users: [],
        agreements: [],
        needs_attention: true,
      },
      {
        id: 2,
        company_name: 'Quiet Books',
        slug: 'quiet-books',
        is_active: true,
        created_at: '2026-05-01 00:00:00',
        users: [],
        agreements: [],
        needs_attention: false,
      },
    ])

    render(<ClientManagementIndexPage />)

    expect(await screen.findByText('Acme Consulting')).toBeInTheDocument()
    expect(screen.getByText('Quiet Books')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Needs attention' }))

    expect(screen.getByText('Acme Consulting')).toBeInTheDocument()
    expect(screen.queryByText('Quiet Books')).not.toBeInTheDocument()
  })

  it('shows a retryable error when companies fail to load', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

    mockGet
      .mockRejectedValueOnce(new Error('Internal Server Error'))
      .mockResolvedValueOnce([
        {
          id: 2,
          company_name: 'Recovered Co',
          slug: 'recovered-co',
          is_active: true,
          created_at: '2026-05-01 00:00:00',
          users: [],
          agreements: [],
        },
      ])

    render(<ClientManagementIndexPage />)

    expect(await screen.findByText('Unable to load companies')).toBeInTheDocument()
    expect(screen.getByText('Internal Server Error')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Recovered Co')).toBeInTheDocument()
    expect(mockGet).toHaveBeenCalledTimes(2)

    consoleError.mockRestore()
  })
})
