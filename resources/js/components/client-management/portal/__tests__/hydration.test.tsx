import { render, screen, act, waitFor } from '@testing-library/react'
import ClientPortalInvoicePage from '@/components/client-management/portal/ClientPortalInvoicePage'
import ClientPortalProjectPage from '@/components/client-management/portal/ClientPortalProjectPage'
import ClientPortalIndexPage from '@/components/client-management/portal/ClientPortalIndexPage'
import ClientPortalTimePage from '@/components/client-management/portal/ClientPortalTimePage'
import ClientPortalAgreementPage from '@/components/client-management/portal/ClientPortalAgreementPage'
import ClientPortalInvoicesPage from '@/components/client-management/portal/ClientPortalInvoicesPage'
import * as fetchWrapper from '@/fetchWrapper'
import { makePortalFetchMock } from '@/test-utils/portalFetchMock'

describe('Client-portal hydration', () => {


  beforeEach(() => {
    jest.clearAllMocks()
    ;(window as any).fetch = makePortalFetchMock()
  })

  it('ClientPortalInvoicePage uses initialInvoice and does not call fetch on mount', async () => {
    const fetchMock = (window as any).fetch

    const mockInvoice = {
      client_invoice_id: 1,
      client_company_id: 2,
      invoice_number: 'TEST-001',
      invoice_total: '100.00',
      issue_date: null,
      due_date: null,
      paid_date: null,
      status: 'issued',
      period_start: '2024-01-01',
      period_end: '2024-01-31',
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
      remaining_balance: '100.00',
      payments_total: '0.00'
    }

    await act(async () => {
      render(
        <ClientPortalInvoicePage
          slug="acme"
          companyName="Acme"
          companyId={1}
          invoiceId={1}
          isAdmin={false}
          initialInvoice={mockInvoice as any}
        />
      )
    })

    // Renders synchronously from hydrated prop (use heading to avoid duplicate-text matches)
    expect(screen.getByRole('heading', { name: /Invoice TEST-001/ })).toBeInTheDocument()
    // ensure no invoice-specific network request was made
    expect((window as any).fetch).not.toHaveBeenCalledWith(expect.stringContaining('/api/client/portal/acme/invoices/1'))
  })

  it('ClientPortalProjectPage uses hydrated props and does not fetch tasks/users/files on mount', async () => {
    const fetchMock = (window as any).fetch

    await act(async () => {
      render(
        <ClientPortalProjectPage
          slug="acme"
          companyName="Acme"
          companyId={1}
          projectSlug="proj-1"
          projectName="Proj 1"
          isAdmin={false}
          initialTasks={[{ id: 1, project_id: 1, name: 'Task 1', description: null, completed_at: null, due_date: null, assignee: null, creator: null, is_high_priority: false, is_hidden_from_clients: false, created_at: new Date().toISOString() }]}
          initialCompanyUsers={[{ id: 1, name: 'User', email: 'u@example.com' }]}
          initialProjectFiles={[{ id: 1, original_filename: 'f.txt', human_file_size: '1 KB', created_at: new Date().toISOString(), download_count: 0 } as any]}
        />
      )
    })

    // Component renders from hydrated props (use heading to avoid duplicate-text matches)
    expect(screen.getByRole('heading', { name: /Proj 1/ })).toBeInTheDocument()

    // Ensure project-specific endpoints were NOT requested by this component
    await waitFor(() => {
      const calledAgreementOrTasks = (fetchMock.mock.calls as any[]).some(call => {
        const url = String(call[0] || '')
        // disallow project-specific endpoints; allow ClientPortalNav's projects list (/api/client/portal/acme/projects)
        return url.includes('/projects/proj-1/tasks') || (url.includes('/api/client/portal/acme') && !url.includes('/projects')) || url.includes('/projects/proj-1/files')
      })
      expect(calledAgreementOrTasks).toBe(false)
    })
  })

  it('ClientPortalIndexPage uses hydrated props and skips initial fetches', async () => {
    const fetchMock = (window as any).fetch

    await act(async () => {
      render(
        <ClientPortalIndexPage
          slug="acme"
          companyName="Acme"
          companyId={1}
          isAdmin={false}
          initialProjects={[{ id: 1, name: 'P', slug: 'p' } as any]}
          initialAgreements={[]}
          initialCompanyUsers={[{ id: 1, name: 'U', email: 'u@example.com' } as any]}
          initialRecentTimeEntries={[]}
          initialCompanyFiles={[{ id: 1, original_filename: 'f.txt', human_file_size: '1 KB', created_at: new Date().toISOString(), download_count: 0 } as any]}
        />
      )
    })

    // wait for background fetches (ClientPortalNav, etc.) to settle
    await waitFor(() => expect((window as any).fetch).toHaveBeenCalled())

    expect(screen.getByText(/Client Portal/)).toBeInTheDocument()
    // ensure no portal *list* endpoints (projects/files) were requested
    await waitFor(() => {
      const calledPortalListEndpoints = (fetchMock.mock.calls as any[]).some(call => {
        const url = String(call[0] || '')
        return url.includes('/projects') || url.includes('/files') || url.includes('/agreements')
      })
      expect(calledPortalListEndpoints).toBe(false)
    })
  })

  it('ClientPortalTimePage uses hydrated props and skips initial fetches', async () => {
    const fetchMock = (window as any).fetch

    await act(async () => {
      render(
        <ClientPortalTimePage
          slug="acme"
          companyName="Acme"
          companyId={1}
          isAdmin={false}
          initialCompanyUsers={[{ id: 1, name: 'U', email: 'u@example.com' } as any]}
          initialProjects={[{ id: 1, name: 'P', slug: 'p' } as any]}
        />
      )
    })

    // wait for background fetches (ClientPortalNav, etc.) to settle
    await waitFor(() => expect((window as any).fetch).toHaveBeenCalled())

    // nav contains "Time Records" and page renders without calling project/user APIs
    expect(screen.getAllByText(/Time Records/)[0]).toBeInTheDocument()
    await waitFor(() => {
      const calledPortalEndpoints_time = (fetchMock.mock.calls as any[]).some(call => {
        const url = String(call[0] || '')
        // disallow projects list or company endpoint (but allow time-entries)
        return url.includes('/api/client/portal/acme/projects') || (url.includes('/api/client/portal/acme') && !url.includes('/time-entries'))
      })
      expect(calledPortalEndpoints_time).toBe(false)
    })
  })

  it('ClientPortalAgreementPage uses hydrated agreement and files and does not fetch on mount', async () => {
    const fetchMock = (window as any).fetch

    await act(async () => {
      render(
        <ClientPortalAgreementPage
          slug="acme"
          companyName="Acme"
          companyId={1}
          agreementId={1}
          isAdmin={false}
          initialAgreement={{ id: 1, monthly_retainer_hours: '10', agreement_text: null, active_date: '2024-01-01', client_company_signed_date: null, catch_up_threshold_hours: '1', rollover_months: 0, hourly_rate: '100', monthly_retainer_fee: '0' } as any}
          initialInvoices={[]}
          initialAgreementFiles={[{ id: 1, original_filename: 'a.pdf', human_file_size: '1 KB', created_at: new Date().toISOString(), download_count: 0 } as any]}
        />
      )
    })

    // wait for background fetches (ClientPortalNav, etc.) to settle
    await waitFor(() => expect((window as any).fetch).toHaveBeenCalled())

    expect(screen.getByText(/Service Agreement/)).toBeInTheDocument()
    await waitFor(() => {
      const calledAgreementEndpoints = (fetchMock.mock.calls as any[]).some(call => {
        const url = String(call[0] || '')
        return url.includes(`/api/client/portal/acme/agreements/${1}`) || url.includes(`/api/client/portal/acme/agreements`) || url.includes(`/api/client/portal/acme/agreements/${1}/files`) || url.includes(`/api/client/portal/acme/invoices`)
      })
      expect(calledAgreementEndpoints).toBe(false)
    })
  })

  it('ClientPortalInvoicesPage uses hydrated invoices and does not fetch on mount', async () => {
    const fetchMock = (window as any).fetch

    await act(async () => {
      render(
        <ClientPortalInvoicesPage
          slug="acme"
          companyName="Acme"
          companyId={1}
          isAdmin={false}
          initialInvoices={[{ client_invoice_id: 1, invoice_number: 'INV-1', invoice_total: '10.00', period_start: '2024-01-01', period_end: '2024-01-31', status: 'issued', client_company_id: 1, line_items: [], payments: [], remaining_balance: '10.00', payments_total: '0.00', retainer_hours_included: '0', hours_worked: '0' } as any]}
        />
      )
    })

    // wait for background fetches (ClientPortalNav, etc.) to settle
    await waitFor(() => expect((window as any).fetch).toHaveBeenCalled())

    // ensure the main heading is present and no invoices-related API was requested
    expect(screen.getByRole('heading', { name: /Invoices/ })).toBeInTheDocument()
    await waitFor(() => expect((fetchMock.mock.calls as any[]).some(call => String(call[0]).includes('/api/client/portal/acme/invoices'))).toBe(false))
  })
})
