/**
 * Reusable fetch mock for Client Portal unit tests.
 * Returns realistic shapes for the portal-related endpoints used in tests.
 */
export const makePortalFetchMock = () => {
  return jest.fn((input: any) => {
    const url = String(input || '')

    // Projects list used by ClientPortalNav
    if (url.includes('/api/client/portal/acme/projects')) {
      return Promise.resolve({ ok: true, text: async () => '[]', json: async () => [] } as any)
    }

    // Companies dropdown used by ClientPortalNav
    if (url.includes('/api/client/portal/companies')) {
      return Promise.resolve({ ok: true, text: async () => '[]', json: async () => [{ id: 1, company_name: 'Acme', slug: 'acme' }] } as any)
    }

    // Time entries page
    if (url.includes('/api/client/portal/acme/time-entries')) {
      return Promise.resolve({ ok: true, text: async () => '{}', json: async () => ({ entries: [], monthly_data: [], total_time: '0:00', billable_time: '0:00' }) } as any)
    }

    // Company root endpoint (company + users)
    if (url.includes('/api/client/portal/acme') && !url.includes('/projects') && !url.includes('/time-entries')) {
      return Promise.resolve({ ok: true, text: async () => '{}', json: async () => ({ id: 1, company_name: 'Acme', users: [] }) } as any)
    }

    // Invoices list
    if (url.includes('/api/client/portal/acme/invoices')) {
      return Promise.resolve({ ok: true, text: async () => '[]', json: async () => [] } as any)
    }

    // Project-specific endpoints used in a few tests
    if (url.includes('/projects/proj-1/tasks')) {
      return Promise.resolve({ ok: true, text: async () => '[]', json: async () => [] } as any)
    }
    if (url.includes('/projects/proj-1/files')) {
      return Promise.resolve({ ok: true, text: async () => '[]', json: async () => [] } as any)
    }

    // Current user (NewTimeEntryModal)
    if (url.includes('/api/user')) {
      return Promise.resolve({ ok: true, json: async () => ({ id: 1, name: 'Test User', email: 'u@example.com' }) } as any)
    }

    // default fallback (safe minimal shape)
    return Promise.resolve({ ok: true, text: async () => '{}', json: async () => ({}) } as any)
  })
}

export const setWindowPortalFetchMock = () => {
  const m = makePortalFetchMock()
  ;(window as any).fetch = m
  return m
}
