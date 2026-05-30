import '@testing-library/jest-dom'

import { render, screen } from '@testing-library/react'

import { _resetCache } from '@/hooks/useAppInitialData'

import TimeEntryListItem from '../TimeEntryListItem'

function hydrateAdmin(isAdmin: boolean): void {
  const app = document.createElement('script')
  app.id = 'app-initial-data'
  app.type = 'application/json'
  app.textContent = JSON.stringify({
    currentUser: { id: 1, name: 'Admin', email: 'a@example.com' },
    isAdmin,
  })
  document.body.appendChild(app)
}

function makeEntry(overrides: Record<string, unknown> = {}): any {
  return {
    id: 1,
    name: 'Design review',
    minutes_worked: 60,
    formatted_time: '1:00',
    date_worked: '2026-04-15',
    is_billable: true,
    is_invoiced: false,
    job_type: 'Design',
    user: { id: 2, name: 'Alice Smith' },
    project: { id: 10, name: 'Project Alpha', slug: 'alpha' },
    task: null,
    created_at: '2026-04-15 09:00:00',
    ...overrides,
  }
}

describe('TimeEntryListItem - invoice badge behavior', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    jest.resetModules()
    _resetCache()
    hydrateAdmin(false)
  })

  it('renders Upcoming badge (with singular /invoice/ href) for a draft client_invoice', () => {
    const entry = makeEntry({
      is_invoiced: false,
      client_invoice: {
        client_invoice_id: 42,
        invoice_number: 'INV-042',
        status: 'draft',
      },
    })

    render(
      <table>
        <tbody>
          <TimeEntryListItem entry={entry} slug="acme" />
        </tbody>
      </table>,
    )

    const upcomingBadge = screen.getByText('Upcoming')
    expect(upcomingBadge).toBeInTheDocument()
    const link = upcomingBadge.closest('a')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toBe('/client/portal/acme/invoice/42')
    expect(link?.getAttribute('href')).not.toContain('/invoices/')
  })

  it('renders Invoiced badge (with singular /invoice/ href) for a non-draft client_invoice', () => {
    const entry = makeEntry({
      is_invoiced: true,
      client_invoice: {
        client_invoice_id: 99,
        invoice_number: 'INV-099',
        status: 'issued',
      },
    })

    render(
      <table>
        <tbody>
          <TimeEntryListItem entry={entry} slug="acme" />
        </tbody>
      </table>,
    )

    const invoicedBadge = screen.getByText('Invoiced')
    expect(invoicedBadge).toBeInTheDocument()
    const link = invoicedBadge.closest('a')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toBe('/client/portal/acme/invoice/99')
    expect(link?.getAttribute('href')).not.toContain('/invoices/')
  })

  it('renders BillabilityBadge when entry has no client_invoice', () => {
    const entry = makeEntry({ is_billable: true, client_invoice: undefined })

    render(
      <table>
        <tbody>
          <TimeEntryListItem entry={entry} slug="acme" />
        </tbody>
      </table>,
    )

    expect(screen.getByText('BILLABLE')).toBeInTheDocument()
    expect(screen.queryByText('Upcoming')).not.toBeInTheDocument()
    expect(screen.queryByText('Invoiced')).not.toBeInTheDocument()
  })

  it('renders NON-BILLABLE badge for non-billable entries without invoice', () => {
    const entry = makeEntry({ is_billable: false, client_invoice: undefined })

    render(
      <table>
        <tbody>
          <TimeEntryListItem entry={entry} slug="acme" />
        </tbody>
      </table>,
    )

    expect(screen.getByText('NON-BILLABLE')).toBeInTheDocument()
  })
})
