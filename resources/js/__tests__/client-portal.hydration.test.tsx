import '@testing-library/jest-dom'

import { fireEvent, waitFor } from '@testing-library/react'

import { _resetCache } from '@/hooks/useAppInitialData'
import { makePortalFetchMock } from '@/test-utils/portalFetchMock'

// Tests the DOM-mounted client-portal entrypoint behavior (server payload validation)

describe('client-portal entrypoint hydration validation', () => {
  beforeEach(() => {
    jest.resetModules()
    _resetCache()
    document.body.innerHTML = ''
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    ;(console.error as jest.Mock).mockRestore()
  })

  it('falls back to API when hydrated projects payload is invalid', async () => {
    // prepare DOM mount point and invalid server payload
    const div = document.createElement('div')
    div.id = 'ClientPortalIndexPage'
    document.body.appendChild(div)

    const badPayload = {
      slug: 'acme',
      companyName: 'Acme',
      companyId: 1,
      isAdmin: false,
      // projects array is malformed (id should be number)
      projects: [{ id: 'not-a-number', name: 123 }],
      companyUsers: [{ id: 1, name: 'U', email: 'u@example.com' }],
      companyFiles: [],
      recentTimeEntries: [],
      agreements: [],
    }

    const script = document.createElement('script')
    script.id = 'client-portal-initial-data'
    script.type = 'application/json'
    script.textContent = JSON.stringify(badPayload)
    document.body.appendChild(script)

    const fetchMock = (window as any).fetch = makePortalFetchMock()

    // import the entrypoint (registers DOMContentLoaded listener)
    await import('@/client-portal')

    // trigger mount
    fireEvent(document, new Event('DOMContentLoaded'))

    // expect validation error logged
    await waitFor(() => expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Invalid hydrated projects payload'), expect.anything()))

    // the mount logged a validation error and still rendered the index page
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Invalid hydrated projects payload'), expect.anything())
    expect(document.body.textContent).toContain('Client Portal')
  })

  it('falls back to API when hydrated companyUsers payload is invalid', async () => {
    const div = document.createElement('div')
    div.id = 'ClientPortalTimePage'
    document.body.appendChild(div)

    const badPayload = {
      slug: 'acme',
      companyName: 'Acme',
      companyId: 1,
      isAdmin: false,
      // invalid companyUsers entry
      companyUsers: [{ id: 'x', name: null }],
      projects: [],
    }

    const script = document.createElement('script')
    script.id = 'client-portal-initial-data'
    script.type = 'application/json'
    script.textContent = JSON.stringify(badPayload)
    document.body.appendChild(script)

    const fetchMock = (window as any).fetch = makePortalFetchMock()

    await import('@/client-portal')
    fireEvent(document, new Event('DOMContentLoaded'))

    await waitFor(() => expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Invalid hydrated companyUsers for time page'), expect.anything()))

    // fetchCompanyUsers falls back to `/api/client/portal/${slug}` and should be called
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const calledCompanyFetch = (fetchMock.mock.calls as any[]).some(call => String(call[0]).includes('/api/client/portal/acme'))
    expect(calledCompanyFetch).toBe(true)
  })

  it('logs error for invalid hydrated currentUser and falls back to API', async () => {
    const div = document.createElement('div')
    div.id = 'ClientPortalTimePage'
    document.body.appendChild(div)

    const badPortalPayload = {
      slug: 'acme',
      companyName: 'Acme',
      companyId: 1,
      companyUsers: [],
      projects: [],
    }

    const portalScript = document.createElement('script')
    portalScript.id = 'client-portal-initial-data'
    portalScript.type = 'application/json'
    portalScript.textContent = JSON.stringify(badPortalPayload)
    document.body.appendChild(portalScript)

    // Put invalid currentUser into app-initial-data (app-level hydration)
    const badAppPayload = { currentUser: { id: 'not-a-number', name: null } }
    const appScript = document.createElement('script')
    appScript.id = 'app-initial-data'
    appScript.type = 'application/json'
    appScript.textContent = JSON.stringify(badAppPayload)
    document.body.appendChild(appScript)

    const fetchMock = (window as any).fetch = makePortalFetchMock()

    await import('@/client-portal')
    fireEvent(document, new Event('DOMContentLoaded'))

    await waitFor(() => expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Invalid hydrated currentUser payload'), expect.anything()))

    // NewTimeEntryModal will fall back to fetch('/api/user') because currentUser is invalid
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const calledUserFetch = (fetchMock.mock.calls as any[]).some(call => String(call[0]).includes('/api/user'))
    expect(calledUserFetch).toBe(true)
  })
})