import { useCallback, useEffect, useState } from 'react'

import type { FormId } from './formRegistry'

const STORAGE_KEY = 'taxPreviewPrefs'
const RECENT_CAP = 5
const SCHEMA_VERSION = 1

interface PrefsV1 {
  version: 1
  pinnedForms: FormId[]
  recentForms: Record<string, FormId[]>
}

const EMPTY: PrefsV1 = { version: SCHEMA_VERSION, pinnedForms: [], recentForms: {} }

function readPrefs(): PrefsV1 {
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

function writePrefs(prefs: PrefsV1): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore quota/serialization errors — prefs are best-effort */
  }
}

export interface UseTaxPreviewPrefsResult {
  recent: FormId[]
  pinned: FormId[]
  addRecent: (id: FormId) => void
  togglePin: (id: FormId) => void
  clearRecent: () => void
  isPinned: (id: FormId) => boolean
}

/**
 * localStorage-backed dock preferences. `recent` is per-year so a returning
 * user picks up where they left off without seeing prior-year forms; `pinned`
 * is global since favorites are durable preferences.
 *
 * SSR-safe: hydrates lazily on first client render via `useEffect` so the
 * initial output matches the server's empty-prefs render.
 */
export function useTaxPreviewPrefs(year: number): UseTaxPreviewPrefsResult {
  const yearKey = String(year)
  const [prefs, setPrefs] = useState<PrefsV1>(EMPTY)

  useEffect(() => {
    setPrefs(readPrefs())
  }, [])

  // Writes always merge with the latest stored prefs. Without this, two
  // hook instances mounted in the same render tree would overwrite each
  // other's changes via stale React state.
  const commit = useCallback((mutate: (current: PrefsV1) => PrefsV1) => {
    const next = mutate(readPrefs())
    writePrefs(next)
    setPrefs(next)
  }, [])

  const addRecent = useCallback(
    (id: FormId): void => {
      commit((current) => {
        const existing = current.recentForms[yearKey] ?? []
        if (existing[0] === id) {
          return current
        }
        const filtered = existing.filter((x) => x !== id)
        return {
          ...current,
          recentForms: { ...current.recentForms, [yearKey]: [id, ...filtered].slice(0, RECENT_CAP) },
        }
      })
    },
    [commit, yearKey],
  )

  const togglePin = useCallback(
    (id: FormId): void => {
      commit((current) =>
        current.pinnedForms.includes(id)
          ? { ...current, pinnedForms: current.pinnedForms.filter((x) => x !== id) }
          : { ...current, pinnedForms: [...current.pinnedForms, id] },
      )
    },
    [commit],
  )

  const clearRecent = useCallback((): void => {
    commit((current) => ({
      ...current,
      recentForms: { ...current.recentForms, [yearKey]: [] },
    }))
  }, [commit, yearKey])

  const isPinned = useCallback((id: FormId): boolean => prefs.pinnedForms.includes(id), [prefs.pinnedForms])

  return {
    recent: prefs.recentForms[yearKey] ?? [],
    pinned: prefs.pinnedForms,
    addRecent,
    togglePin,
    clearRecent,
    isPinned,
  }
}
