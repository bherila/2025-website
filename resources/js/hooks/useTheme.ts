import { useEffect, useLayoutEffect, useState } from 'react'

export type ThemeMode = 'system' | 'dark' | 'light'

const VALID_THEMES: ThemeMode[] = ['system', 'dark', 'light']

export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const isDark = mode === 'dark' || (mode === 'system' && prefersDark)
  root.classList.toggle('dark', isDark)
}

function readStoredTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem('theme') as ThemeMode | null
    return stored && VALID_THEMES.includes(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

function writeStoredTheme(mode: ThemeMode): void {
  try {
    localStorage.setItem('theme', mode)
  } catch {
    // no-op: private browsing or storage quota exceeded
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(readStoredTheme)

  useLayoutEffect(() => {
    applyTheme(theme)
    writeStoredTheme(theme)
  }, [theme])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (readStoredTheme() === 'system') applyTheme('system')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return { theme, setTheme }
}
