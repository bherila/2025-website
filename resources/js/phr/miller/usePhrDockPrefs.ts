import { useCallback, useEffect, useState } from 'react'

import { PHR_MODULE_IDS_SET, type PhrModuleId } from './phrModuleRegistry'

const RECENT_CAP = 5

interface PhrDockPrefs {
  pinned: PhrModuleId[]
  recent: PhrModuleId[]
}

const EMPTY: PhrDockPrefs = { pinned: [], recent: [] }

function storageKeyForPatient(patientId: number): string {
  return `phr-dock-prefs-patient-${patientId}`
}

function isPhrModuleId(value: unknown): value is PhrModuleId {
  return typeof value === 'string' && PHR_MODULE_IDS_SET.has(value)
}

function sanitizeModuleIds(value: unknown): PhrModuleId[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter(isPhrModuleId)
}

function readPrefs(storageKey: string | null): PhrDockPrefs {
  if (storageKey === null || typeof window === 'undefined') {
    return EMPTY
  }

  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) {
      return EMPTY
    }

    const parsed = JSON.parse(raw) as Partial<PhrDockPrefs> | null
    if (!parsed) {
      return EMPTY
    }

    return {
      pinned: sanitizeModuleIds(parsed.pinned),
      recent: sanitizeModuleIds(parsed.recent),
    }
  } catch {
    return EMPTY
  }
}

function writePrefs(storageKey: string | null, prefs: PhrDockPrefs): void {
  if (storageKey === null || typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(prefs))
  } catch {
    /* Preferences are best-effort; ignore quota and serialization failures. */
  }
}

export interface UsePhrDockPrefsResult {
  pinned: PhrModuleId[]
  recent: PhrModuleId[]
  addRecent: (id: PhrModuleId) => void
  togglePin: (id: PhrModuleId) => void
  clearRecent: () => void
  isPinned: (id: PhrModuleId) => boolean
}

export function usePhrDockPrefs(patientId: number | undefined): UsePhrDockPrefsResult {
  const storageKey = patientId === undefined ? null : storageKeyForPatient(patientId)
  const [prefs, setPrefs] = useState<PhrDockPrefs>(EMPTY)

  useEffect(() => {
    setPrefs(readPrefs(storageKey))
  }, [storageKey])

  const commit = useCallback(
    (mutate: (current: PhrDockPrefs) => PhrDockPrefs): void => {
      if (storageKey === null) {
        return
      }

      const next = mutate(readPrefs(storageKey))
      writePrefs(storageKey, next)
      setPrefs(next)
    },
    [storageKey],
  )

  const addRecent = useCallback(
    (id: PhrModuleId): void => {
      commit((current) => {
        if (current.recent[0] === id) {
          return current
        }

        const filtered = current.recent.filter((recentId) => recentId !== id)

        return {
          ...current,
          recent: [id, ...filtered].slice(0, RECENT_CAP),
        }
      })
    },
    [commit],
  )

  const togglePin = useCallback(
    (id: PhrModuleId): void => {
      commit((current) =>
        current.pinned.includes(id)
          ? { ...current, pinned: current.pinned.filter((pinnedId) => pinnedId !== id) }
          : { ...current, pinned: [...current.pinned, id] },
      )
    },
    [commit],
  )

  const clearRecent = useCallback((): void => {
    commit((current) => ({
      ...current,
      recent: [],
    }))
  }, [commit])

  const isPinned = useCallback((id: PhrModuleId): boolean => prefs.pinned.includes(id), [prefs.pinned])

  return {
    pinned: prefs.pinned,
    recent: prefs.recent,
    addRecent,
    togglePin,
    clearRecent,
    isPinned,
  }
}
