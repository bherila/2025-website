import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import InactiveCompaniesSection from '@/client-management/components/admin/InactiveCompaniesSection'
import type { ClientCompany, CompanyListResponse, ListMeta } from '@/client-management/types/common'
import { fetchWrapper } from '@/fetchWrapper'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
  },
}))

const mockGet = fetchWrapper.get as jest.Mock

function makeCompany(overrides: Partial<ClientCompany> = {}): ClientCompany {
  return {
    id: 1,
    company_name: 'Dormant Co',
    slug: 'dormant-co',
    is_active: false,
    stripe_billing_enabled: false,
    created_at: '2026-01-01 00:00:00',
    users: [],
    agreements: [],
    current_billing_cadence: 'monthly',
    current_cycle_progress: null,
    needs_attention: false,
    ...overrides,
  }
}

function makeResponse(data: ClientCompany[], metaOverrides: Partial<ListMeta> = {}): CompanyListResponse {
  return {
    data,
    meta: {
      current_page: 1,
      per_page: 50,
      last_page: 1,
      total: data.length,
      has_more: false,
      sort: 'name',
      status: 'inactive',
      search: '',
      needs_attention: false,
      stripe_disabled: false,
      ...metaOverrides,
    },
    stats: {
      active_clients: 0,
      inactive_clients: data.length,
      open_balance: 0,
      needs_attention: 0,
      stripe_disabled: 0,
    },
  }
}

describe('InactiveCompaniesSection', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it('renders nothing when there are no inactive companies', () => {
    const { container } = render(<InactiveCompaniesSection count={0} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lazily fetches the first page only when expanded', async () => {
    mockGet.mockResolvedValue(makeResponse([makeCompany()]))

    render(<InactiveCompaniesSection count={1} />)
    expect(mockGet).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Inactive Companies/ }))

    expect(await screen.findByText('Dormant Co')).toBeInTheDocument()
    expect(mockGet).toHaveBeenCalledWith(
      '/api/client/mgmt/companies?status=inactive&per_page=50&sort=name&page=1',
    )
  })

  it('pages through additional inactive companies via Load more', async () => {
    mockGet.mockResolvedValueOnce(
      makeResponse([makeCompany({ id: 1, company_name: 'Alpha Co' })], {
        current_page: 1,
        has_more: true,
        total: 51,
      }),
    )

    render(<InactiveCompaniesSection count={51} />)
    fireEvent.click(screen.getByRole('button', { name: /Inactive Companies/ }))

    expect(await screen.findByText('Alpha Co')).toBeInTheDocument()

    mockGet.mockResolvedValueOnce(
      makeResponse([makeCompany({ id: 2, company_name: 'Beta Co' })], {
        current_page: 2,
        has_more: false,
        total: 51,
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: /Load more/ }))

    expect(await screen.findByText('Beta Co')).toBeInTheDocument()
    // First page row remains rendered (results are appended, not replaced).
    expect(screen.getByText('Alpha Co')).toBeInTheDocument()
    expect(mockGet).toHaveBeenLastCalledWith(
      '/api/client/mgmt/companies?status=inactive&per_page=50&sort=name&page=2',
    )

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument()
    })
  })

  it('does not render Load more when the first page is the last', async () => {
    mockGet.mockResolvedValue(makeResponse([makeCompany()], { has_more: false }))

    render(<InactiveCompaniesSection count={1} />)
    fireEvent.click(screen.getByRole('button', { name: /Inactive Companies/ }))

    expect(await screen.findByText('Dormant Co')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument()
  })
})
