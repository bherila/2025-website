import { useCallback } from 'react'

import { type MillerDockPrefsSnapshot, useMillerDockPrefs,type UseMillerDockPrefsResult } from '@/components/ui/miller'

import type { FormId } from './formRegistry'

const STORAGE_KEY = 'taxPreviewPrefs'
const SCHEMA_VERSION = 1

interface PrefsV1 {
  version: 1
  pinnedForms: FormId[]
  recentForms: Record<string, FormId[]>
}

const EMPTY: PrefsV1 = { version: SCHEMA_VERSION, pinnedForms: [], recentForms: {} }

function readStoredPrefs(): PrefsV1 {
  if (typeof window === 'undefined') {
    return EMPTY
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return EMPTY
    }
    const parsed = JSON.parse(raw) as Partial<PrefsV1> | null
    if (!parsed || parsed.version !== SCHEMA_VERSION) {
      return EMPTY
    }
    return {
      version: SCHEMA_VERSION,
      pinnedForms: Array.isArray(parsed.pinnedForms) ? parsed.pinnedForms : [],
      recentForms:
        parsed.recentForms && typeof parsed.recentForms === 'object' && !Array.isArray(parsed.recentForms)
          ? (parsed.recentForms as Record<string, FormId[]>)
          : {},
    }
  } catch {
    return EMPTY
  }
}

function writeStoredPrefs(prefs: PrefsV1): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore quota/serialization errors - prefs are best-effort */
  }
}

export type UseTaxPreviewPrefsResult = UseMillerDockPrefsResult<FormId>

/**
 * localStorage-backed dock preferences. `recent` is per-year so a returning
 * user picks up where they left off without seeing prior-year forms; `pinned`
 * is global since favorites are durable preferences.
 */
export function useTaxPreviewPrefs(year: number): UseTaxPreviewPrefsResult {
  const yearKey = String(year)

  const readPrefs = useCallback((): MillerDockPrefsSnapshot<FormId> => {
    const stored = readStoredPrefs()

    return {
      pinned: stored.pinnedForms,
      recent: stored.recentForms[yearKey] ?? [],
    }
  }, [yearKey])

  const writePrefs = useCallback((nextPrefs: MillerDockPrefsSnapshot<FormId>): void => {
    const stored = readStoredPrefs()

    writeStoredPrefs({
      ...stored,
      pinnedForms: nextPrefs.pinned,
      recentForms: { ...stored.recentForms, [yearKey]: nextPrefs.recent },
    })
  }, [yearKey])

  return useMillerDockPrefs({ readPrefs, writePrefs })
}
