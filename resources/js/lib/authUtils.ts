import { AppInitialDataSchema } from '@/types/client-management/hydration-schemas'

/**
 * Resolves whether the current user is an admin based on hydrated app data.
 * This function is designed to be robust and handle various ways the admin flag
 * might be represented in the server-provided JSON.
 */
export function resolveIsAdmin(appRaw: any): boolean {
  if (!appRaw) return false

  // 1. Try validated schema first
  const appParsed = AppInitialDataSchema.safeParse(appRaw)
  const appData = appParsed.success ? appParsed.data : null

  // 2. Resolve using various possible sources
  return (
    appData?.isAdmin === true || 
    appRaw?.isAdmin === true || 
    appRaw?.isAdmin === 'true' ||
    (appData?.currentUser?.user_role?.toLowerCase() === 'admin') ||
    (appRaw?.currentUser?.user_role?.toLowerCase() === 'admin') ||
    (appData?.currentUser?.user_role?.toLowerCase() === 'super-admin') ||
    (appRaw?.currentUser?.user_role?.toLowerCase() === 'super-admin')
  )
}
