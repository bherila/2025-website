import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import ClientManagementIndexPage from '@/client-management/components/ClientManagementIndexPage'
import type { ClientCompany, CompanyListResponse, GlobalStats, ListMeta } from '@/client-management/types/common'
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

function makeCompany(overrides: Partial<ClientCompany> = {}): ClientCompany {
  return {
    id: 1,
    company_name: 'Acme Consulting',
    slug: 'acme-consulting',
    is_active: true,
    stripe_billing_enabled: true,
    created_at: '2026-05-01 00:00:00',
    users: [],
    agreements: [],
    current_billing_cadence: 'quarterly',
    current_cycle_progress: null,
    needs_attention: false,
    ...overrides,
  }
}

function makeResponse(
  data: ClientCompany[],
  metaOverrides: Partial<ListMeta> = {},
  statsOverrides: Partial<GlobalStats> = {},
): CompanyListResponse {
  return {
    data,
    meta: {
      current_page: 1,
      per_page: 25,
      last_page: 1,
      total: data.length,
      has_more: false,
      sort: 'name',
      status: 'active',
      search: '',
      needs_attention: false,
      stripe_disabled: false,
      ...metaOverrides,
    },
    stats: {
      active_clients: data.length,
      inactive_clients: 0,
      open_balance: 0,
      needs_attention: 0,
      stripe_disabled: 0,
      ...statsOverrides,
    },
  }
}

describe('ClientManagementIndexPage', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it('renders cards and KPI tiles from the response envelope', async () => {
    mockGet.mockResolvedValue(
      makeResponse([makeCompany()], {}, {
        active_clients: 7,
        open_balance: 999.5,
        needs_attention: 4,
        stripe_disabled: 2,
      }),
    )

    render(<ClientManagementIndexPage />)

    expect(await screen.findByText('Acme Consulting')).toBeInTheDocument()
    expect(screen.getByText('Quarterly')).toBeInTheDocument()
    // KPI tiles come from the global `stats`, not from summing the page.
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('$999.50')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()

    const initialUrl = mockGet.mock.calls[0][0] as string
    expect(initialUrl).toContain('/api/client/mgmt/companies?')
    expect(initialUrl).toContain('sort=name')
    expect(initialUrl).toContain('page=1')
  })

  it('requests the needs-attention filter from the server when toggled', async () => {
    mockGet.mockResolvedValue(makeResponse([makeCompany()]))

    render(<ClientManagementIndexPage />)
    await screen.findByText('Acme Consulting')

    fireEvent.click(screen.getByRole('button', { name: 'Needs attention' }))

    await waitFor(() => {
      const lastUrl = mockGet.mock.calls[mockGet.mock.calls.length - 1][0] as string
      expect(lastUrl).toContain('needs_attention=1')
    })
  })

  it('sorts by balance due when the Open balance tile is clicked', async () => {
    mockGet.mockResolvedValue(makeResponse([makeCompany()]))

    render(<ClientManagementIndexPage />)
    await screen.findByText('Acme Consulting')

    fireEvent.click(screen.getByRole('button', { name: /open balance/i }))

    await waitFor(() => {
      const lastUrl = mockGet.mock.calls[mockGet.mock.calls.length - 1][0] as string
      expect(lastUrl).toContain('sort=balance_due')
    })
  })

  it('appends the next page when Load more is clicked', async () => {
    mockGet
      .mockResolvedValueOnce(
        makeResponse([makeCompany({ id: 1, company_name: 'First Co', slug: 'first-co' })], {
          total: 2,
          last_page: 2,
          has_more: true,
        }),
      )
      .mockResolvedValueOnce(
        makeResponse([makeCompany({ id: 2, company_name: 'Second Co', slug: 'second-co' })], {
          current_page: 2,
          total: 2,
          last_page: 2,
          has_more: false,
        }),
      )

    render(<ClientManagementIndexPage />)
    expect(await screen.findByText('First Co')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    expect(await screen.findByText('Second Co')).toBeInTheDocument()
    // The first page stays rendered (appended, not replaced).
    expect(screen.getByText('First Co')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('debounces search into a server request', async () => {
    mockGet.mockResolvedValue(makeResponse([makeCompany()]))

    render(<ClientManagementIndexPage />)
    await screen.findByText('Acme Consulting')

    fireEvent.change(screen.getByLabelText('Search clients'), { target: { value: 'Beta' } })

    await waitFor(() => {
      const lastUrl = mockGet.mock.calls[mockGet.mock.calls.length - 1][0] as string
      expect(lastUrl).toContain('search=Beta')
    })
  })

  it('shows a retryable error when companies fail to load', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

    mockGet
      .mockRejectedValueOnce(new Error('Internal Server Error'))
      .mockResolvedValueOnce(makeResponse([makeCompany({ id: 2, company_name: 'Recovered Co', slug: 'recovered-co' })]))

    render(<ClientManagementIndexPage />)

    expect(await screen.findByText('Unable to load companies')).toBeInTheDocument()
    expect(screen.getByText('Internal Server Error')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Recovered Co')).toBeInTheDocument()

    consoleError.mockRestore()
  })
})
