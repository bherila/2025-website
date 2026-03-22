import { act, render, screen } from '@testing-library/react'

import { getPagePathSuffix } from '@/components/client-management/portal/ClientPortalNav'
import { _resetCache } from '@/hooks/useAppInitialData'

describe('getPagePathSuffix', () => {
  it('returns empty string for home', () => {
    expect(getPagePathSuffix('home')).toBe('')
  })

  it('returns /time for time', () => {
    expect(getPagePathSuffix('time')).toBe('/time')
  })

  it('returns /expenses for expenses', () => {
    expect(getPagePathSuffix('expenses')).toBe('/expenses')
  })

  it('returns /invoices for invoices', () => {
    expect(getPagePathSuffix('invoices')).toBe('/invoices')
  })

  it('returns /invoices for invoice (strips ID, goes to list)', () => {
    expect(getPagePathSuffix('invoice')).toBe('/invoices')
  })

  it('returns empty string for project (company-specific)', () => {
    expect(getPagePathSuffix('project')).toBe('')
  })

  it('returns empty string for agreement (company-specific)', () => {
    expect(getPagePathSuffix('agreement')).toBe('')
  })
})

describe('ClientPortalNav renders without errors', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    const script = document.createElement('script')
    script.id = 'app-initial-data'
    script.type = 'application/json'
    script.textContent = JSON.stringify({
      isAdmin: false,
      clientCompanies: [
        { id: 1, company_name: 'Acme Corp', slug: 'acme' },
        { id: 2, company_name: 'Beta Ltd', slug: 'beta' },
      ],
    })
    document.body.appendChild(script)
    _resetCache()
    ;(window as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders company name as dropdown trigger', async () => {
    const ClientPortalNav = (await import('@/components/client-management/portal/ClientPortalNav')).default
    await act(async () => {
      render(
        <ClientPortalNav
          slug="acme"
          companyName="Acme Corp"
          currentPage="invoices"
          companyId={1}
        />
      )
    })

    // Company name should appear as a button (dropdown trigger)
    expect(screen.getByRole('button', { name: /Acme Corp/i })).toBeInTheDocument()
  })

  it('renders Invoices nav link for current company', async () => {
    const ClientPortalNav = (await import('@/components/client-management/portal/ClientPortalNav')).default
    await act(async () => {
      render(
        <ClientPortalNav
          slug="acme"
          companyName="Acme Corp"
          currentPage="invoices"
          companyId={1}
        />
      )
    })

    // Nav button links should go to the current company's pages (multiple Invoices may appear)
    const invoicesLinks = screen.getAllByRole('link', { name: /Invoices/i })
    expect(invoicesLinks.some(link => link.getAttribute('href') === '/client/portal/acme/invoices')).toBe(true)

    const timeLinks = screen.getAllByRole('link', { name: /Time Records/i })
    expect(timeLinks.some(link => link.getAttribute('href') === '/client/portal/acme/time')).toBe(true)
  })
})
