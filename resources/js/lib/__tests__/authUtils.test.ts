import { resolveIsAdmin } from '../authUtils'

describe('authUtils: resolveIsAdmin', () => {
  it('returns true when isAdmin is true (boolean)', () => {
    expect(resolveIsAdmin({ isAdmin: true })).toBe(true)
  })

  it('returns true when isAdmin is "true" (string)', () => {
    expect(resolveIsAdmin({ isAdmin: 'true' })).toBe(true)
  })

  it('returns true when currentUser role is admin', () => {
    expect(resolveIsAdmin({ currentUser: { id: 1, name: 'Admin', email: 'a@e.c', user_role: 'admin' } })).toBe(true)
  })

  it('returns true when currentUser role is Admin (case insensitive)', () => {
    expect(resolveIsAdmin({ currentUser: { id: 1, name: 'Admin', email: 'a@e.c', user_role: 'Admin' } })).toBe(true)
  })

  it('returns true when currentUser role is super-admin', () => {
    expect(resolveIsAdmin({ currentUser: { id: 1, name: 'Admin', email: 'a@e.c', user_role: 'super-admin' } })).toBe(true)
  })

  it('returns false when isAdmin is false', () => {
    expect(resolveIsAdmin({ isAdmin: false })).toBe(false)
  })

  it('returns false when no admin info is present', () => {
    expect(resolveIsAdmin({ authenticated: true })).toBe(false)
  })

  it('returns false for null input', () => {
    expect(resolveIsAdmin(null)).toBe(false)
  })
})
