import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

describe('PhrNavbar', () => {
  beforeEach(() => {
    ;(window as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/phr/patients')) {
        const payload = {
          patients: [
            {
              id: 1,
              owner_user_id: 1,
              display_name: 'Alice',
              relationship: 'self',
              birth_date: null,
              sex_at_birth: null,
              notes: null,
              archived_at: null,
              created_at: null,
              updated_at: null,
              access_level: 'owner',
              can_manage: true,
              can_share: true,
              access_grants: [],
            },
            {
              id: 2,
              owner_user_id: 2,
              display_name: 'Bob',
              relationship: 'spouse',
              birth_date: null,
              sex_at_birth: null,
              notes: null,
              archived_at: null,
              created_at: null,
              updated_at: null,
              access_level: 'viewer',
              can_manage: false,
              can_share: false,
              access_grants: [],
            },
          ],
        }

        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify(payload),
        })
      }

      return Promise.resolve({ ok: true, text: async () => '{}' })
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('renders PHR branding and section links', async () => {
    const PhrNavbar = (await import('@/components/phr/PhrNavbar')).default

    await act(async () => {
      render(<PhrNavbar activeSection="patients" />)
    })

    expect(screen.getByLabelText('PHR section')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Patients' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Manage Patients' })).toBeInTheDocument()
  })

  it('loads patient combobox and renders patient tab links', async () => {
    const PhrNavbar = (await import('@/components/phr/PhrNavbar')).default

    await act(async () => {
      render(<PhrNavbar patientId={1} activeTab="labs" />)
    })

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })

    const labsLink = screen.getByRole('link', { name: 'Labs' })
    expect(labsLink).toHaveAttribute('href', '/phr/patient/1/labs')
    expect(labsLink).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Imaging' })).toHaveAttribute('href', '/phr/patient/1/imaging')
  })

  it('tab click points navigation to patient tab URL', async () => {
    const PhrNavbar = (await import('@/components/phr/PhrNavbar')).default

    await act(async () => {
      render(<PhrNavbar patientId={1} activeTab="summary" />)
    })

    const tabsLink = screen.getByRole('link', { name: 'Vitals' })
    fireEvent.click(tabsLink)
    expect(tabsLink).toHaveAttribute('href', '/phr/patient/1/vitals')
  })
})
