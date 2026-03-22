import { useMemo } from 'react'

/**
 * Hook to access the portal-level hydrated data from the #client-portal-initial-data script tag.
 * This script tag is typically provided by the portal blade views.
 */
export function usePortalInitialData<T = any>() {
  return useMemo(() => {
    try {
      const script = document.getElementById('client-portal-initial-data') as HTMLScriptElement | null
      return script && script.textContent ? (JSON.parse(script.textContent) as T) : ({} as T)
    } catch (e) {
      console.error('Error parsing client-portal-initial-data', e)
      return {} as T
    }
  }, [])
}
