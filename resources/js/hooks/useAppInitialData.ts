import { useMemo } from 'react'
import { AppInitialDataSchema, type AppInitialData } from '@/types/client-management/hydration-schemas'
import { resolveIsAdmin } from '@/lib/authUtils'

let cachedData: (AppInitialData & { isAdmin: boolean }) | null = null

/**
 * Hook to access the global app-level hydrated data from the #app-initial-data script tag.
 */
export function useAppInitialData() {
  return useMemo(() => {
    if (cachedData) return cachedData

    const appScript = document.getElementById('app-initial-data') as HTMLScriptElement | null
    const appRaw = appScript && appScript.textContent ? JSON.parse(appScript.textContent) : null
    const appParsed = appRaw ? AppInitialDataSchema.safeParse(appRaw) : null
    
    const data = appParsed && appParsed.success ? appParsed.data : (appRaw || {})
    const isAdmin = resolveIsAdmin(appRaw)
    
    cachedData = {
      ...data,
      isAdmin,
    } as AppInitialData & { isAdmin: boolean }
    
    return cachedData
  }, [])
}

/**
 * Reset the internal cache. Useful for testing.
 */
export function _resetCache() {
  cachedData = null
}

/**
 * Specialized hook to check if the current user is an administrator.
 */
export function useIsUserAdmin() {
  const { isAdmin } = useAppInitialData()
  return isAdmin
}

/**
 * Specialized hook to get the current authenticated user.
 */
export function useCurrentUser() {
  const { currentUser } = useAppInitialData()
  return currentUser
}

/**
 * Specialized hook to get the list of client companies the user has access to.
 */
export function useClientCompanies() {
  const { clientCompanies } = useAppInitialData()
  return clientCompanies || []
}
