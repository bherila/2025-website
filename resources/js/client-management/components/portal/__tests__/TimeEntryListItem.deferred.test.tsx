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

function deferredEntry(): any {
  return {
    id: 7,
    name: 'Scoping call',
    minutes_worked: 45,
    formatted_time: '0:45',
    date_worked: '2026-03-02',
    is_billable: true,
    is_invoiced: false,
    is_deferred_billing: true,
    job_type: 'Meeting',
    user: { id: 1, name: 'Alice' },
    project: { id: 1, name: 'ACME', slug: 'acme' },
    task: null,
    created_at: '2026-03-02 10:00:00',
  }
}

describe('TimeEntryListItem - deferred badge', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    jest.resetModules()
    _resetCache()
  })

  it('renders Deferred badge for admin viewers', () => {
    hydrateAdmin(true)
    render(
      <table>
        <tbody>
          <TimeEntryListItem entry={deferredEntry()} slug="acme" />
        </tbody>
      </table>,
    )
    expect(screen.getByText(/Deferred/)).toBeInTheDocument()
  })

  it('hides Deferred badge for non-admins', () => {
    hydrateAdmin(false)
    render(
      <table>
        <tbody>
          <TimeEntryListItem entry={deferredEntry()} slug="acme" />
        </tbody>
      </table>,
    )
    expect(screen.queryByText(/Deferred/)).not.toBeInTheDocument()
  })

  it('does not render Deferred badge for non-deferred entries', () => {
    hydrateAdmin(true)
    const entry = deferredEntry()
    entry.is_deferred_billing = false
    render(
      <table>
        <tbody>
          <TimeEntryListItem entry={entry} slug="acme" />
        </tbody>
      </table>,
    )
    expect(screen.queryByText(/Deferred/)).not.toBeInTheDocument()
  })
})
