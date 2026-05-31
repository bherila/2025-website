import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import ClientManagementShowPage from '@/client-management/components/ClientManagementShowPage'
import type { ClientCompany } from '@/client-management/types/common'
import { fetchWrapper } from '@/fetchWrapper'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    postRaw: jest.fn(),
  },
}))

jest.mock('@/client-management/components/InvitePeopleModal', () => ({
  __esModule: true,
  default: function InvitePeopleModalMock() {
    return null
  },
}))

jest.mock('@/client-management/components/portal/ClientPortalNav', () => ({
  __esModule: true,
  default: function ClientPortalNavMock({ companyName }: { companyName: string }) {
    return <nav>{companyName}</nav>
  },
}))

const mockGet = fetchWrapper.get as jest.Mock
const mockPut = fetchWrapper.put as jest.Mock

function createCompany(overrides: Partial<ClientCompany> = {}): ClientCompany {
  return {
    id: 1,
    company_name: 'Acme Consulting',
    slug: 'acme-consulting',
    address: '123 Main St',
    website: 'https://example.com',
    phone_number: '555-0100',
    default_hourly_rate: '125.00',
    additional_notes: 'Initial notes',
    is_active: true,
    stripe_billing_enabled: true,
    last_activity: '2026-05-01 00:00:00',
    created_at: '2026-05-01 00:00:00',
    users: [
      {
        id: 10,
        name: 'Client User',
        email: 'client@example.com',
      },
    ],
    agreements: [
      {
        id: 20,
        active_date: '2026-05-01 00:00:00',
        termination_date: null,
        client_company_signed_date: null,
        is_visible_to_client: true,
        monthly_retainer_hours: '10.00',
        monthly_retainer_fee: '1000.00',
      },
    ],
    ...overrides,
  }
}

describe('ClientManagementShowPage', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPut.mockReset()
  })

  it('saves company details through the edit dialog and renders the active agreement', async () => {
    mockGet.mockResolvedValue(createCompany())
    mockPut.mockResolvedValue({
      company: createCompany({
        company_name: 'Renamed Consulting',
        slug: 'renamed-consulting',
        additional_notes: 'Updated notes',
      }),
    })

    render(<ClientManagementShowPage companyId={1} />)

    // The overview shows the active agreement via the shared AgreementCard ("at" wording).
    expect(await screen.findByText('10.00 hrs/mo at $1000.00/mo')).toBeInTheDocument()

    // The edit form lives in a dialog now.
    fireEvent.click(screen.getByRole('button', { name: /Edit company/i }))

    fireEvent.change(await screen.findByLabelText('Company Name *'), {
      target: { value: 'Renamed Consulting' },
    })
    fireEvent.change(screen.getByLabelText('Additional Notes'), {
      target: { value: 'Updated notes' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable Stripe invoice payments' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith(
        '/api/client/mgmt/companies/1',
        expect.objectContaining({
          company_name: 'Renamed Consulting',
          additional_notes: 'Updated notes',
          stripe_billing_enabled: false,
        })
      )
    })

    expect(await screen.findByText('Company updated successfully')).toBeInTheDocument()
    // After save the dialog closes and the profile summary reflects the new name.
    expect((await screen.findAllByText('Renamed Consulting')).length).toBeGreaterThan(0)
  })

  it('shows the save error returned by fetchWrapper', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

    mockGet.mockResolvedValue(createCompany())
    mockPut.mockRejectedValueOnce('Internal Server Error')

    render(<ClientManagementShowPage companyId={1} />)

    fireEvent.click(await screen.findByRole('button', { name: /Edit company/i }))

    fireEvent.change(await screen.findByLabelText('Company Name *'), {
      target: { value: 'Renamed Consulting' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(await screen.findByText('Internal Server Error')).toBeInTheDocument()

    consoleError.mockRestore()
  })
})
