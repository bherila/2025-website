import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { _resetCache } from '@/hooks/useAppInitialData'

import NewTimeEntryModal from '../NewTimeEntryModal'

function hydrateAdmin(): void {
  const app = document.createElement('script')
  app.id = 'app-initial-data'
  app.type = 'application/json'
  app.textContent = JSON.stringify({
    currentUser: { id: 1, name: 'Admin', email: 'a@example.com' },
    isAdmin: true,
  })
  document.body.appendChild(app)

  const portal = document.createElement('script')
  portal.id = 'client-portal-initial-data'
  portal.type = 'application/json'
  portal.textContent = JSON.stringify({
    companyUsers: [{ id: 1, name: 'Admin', email: 'a@example.com' }],
  })
  document.body.appendChild(portal)
}

function hydrateNonAdmin(): void {
  const app = document.createElement('script')
  app.id = 'app-initial-data'
  app.type = 'application/json'
  app.textContent = JSON.stringify({
    currentUser: { id: 2, name: 'User', email: 'u@example.com' },
    isAdmin: false,
  })
  document.body.appendChild(app)
}

describe('NewTimeEntryModal - Defer billing', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    jest.resetModules()
    _resetCache()
  })

  it('shows the "Defer billing" checkbox to admins', () => {
    hydrateAdmin()
    render(
      <NewTimeEntryModal
        open
        onOpenChange={() => {}}
        slug="acme"
        projects={[{ id: 1, name: 'Proj', slug: 'proj' } as any]}
        users={[]}
        onSuccess={() => {}}
      />,
    )
    expect(screen.getByLabelText(/Defer billing/i)).toBeInTheDocument()
  })

  it('hides the "Defer billing" checkbox for non-admins', () => {
    hydrateNonAdmin()
    render(
      <NewTimeEntryModal
        open
        onOpenChange={() => {}}
        slug="acme"
        projects={[{ id: 1, name: 'Proj', slug: 'proj' } as any]}
        users={[]}
        onSuccess={() => {}}
      />,
    )
    expect(screen.queryByLabelText(/Defer billing/i)).not.toBeInTheDocument()
  })

  it('disables + clears the Defer checkbox when "Billable" is turned off', () => {
    hydrateAdmin()
    render(
      <NewTimeEntryModal
        open
        onOpenChange={() => {}}
        slug="acme"
        projects={[{ id: 1, name: 'Proj', slug: 'proj' } as any]}
        users={[]}
        onSuccess={() => {}}
      />,
    )
    const defer = screen.getByLabelText(/Defer billing/i) as HTMLInputElement
    const billable = screen.getByLabelText('Billable') as HTMLInputElement

    fireEvent.click(defer)
    expect(defer.getAttribute('data-state')).toBe('checked')

    fireEvent.click(billable)
    // After unbilling, defer should be unchecked and disabled.
    expect(defer.getAttribute('data-state')).toBe('unchecked')
    expect(defer.hasAttribute('disabled') || defer.getAttribute('aria-disabled') === 'true').toBe(true)
  })

  it('sends is_deferred_billing=true in the POST body when checked', async () => {
    hydrateAdmin()
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({}) }))
    ;(window as any).fetch = fetchMock

    render(
      <NewTimeEntryModal
        open
        onOpenChange={() => {}}
        slug="acme"
        projects={[{ id: 1, name: 'Proj', slug: 'proj' } as any]}
        users={[]}
        onSuccess={() => {}}
      />,
    )

    // Fill minimal required fields: time + project
    fireEvent.change(screen.getByLabelText(/Enter time/i), { target: { value: '1:30' } })

    // Check defer billing
    fireEvent.click(screen.getByLabelText(/Defer billing/i))

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /Add Time Record/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const body = JSON.parse((fetchMock.mock.calls[0] as any[])[1].body as string)
    expect(body.is_deferred_billing).toBe(true)
    expect(body.is_billable).toBe(true)
  })

  it('sends is_deferred_billing=false when the entry is not billable', async () => {
    hydrateAdmin()
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({}) }))
    ;(window as any).fetch = fetchMock

    render(
      <NewTimeEntryModal
        open
        onOpenChange={() => {}}
        slug="acme"
        projects={[{ id: 1, name: 'Proj', slug: 'proj' } as any]}
        users={[]}
        onSuccess={() => {}}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Enter time/i), { target: { value: '1:30' } })
    // Toggle billable OFF (it starts checked)
    fireEvent.click(screen.getByLabelText('Billable'))
    fireEvent.click(screen.getByRole('button', { name: /Add Time Record/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const body = JSON.parse((fetchMock.mock.calls[0] as any[])[1].body as string)
    expect(body.is_billable).toBe(false)
    expect(body.is_deferred_billing).toBe(false)
  })
})
