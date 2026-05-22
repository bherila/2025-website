import { AppInitialDataSchema, UserSchema } from '@/client-management/types/hydration-schemas'

export type PortalHydration = Record<string, any>

export function validateAppInitialData(): void {
  const appScript = document.getElementById('app-initial-data') as HTMLScriptElement | null
  const appRaw: any = appScript?.textContent ? JSON.parse(appScript.textContent) : null
  const appParsed = appRaw ? AppInitialDataSchema.safeParse(appRaw) : null

  if (appParsed && !appParsed.success) {
    console.error('Invalid app-initial-data payload - app-level hydration may be unsafe.', appParsed.error)
  }

  const appData = appParsed && appParsed.success ? appParsed.data : (appRaw || null)

  try {
    const parsedCurrentUser = UserSchema.nullable().safeParse(appData?.currentUser ?? null)

    if (!parsedCurrentUser.success) {
      console.error('Invalid hydrated currentUser payload - will fall back to API fetch.', parsedCurrentUser.error)
    }
  } catch {
    // Components will fall back to API fetches if app-level hydration is not usable.
  }
}

export function readPortalHydration(pageName: string): PortalHydration | null {
  const script = document.getElementById('client-portal-initial-data') as HTMLScriptElement | null
  const serverData: any = script?.textContent ? JSON.parse(script.textContent) : null

  if (!serverData) {
    console.error(`Missing server-hydrated payload for Client Portal ${pageName} - aborting mount.`)

    return null
  }

  return serverData
}
