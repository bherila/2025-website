import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import NewTimeEntryModal from '../NewTimeEntryModal'
import { _resetCache } from '@/hooks/useAppInitialData'

describe('NewTimeEntryModal - currentUser hydration', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    jest.resetModules()
    _resetCache()
    // ensure no lingering app-level script
    const existing = document.getElementById('app-initial-data')
    if (existing) existing.remove()
  })

  it('uses server-hydrated currentUser when available and does not call /api/user', async () => {
    // app-level currentUser (app-initial-data)
    const appScript = document.createElement('script')
    appScript.id = 'app-initial-data'
    appScript.type = 'application/json'
    appScript.textContent = JSON.stringify({ currentUser: { id: 42, name: 'Hydrated User', email: 'h@example.com' } })
    document.body.appendChild(appScript)

    // portal-level companyUsers (client-portal-initial-data)
    const portalScript = document.createElement('script')
    portalScript.id = 'client-portal-initial-data'
    portalScript.type = 'application/json'
    portalScript.textContent = JSON.stringify({ companyUsers: [{ id: 42, name: 'Hydrated User', email: 'h@example.com' }] })
    document.body.appendChild(portalScript)

    const fetchMock = jest.fn()
    ;(window as any).fetch = fetchMock

    render(
      <NewTimeEntryModal
        open={true}
        onOpenChange={() => {}}
        slug="acme"
        projects={[]}
        users={[]}
        onSuccess={() => {}}
      />
    )

    // Give React time to run effects
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled())

    // The user select should default to the hydrated user's id (component sets userId from currentUser)
    const userSelect = screen.getByLabelText('User') as HTMLSelectElement
    expect(userSelect).toBeInTheDocument()
    // option for hydrated user should be present
    expect(userSelect.querySelector('option[value="42"]')).toBeInTheDocument()
  })

  it('fetches /api/user when no hydrated currentUser exists', async () => {
    // no app-level currentUser provided

    const fetchMock = jest.fn((input: any) => {
      if (String(input).includes('/api/user')) {
        return Promise.resolve({ ok: true, json: async () => ({ id: 1, name: 'Fetched User', email: 'f@example.com' }) } as any)
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as any)
    })
    ;(window as any).fetch = fetchMock

    render(
      <NewTimeEntryModal
        open={true}
        onOpenChange={() => {}}
        slug="acme"
        projects={[]}
        users={[{ id: 1, name: 'Fetched User', email: 'f@example.com' }]}
        onSuccess={() => {}}
      />
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const calledUserFetch = (fetchMock.mock.calls as any[]).some(call => String(call[0]).includes('/api/user'))
    expect(calledUserFetch).toBe(true)
  })
})